import { sql, type Kysely } from 'kysely';

/**
 * "Sign in with Google": one nullable column on `users` holding Google's `sub`
 * claim, the stable per-account identifier its ID tokens carry.
 *
 * `password_hash` has been nullable since migration `001`, so an account that
 * only ever arrives through Google simply never gets one — nothing else needed
 * changing for that to work. `login` already refuses a user with no hash
 * (spending the same bcrypt work either way, so the absence of a password is
 * not observable), and `changePassword` says so explicitly with
 * `auth.noPasswordSet`.
 *
 * The index is partial for the same reason `users_password_reset_token_idx` is:
 * a lookup by `google_id` only ever asks for rows where one is set, and in a
 * password-first deployment that is none of them. It is also *unique*, which is
 * the constraint that matters — one Google account must not be able to reach
 * two local accounts, and `loginWithGoogle` relies on that when it links a
 * `sub` onto an existing address rather than checking for a race itself.
 *
 * `deleted_at` is deliberately not part of the predicate, unlike
 * `users_email_unique`. A soft-deleted account releases its *address* so the
 * person can sign up again; releasing the Google `sub` as well would let the
 * new account silently inherit the old one's identity link, and the address is
 * already the thing being reclaimed.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').addColumn('google_id', 'text').execute();

  await sql`
    CREATE UNIQUE INDEX users_google_id_unique ON users (google_id) WHERE google_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('users_google_id_unique').execute();
  await db.schema.alterTable('users').dropColumn('google_id').execute();
}
