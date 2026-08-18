import type { Kysely } from 'kysely';

/**
 * Password reset and email verification, neither of which existed before this
 * migration — `users.email_verified_at` (migration `001`) was written only by
 * the seed script, and a forgotten password had no recovery path at all.
 *
 * Both features need the same shape: a single-use, expiring, HMAC-hashed
 * token, one active token per user per purpose. That is a nullable pair of
 * columns on `users` rather than a separate table, following the precedent
 * `deletion_requested_at` (migration `010`) already set — a second in-flight
 * request of either kind simply overwrites the first, which is correct here:
 * only the newest reset or verification link should work.
 *
 * The token itself is never stored, only its HMAC (see `hashEmailToken` in
 * `modules/auth/tokens.ts`), so a database leak cannot be replayed against
 * either flow — the same reasoning `refresh_tokens.token_hash` and
 * `workspace_invitations.token_hash` already follow.
 *
 * The indexes are partial for the same reason `users_deletion_requested_idx`
 * is: a lookup by token hash only ever asks for rows where one is actually
 * set, which in a healthy database is approximately none of them.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('password_reset_token_hash', 'text')
    .addColumn('password_reset_expires_at', 'timestamptz')
    .addColumn('email_verification_token_hash', 'text')
    .addColumn('email_verification_expires_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('users_password_reset_token_idx')
    .on('users')
    .column('password_reset_token_hash')
    .where('password_reset_token_hash', 'is not', null)
    .execute();

  await db.schema
    .createIndex('users_email_verification_token_idx')
    .on('users')
    .column('email_verification_token_hash')
    .where('email_verification_token_hash', 'is not', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('users_email_verification_token_idx').execute();
  await db.schema.dropIndex('users_password_reset_token_idx').execute();

  await db.schema
    .alterTable('users')
    .dropColumn('email_verification_expires_at')
    .dropColumn('email_verification_token_hash')
    .dropColumn('password_reset_expires_at')
    .dropColumn('password_reset_token_hash')
    .execute();
}
