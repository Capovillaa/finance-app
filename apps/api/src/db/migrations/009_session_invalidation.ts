import type { Kysely } from 'kysely';

/**
 * Makes "sign out everywhere" immediate.
 *
 * Sessions were already revocable — refresh tokens are opaque rows, so dropping
 * one ends a session's ability to renew. What survived was the access token
 * already in the client's hands: a self-contained JWT that no revocation can
 * reach, good until it expires. So logging out every device, changing a
 * password, or deleting an account all left a working credential in circulation
 * for up to `ACCESS_TOKEN_TTL` afterwards.
 *
 * `tokens_valid_from` closes that without giving up what stateless tokens are
 * for. `requireAuth` already reads the user's row on every request to check the
 * account is still active, so comparing the token's issue time against this
 * column costs one more column on a query that was happening anyway — no
 * per-request lookup of a revocation list, no shared cache to keep consistent.
 *
 * NULL means "nothing has been revoked", which is what every existing row wants
 * to say, so the column is nullable rather than defaulted.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').addColumn('tokens_valid_from', 'timestamptz').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('tokens_valid_from').execute();
}
