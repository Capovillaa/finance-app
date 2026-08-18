import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { invalidCredentials, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { recordActivity } from '../activity/service.js';
import { verifyPassword } from '../auth/password.js';
import { revokeAllUserTokens } from '../auth/tokens.js';

/**
 * Everything the platform holds about one person, for the GDPR export
 * endpoint. Scoped to workspaces the user belongs to, and deliberately excludes
 * other members' personal details.
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const user = await db
    .selectFrom('users')
    .select([
      'id',
      'email',
      'full_name',
      'locale',
      'timezone',
      'base_currency',
      'created_at',
      'last_login_at',
    ])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();

  const memberships = await db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select([
      'workspaces.id as workspace_id',
      'workspaces.name as workspace_name',
      'workspace_members.role as role',
      'workspace_members.joined_at as joined_at',
    ])
    .where('workspace_members.user_id', '=', userId)
    .execute();

  const workspaceIds = memberships.map((m) => m.workspace_id);
  const empty: never[] = [];

  const [transactions, comments, notifications, splits] = await Promise.all([
    workspaceIds.length
      ? db
          .selectFrom('transactions')
          .select([
            'id',
            'workspace_id',
            'occurred_on',
            'description',
            'amount',
            'currency',
            'type',
            'status',
            'created_at',
          ])
          .where('workspace_id', 'in', workspaceIds)
          .where('created_by', '=', userId)
          .execute()
      : empty,
    workspaceIds.length
      ? db
          .selectFrom('transaction_comments')
          .select(['id', 'transaction_id', 'body', 'created_at'])
          .where('user_id', '=', userId)
          .execute()
      : empty,
    db
      .selectFrom('notifications')
      .select(['id', 'type', 'title', 'message', 'created_at', 'read_at'])
      .where('user_id', '=', userId)
      .execute(),
    db
      .selectFrom('transaction_splits')
      .select(['id', 'transaction_id', 'share_amount', 'settled_at'])
      .where('user_id', '=', userId)
      .execute(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    workspaces: memberships,
    transactionsCreated: transactions,
    comments,
    notifications,
    expenseShares: splits,
  };
}

// ---------------------------------------------------------------------------
// Account erasure
// ---------------------------------------------------------------------------

/**
 * Instant arithmetic, deliberately not `lib/dates.ts`'s `addDays`: that one
 * works on a calendar date string (`DateOnly`) for a ledger, and a grace period
 * is a duration between two instants.
 */
const MS_PER_DAY = 86_400_000;
const plusDays = (at: Date, days: number): Date => new Date(at.getTime() + days * MS_PER_DAY);

/**
 * Schedules the caller's erasure, rather than performing it.
 *
 * The request used to be the erasure: one transaction that hard-deleted every
 * solely-owned workspace and everything hanging off it, behind a bearer token
 * and a `{ confirm: true }` body. Two things changed. It now costs the account
 * password, because any path that yields a fifteen-minute access token — a
 * borrowed session, a leaked token, a future XSS — was otherwise enough to
 * destroy someone's whole financial history; and it is scheduled rather than
 * immediate, so a mistake is recoverable for `ACCOUNT_DELETION_GRACE_DAYS`.
 *
 * Every session is revoked at the same time. That is deliberate: the request is
 * "I am leaving", the client signs out, and **signing back in cancels it** —
 * which is the whole undo mechanism, and needs no second endpoint or emailed
 * token to work from any device the person can still authenticate on.
 */
export async function requestAccountDeletion(
  userId: string,
  currentPassword: string,
): Promise<{ deletionScheduledFor: Date }> {
  const user = await db
    .selectFrom('users')
    .select(['id', 'password_hash', 'deletion_requested_at'])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) throw notFound('resources.user');
  if (!user.password_hash) throw invalidCredentials('auth.noPasswordSet');

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) throw invalidCredentials('auth.wrongCurrentPassword');

  // Asking twice does not extend the countdown: the first request is the one
  // the person made, and re-requesting must not quietly buy another week.
  const requestedAt = user.deletion_requested_at ?? new Date();

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('users')
      .set({ deletion_requested_at: requestedAt })
      .where('id', '=', userId)
      .execute();
    await revokeAllUserTokens(userId, trx);
  });

  await recordActivity({
    actorUserId: userId,
    action: 'user.deletion_requested',
    entityType: 'user',
    entityId: userId,
    summary: 'Account erasure requested',
    auditOnly: true,
  });

  return { deletionScheduledFor: plusDays(requestedAt, env.ACCOUNT_DELETION_GRACE_DAYS) };
}

