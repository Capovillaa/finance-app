import type { Kysely } from 'kysely';

/**
 * Makes account erasure recoverable for a while.
 *
 * `DELETE /users/me` hard-deleted every workspace the caller solely owned —
 * accounts, transactions, budgets, goals and all their history — inside one
 * transaction, behind nothing but a bearer token. There was no undo, and the
 * only thing standing between a leaked fifteen-minute access token and a
 * person's entire financial record was a `{ "confirm": true }` body.
 *
 * The request now schedules the erasure instead of performing it:
 * `deletion_requested_at` is stamped, every session is revoked, and a
 * maintenance task performs the real erasure once the grace period
 * (`ACCOUNT_DELETION_GRACE_DAYS`) has passed. Signing in again clears the
 * column, which is what makes "I did not ask for that" a recoverable state
 * rather than a support ticket about a database backup.
 *
 * NULL means "no deletion pending", which is what every existing row wants to
 * say, so the column is nullable rather than defaulted — the same shape as
 * `tokens_valid_from` in migration 009.
 *
 * The index is partial because the sweeping query only ever asks for rows where
 * the column is set, and in a healthy database that is approximately none of
 * them.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').addColumn('deletion_requested_at', 'timestamptz').execute();

  await db.schema
    .createIndex('users_deletion_requested_idx')
    .on('users')
    .column('deletion_requested_at')
    .where('deletion_requested_at', 'is not', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('users_deletion_requested_idx').execute();
  await db.schema.alterTable('users').dropColumn('deletion_requested_at').execute();
}
