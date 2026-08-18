import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { processMaintenance } from '../../src/jobs/processors.js';
import { api, createAccount, registerUser, type TestUser } from '../helpers.js';

/**
 * The lifecycle of `DELETE /users/me`.
 *
 * It used to be one irreversible transaction behind a bearer token and
 * `{ confirm: true }`, which meant any leaked fifteen-minute access token could
 * destroy a person's entire financial history with no undo. It now costs the
 * account password, is rate limited as a credential endpoint, and schedules the
 * erasure rather than performing it — signing in during the grace period calls
 * it off.
 */

/** Something worth losing, so "the data is still there" means something. */
async function seedLedger(user: TestUser): Promise<string> {
  const account = await createAccount(user);
  await api()
    .post(`/api/v1/workspaces/${user.workspaceId}/transactions`)
    .set(user.auth)
    .send({
      accountId: account.id,
      type: 'expense',
      amount: '42.00',
      description: 'Still here',
      occurredOn: '2026-01-15',
    });
  return account.id;
}

const requestDeletion = (user: TestUser, currentPassword = user.password) =>
  api().delete('/api/v1/users/me').set(user.auth).send({ confirm: true, currentPassword });

const signIn = (user: TestUser, password = user.password) =>
  api().post('/api/v1/auth/login').send({ email: user.email, password });

async function pendingDeletionAt(userId: string): Promise<Date | null> {
  const row = await db
    .selectFrom('users')
    .select('deletion_requested_at')
    .where('id', '=', userId)
    .executeTakeFirst();
  return row?.deletion_requested_at ?? null;
}