/**
 * Cancels a pending erasure. Called from the login path, on the reasoning that
 * proving you can still sign in is proof enough that you want the account —
 * and it is the one action a person in that state is certain to attempt.
 *
 * Returns whether anything was pending, so the caller can decide whether the
 * event is worth recording.
 */
export async function cancelAccountDeletion(userId: string): Promise<boolean> {
  const result = await db
    .updateTable('users')
    .set({ deletion_requested_at: null })
    .where('id', '=', userId)
    .where('deletion_requested_at', 'is not', null)
    .executeTakeFirst();

  const cancelled = Number(result.numUpdatedRows) > 0;

  if (cancelled) {
    await recordActivity({
      actorUserId: userId,
      action: 'user.deletion_cancelled',
      entityType: 'user',
      entityId: userId,
      summary: 'Account erasure cancelled by signing in',
      auditOnly: true,
    });
  }

  return cancelled;
}

/**
 * The erasure itself, once the grace period has run out.
 *
 * A workspace the user owns alone goes with them; a shared one is archived
 * instead, because deleting it would take other people's records with it. The
 * user row is anonymised rather than dropped so that history in those shared
 * workspaces — who created a transaction, who commented — stays coherent.
 */
export async function eraseAccount(userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const owned = await trx
      .selectFrom('workspaces')
      .select('id')
      .where('owner_id', '=', userId)
      .where('archived_at', 'is', null)
      .execute();

    for (const workspace of owned) {
      const otherMembers = await trx
        .selectFrom('workspace_members')
        .select('user_id')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '<>', userId)
        .execute();

      if (otherMembers.length === 0) {
        await trx.deleteFrom('workspaces').where('id', '=', workspace.id).execute();
      } else {
        await trx
          .updateTable('workspaces')
          .set({ archived_at: new Date() })
          .where('id', '=', workspace.id)
          .execute();
      }
    }

    await trx
      .updateTable('users')
      .set({
        status: 'deleted',
        deleted_at: new Date(),
        deletion_requested_at: null,
        email: `deleted+${userId}@finance.local`,
        full_name: 'Deleted user',
        password_hash: null,
        avatar_url: null,
      })
      .where('id', '=', userId)
      .execute();

    await revokeAllUserTokens(userId, trx);
  });

  await recordActivity({
    actorUserId: userId,
    action: 'user.deleted',
    entityType: 'user',
    entityId: userId,
    summary: 'Account erased after the grace period',
    auditOnly: true,
  });
}

/**
 * Erases every account whose grace period has elapsed. Runs daily from the
 * maintenance queue.
 *
 * One account at a time, each in its own transaction, so one workspace that
 * fails to delete cannot strand the rest of the batch — and a failure is logged
 * and skipped rather than thrown, because a retried job would otherwise stop on
 * the same row forever.
 */
export async function purgeDueAccountDeletions(): Promise<number> {
  const cutoff = plusDays(new Date(), -env.ACCOUNT_DELETION_GRACE_DAYS);

  const due = await db
    .selectFrom('users')
    .select('id')
    .where('deletion_requested_at', 'is not', null)
    .where('deletion_requested_at', '<=', cutoff)
    .where('deleted_at', 'is', null)
    .execute();

  let erased = 0;
  for (const user of due) {
    try {
      await eraseAccount(user.id);
      erased += 1;
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to erase an account past its grace period');
    }
  }

  return erased;
}
