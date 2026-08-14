import { db, type Executor } from '../../db/client.js';
import { logger } from '../../lib/logger.js';
import { buildPage, offsetOf, type Page, type Pagination } from '../../lib/http.js';

export interface RecordActivityInput {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Record<string, unknown>;
  /** Audit-only rows stay out of the collaboration feed (logins, token refreshes). */
  auditOnly?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  executor?: Executor;
}

/**
 * Appends to the audit log. Never throws: losing an audit line must not roll
 * back the financial write it describes, but it must be visible in the logs.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  const executor = input.executor ?? db;
  try {
    await executor
      .insertInto('activity_events')
      .values({
        workspace_id: input.workspaceId ?? null,
        actor_user_id: input.actorUserId ?? null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        summary: input.summary,
        changes: JSON.stringify(input.changes ?? {}),
        is_audit_only: input.auditOnly ?? false,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
      })
      .execute();
  } catch (err) {
    logger.error({ err, action: input.action }, 'Failed to record activity event');
  }
}

/** Shallow diff of the fields a caller actually changed, for the audit trail. */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const prev = before[key];
    if (String(prev) !== String(next)) changes[key] = { from: prev ?? null, to: next };
  }
  return changes;
}

export interface ActivityFeedFilters {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  includeAudit?: boolean;
}

export interface ActivityFeedItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes: Record<string, unknown>;
  createdAt: Date;
  actor: { id: string; fullName: string; avatarUrl: string | null } | null;
}

export async function listActivity(
  workspaceId: string,
  filters: ActivityFeedFilters,
  pagination: Pagination,
): Promise<Page<ActivityFeedItem>> {
  let query = db
    .selectFrom('activity_events')
    .leftJoin('users', 'users.id', 'activity_events.actor_user_id')
    .where('activity_events.workspace_id', '=', workspaceId);

  if (!filters.includeAudit) query = query.where('activity_events.is_audit_only', '=', false);
  if (filters.entityType) query = query.where('activity_events.entity_type', '=', filters.entityType);
  if (filters.entityId) query = query.where('activity_events.entity_id', '=', filters.entityId);
  if (filters.actorUserId) query = query.where('activity_events.actor_user_id', '=', filters.actorUserId);

  const [rows, countRow] = await Promise.all([
    query
      .select([
        'activity_events.id as id',
        'activity_events.action as action',
        'activity_events.entity_type as entity_type',
        'activity_events.entity_id as entity_id',
        'activity_events.summary as summary',
        'activity_events.changes as changes',
        'activity_events.created_at as created_at',
        'users.id as actor_id',
        'users.full_name as actor_name',
        'users.avatar_url as actor_avatar',
      ])
      .orderBy('activity_events.created_at', 'desc')
      .orderBy('activity_events.id', 'desc')
      .limit(pagination.pageSize)
      .offset(offsetOf(pagination))
      .execute(),
    query
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirst(),
  ]);

  const items: ActivityFeedItem[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    changes: (row.changes ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    actor: row.actor_id
      ? { id: row.actor_id, fullName: row.actor_name ?? '', avatarUrl: row.actor_avatar }
      : null,
  }));

  return buildPage(items, Number(countRow?.count ?? 0), pagination);
}