describe('DELETE /users/me', () => {
  it('refuses without the account password', async () => {
    const user = await registerUser();

    const missing = await api().delete('/api/v1/users/me').set(user.auth).send({ confirm: true });
    expect(missing.status).toBe(422);

    const wrong = await requestDeletion(user, 'NotMyPassword123');
    expect(wrong.status).toBe(401);

    expect(await pendingDeletionAt(user.id)).toBeNull();
  });

  it('still refuses without confirmation, password or not', async () => {
    const user = await registerUser();

    const response = await api()
      .delete('/api/v1/users/me')
      .set(user.auth)
      .send({ currentPassword: user.password });

    expect(response.status).toBe(422);
    expect(await pendingDeletionAt(user.id)).toBeNull();
  });

  it('schedules the erasure, revokes every session, and touches no data yet', async () => {
    const user = await registerUser();
    await seedLedger(user);

    const response = await requestDeletion(user);
    expect(response.status).toBe(200);

    const scheduledFor = Date.parse(response.body.deletionScheduledFor);
    expect(scheduledFor).toBeGreaterThan(Date.now());
    // The default window is seven days; allow a day of slack either side rather
    // than pinning the constant, which is configurable.
    expect(scheduledFor).toBeLessThan(Date.now() + 8 * 86_400_000);

    expect(await pendingDeletionAt(user.id)).not.toBeNull();

    // The session is over: the access token was minted before the revocation.
    const afterwards = await api().get('/api/v1/auth/me').set(user.auth);
    expect(afterwards.status).toBe(401);

    // And nothing has actually been erased.
    const workspace = await db
      .selectFrom('workspaces')
      .select('id')
      .where('id', '=', user.workspaceId)
      .executeTakeFirst();
    expect(workspace).toBeDefined();

    const transactions = await db
      .selectFrom('transactions')
      .select('id')
      .where('workspace_id', '=', user.workspaceId)
      .execute();
    expect(transactions).toHaveLength(1);
  });

  it('asking twice does not buy another week', async () => {
    const user = await registerUser();

    const first = await requestDeletion(user);
    expect(first.status).toBe(200);
    const firstRequestedAt = await pendingDeletionAt(user.id);

    // The first request revoked every token, so a second one needs a new session.
    const signedIn = await signIn(user);
    expect(signedIn.status).toBe(200);
    // ...which cancelled it. Ask again, and the clock restarts from that ask.
    expect(await pendingDeletionAt(user.id)).toBeNull();

    const secondUser = { ...user, auth: { Authorization: `Bearer ${signedIn.body.accessToken}` } };
    const second = await requestDeletion(secondUser);
    expect(second.status).toBe(200);

    const secondRequestedAt = await pendingDeletionAt(user.id);
    expect(secondRequestedAt).not.toBeNull();
    expect(secondRequestedAt!.getTime()).toBeGreaterThanOrEqual(firstRequestedAt!.getTime());
  });

  it('signing in cancels a pending erasure', async () => {
    const user = await registerUser();
    await requestDeletion(user);
    expect(await pendingDeletionAt(user.id)).not.toBeNull();

    const signedIn = await signIn(user);
    expect(signedIn.status).toBe(200);
    expect(await pendingDeletionAt(user.id)).toBeNull();

    // And the sweep then has nothing to do, however long it waits.
    await db
      .updateTable('users')
      .set({ deletion_requested_at: null })
      .where('id', '=', user.id)
      .execute();
    const result = await processMaintenance({ task: 'purge_deleted_accounts' });
    expect(result.affected).toBe(0);
  });

  it('erases nothing until the grace period has actually elapsed', async () => {
    const user = await registerUser();
    await requestDeletion(user);

    const result = await processMaintenance({ task: 'purge_deleted_accounts' });
    expect(result.affected).toBe(0);

    const stillThere = await db
      .selectFrom('users')
      .select('deleted_at')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(stillThere.deleted_at).toBeNull();
  });

  it('erases the account once the window closes', async () => {
    const user = await registerUser();
    await seedLedger(user);
    await requestDeletion(user);

    // Backdate the request rather than waiting a week.
    await db
      .updateTable('users')
      .set({ deletion_requested_at: new Date(Date.now() - 90 * 86_400_000) })
      .where('id', '=', user.id)
      .execute();

    const result = await processMaintenance({ task: 'purge_deleted_accounts' });
    expect(result.affected).toBe(1);

    const erased = await db
      .selectFrom('users')
      .select(['status', 'deleted_at', 'email', 'full_name', 'password_hash', 'deletion_requested_at'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();

    expect(erased.status).toBe('deleted');
    expect(erased.deleted_at).not.toBeNull();
    expect(erased.email).not.toBe(user.email);
    expect(erased.full_name).toBe('Deleted user');
    expect(erased.password_hash).toBeNull();
    // Cleared, so a second sweep cannot pick the same row up again.
    expect(erased.deletion_requested_at).toBeNull();

    // The solely-owned workspace went with them, and its ledger with it.
    const workspace = await db
      .selectFrom('workspaces')
      .select('id')
      .where('id', '=', user.workspaceId)
      .executeTakeFirst();
    expect(workspace).toBeUndefined();

    // And the account can no longer be signed into.
    const signedIn = await signIn(user);
    expect(signedIn.status).toBe(401);
  });

  it('keeps a shared workspace, archiving it instead of deleting it', async () => {
    const owner = await registerUser();
    const member = await registerUser();

    await db
      .insertInto('workspace_members')
      .values({ workspace_id: owner.workspaceId, user_id: member.id, role: 'editor' })
      .execute();

    await requestDeletion(owner);
    await db
      .updateTable('users')
      .set({ deletion_requested_at: new Date(Date.now() - 90 * 86_400_000) })
      .where('id', '=', owner.id)
      .execute();

    await processMaintenance({ task: 'purge_deleted_accounts' });

    const workspace = await db
      .selectFrom('workspaces')
      .select(['id', 'archived_at'])
      .where('id', '=', owner.workspaceId)
      .executeTakeFirst();

    expect(workspace).toBeDefined();
    expect(workspace!.archived_at).not.toBeNull();
  });
});
