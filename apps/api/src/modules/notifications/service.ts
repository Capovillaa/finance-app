import { db, type Executor } from '../../db/client.js';
import type { NotificationChannel, NotificationSeverity } from '../../db/types.js';
import { notFound } from '../../lib/errors.js';
import { buildPage, offsetOf, type Page, type Pagination } from '../../lib/http.js';
import { resolveLocale, type Locale } from '../../lib/i18n.js';
import { logger } from '../../lib/logger.js';

export interface NotificationRecord {
  id: string;
  workspaceId: string | null;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  userId: string;
  workspaceId?: string | null;
  type: string;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /**
   * Idempotency key. Alert scans run repeatedly over the same data, so without
   * this a user would be notified about the same overspend every few minutes.
   */
  dedupeKey?: string | null;
  channels?: NotificationChannel[];
  executor?: Executor;
}

/** Returns null when the notification was suppressed as a duplicate. */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationRecord | null> {
  const executor = input.executor ?? db;

  const row = await executor
    .insertInto('notifications')
    .values({
      user_id: input.userId,
      workspace_id: input.workspaceId ?? null,
      type: input.type,
      severity: input.severity ?? 'info',
      title: input.title,
      message: input.message,
      data: JSON.stringify(input.data ?? {}),
      dedupe_key: input.dedupeKey ?? null,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst();

  if (!row) return null;

  const channels = input.channels ?? ['in_app'];
  await executor
    .insertInto('notification_deliveries')
    .values(
      channels.map((channel) => ({
        notification_id: row.id,
        channel,
        // In-app delivery is the row itself, so it is already done.
        status: channel === 'in_app' ? ('sent' as const) : ('pending' as const),
        last_attempt_at: channel === 'in_app' ? new Date() : null,
      })),
    )
    .onConflict((oc) => oc.doNothing())
    .execute();

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    data: (row.data ?? {}) as Record<string, unknown>,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export interface NotifyWorkspaceInput extends Omit<CreateNotificationInput, 'userId' | 'workspaceId' | 'title' | 'message'> {
  /**
   * Builds the title and message in a specific recipient's locale. Workspace
   * members do not all share one language, so the content cannot be resolved
   * once and reused — each member gets their own rendering of the same event.
   */
  content: (locale: Locale) => { title: string; message: string };
}

/** Fans one alert out to every member of a workspace, respecting per-user roles. */
export async function notifyWorkspace(workspaceId: string, input: NotifyWorkspaceInput): Promise<number> {
  const members = await db
    .selectFrom('workspace_members')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .select(['workspace_members.user_id as user_id', 'users.locale as locale'])
    .where('workspace_id', '=', workspaceId)
    .execute();

  const { content, ...rest } = input;

  let created = 0;
  for (const member of members) {
    const { title, message } = content(resolveLocale(member.locale));
    const notification = await createNotification({
      ...rest,
      title,
      message,
      userId: member.user_id,
      workspaceId,
      // Scope the dedupe key per user so one member reading it does not
      // suppress everyone else's copy.
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${member.user_id}` : null,
    });
    if (notification) created += 1;
  }

  if (created > 0) logger.debug({ workspaceId, type: input.type, created }, 'Workspace notified');
  return created;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
  workspaceId?: string;
  type?: string;
}

export async function listNotifications(
  userId: string,
  filters: NotificationFilters,
  pagination: Pagination,
): Promise<Page<NotificationRecord> & { unreadCount: number }> {
  let query = db.selectFrom('notifications').where('user_id', '=', userId);
  if (filters.unreadOnly) query = query.where('read_at', 'is', null);
  if (filters.workspaceId) query = query.where('workspace_id', '=', filters.workspaceId);
  if (filters.type) query = query.where('type', '=', filters.type);

  const [rows, countRow, unreadRow] = await Promise.all([
    query
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(pagination.pageSize)
      .offset(offsetOf(pagination))
      .execute(),
    query.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirst(),
    db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst(),
  ]);

  const items: NotificationRecord[] = rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    data: (row.data ?? {}) as Record<string, unknown>,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));

  return {
    ...buildPage(items, Number(countRow?.count ?? 0), pagination),
    unreadCount: Number(unreadRow?.count ?? 0),
  };
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  const result = await db
    .updateTable('notifications')
    .set({ read_at: new Date() })
    .where('user_id', '=', userId)
    .where('id', '=', notificationId)
    .where('read_at', 'is', null)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0) === 0) {
    const exists = await db
      .selectFrom('notifications')
      .select('id')
      .where('user_id', '=', userId)
      .where('id', '=', notificationId)
      .executeTakeFirst();
    if (!exists) throw notFound('resources.notification');
  }
}

export async function markAllRead(userId: string, workspaceId?: string): Promise<number> {
  let query = db
    .updateTable('notifications')
    .set({ read_at: new Date() })
    .where('user_id', '=', userId)
    .where('read_at', 'is', null);
  if (workspaceId) query = query.where('workspace_id', '=', workspaceId);

  const result = await query.executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
}

export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  const result = await db
    .deleteFrom('notifications')
    .where('user_id', '=', userId)
    .where('id', '=', notificationId)
    .executeTakeFirst();
  if (Number(result.numDeletedRows ?? 0) === 0) throw notFound('resources.notification');
}

/** Pending non-in-app deliveries, consumed by the email/push worker. */
export async function pendingDeliveries(channel: NotificationChannel, limit = 100) {
  return db
    .selectFrom('notification_deliveries')
    .innerJoin('notifications', 'notifications.id', 'notification_deliveries.notification_id')
    .innerJoin('users', 'users.id', 'notifications.user_id')
    .select([
      'notification_deliveries.id as delivery_id',
      'notification_deliveries.attempts as attempts',
      'notifications.title as title',
      'notifications.message as message',
      'notifications.severity as severity',
      'notifications.data as data',
      'users.email as email',
      'users.full_name as full_name',
      'users.locale as locale',
    ])
    .where('notification_deliveries.channel', '=', channel)
    .where('notification_deliveries.status', '=', 'pending')
    .where('notification_deliveries.attempts', '<', 5)
    .orderBy('notification_deliveries.created_at', 'asc')
    .limit(limit)
    .execute();
}

/**
 * Records the outcome of a delivery attempt. Leaving the status as `pending`
 * while incrementing `attempts` is what schedules a retry; `failed` retires the
 * row for good.
 */
export async function markDelivery(
  deliveryId: string,
  status: 'sent' | 'failed' | 'skipped' | 'pending',
  error?: string,
): Promise<void> {
  await db
    .updateTable('notification_deliveries')
    .set((eb) => ({
      status,
      error: error ?? null,
      attempts: eb('notification_deliveries.attempts', '+', 1),
      last_attempt_at: new Date(),
    }))
    .where('id', '=', deliveryId)
    .execute();
}
