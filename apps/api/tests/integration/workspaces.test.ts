import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { sentInTests } from '../../src/lib/email.js';
import { api, createAccount, registerUser } from '../helpers.js';

describe('workspace isolation', () => {
  it('hides another user\'s workspace entirely', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const response = await api().get(`/api/v1/workspaces/${alice.workspaceId}`).set(bob.auth);
    expect(response.status).toBe(403);

    const listed = await api().get('/api/v1/workspaces').set(bob.auth);
    expect(listed.body.workspaces.map((w: { id: string }) => w.id)).not.toContain(alice.workspaceId);
  });

  it('blocks writes into another user\'s workspace', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const response = await api()
      .post(`/api/v1/workspaces/${alice.workspaceId}/accounts`)
      .set(bob.auth)
      .send({ name: 'Sneaky', type: 'checking', currency: 'BRL' });

    expect(response.status).toBe(403);
  });

  it('never leaks another workspace\'s transactions through the list endpoint', async () => {
    const alice = await registerUser();
    const account = await createAccount(alice);
    await api()
      .post(`/api/v1/workspaces/${alice.workspaceId}/transactions`)
      .set(alice.auth)
      .send({ accountId: account.id, type: 'expense', amount: '10.00', description: 'Secret', occurredOn: '2026-01-01' });

    const bob = await registerUser();
    const response = await api().get(`/api/v1/workspaces/${bob.workspaceId}/transactions`).set(bob.auth);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
  });
});

describe('workspace creation', () => {
  it('creates a shared workspace with the caller as owner', async () => {
    const user = await registerUser();
    const response = await api()
      .post('/api/v1/workspaces')
      .set(user.auth)
      .send({ name: 'Família Souza', type: 'shared', baseCurrency: 'BRL' });

    expect(response.status).toBe(201);
    expect(response.body.workspace.role).toBe('owner');
    expect(response.body.workspace.type).toBe('shared');
  });
});

describe('invitations and roles', () => {
  async function inviteAndAccept(role: 'admin' | 'editor' | 'viewer') {
    const owner = await registerUser();
    const invitee = await registerUser();

    const shared = await api()
      .post('/api/v1/workspaces')
      .set(owner.auth)
      .send({ name: `Shared ${role}`, type: 'shared' });
    const workspaceId = shared.body.workspace.id;

    const invitation = await api()
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set(owner.auth)
      .send({ email: invitee.email, role });
    expect(invitation.status).toBe(201);
    // Under NODE_ENV=test, `sendEmail` always resolves true — see lib/email.ts
    // — so this is the happy path for P-5's `emailDelivered` signal; the
    // failure branch is not reachable from this suite by design.
    expect(invitation.body.emailDelivered).toBe(true);

    // The token only exists in the email; that is what makes the link a secret.
    const email = sentInTests.at(-1);
    expect(email?.to).toBe(invitee.email);
    const token = /token=([A-Za-z0-9_-]+)/.exec(email?.text ?? '')?.[1];
    expect(token).toBeTruthy();

    const accepted = await api().post('/api/v1/invitations/accept').set(invitee.auth).send({ token });
    expect(accepted.status).toBe(200);

    return { owner, invitee, workspaceId, token: token! };
  }

  it('lets an invited editor add transactions', async () => {
    const { owner, invitee, workspaceId } = await inviteAndAccept('editor');

    const account = await api()
      .post(`/api/v1/workspaces/${workspaceId}/accounts`)
      .set(owner.auth)
      .send({ name: 'Conta Conjunta', type: 'checking', currency: 'BRL' });

    const created = await api()
      .post(`/api/v1/workspaces/${workspaceId}/transactions`)
      .set(invitee.auth)
      .send({
        accountId: account.body.account.id,
        type: 'expense',
        amount: '75.50',
        description: 'Mercado',
        occurredOn: '2026-03-01',
      });

    expect(created.status).toBe(201);
    expect(created.body.transaction.createdBy).toBe(invitee.id);
  });

  it('stops a viewer from writing but lets them read', async () => {
    const { owner, invitee, workspaceId } = await inviteAndAccept('viewer');

    await api()
      .post(`/api/v1/workspaces/${workspaceId}/accounts`)
      .set(owner.auth)
      .send({ name: 'Conta', type: 'checking', currency: 'BRL' });

    const read = await api().get(`/api/v1/workspaces/${workspaceId}/accounts`).set(invitee.auth);
    expect(read.status).toBe(200);
    expect(read.body.accounts).toHaveLength(1);

    const write = await api()
      .post(`/api/v1/workspaces/${workspaceId}/accounts`)
      .set(invitee.auth)
      .send({ name: 'Nope', type: 'checking', currency: 'BRL' });
    expect(write.status).toBe(403);
  });

  it('stops an editor from managing members', async () => {
    const { invitee, workspaceId } = await inviteAndAccept('editor');

    const response = await api()
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set(invitee.auth)
      .send({ email: 'someone@example.com', role: 'viewer' });

    expect(response.status).toBe(403);
  });

  it('refuses an invitation addressed to somebody else', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();

    const shared = await api().post('/api/v1/workspaces').set(owner.auth).send({ name: 'Private', type: 'shared' });

    await api()
      .post(`/api/v1/workspaces/${shared.body.workspace.id}/invitations`)
      .set(owner.auth)
      .send({ email: 'intended@example.com', role: 'editor' });

    const token = /token=([A-Za-z0-9_-]+)/.exec(sentInTests.at(-1)?.text ?? '')?.[1];
    const response = await api().post('/api/v1/invitations/accept').set(stranger.auth).send({ token });

    expect(response.status).toBe(422);
  });

  it('rejects a token that has already been used', async () => {
    const { invitee, token } = await inviteAndAccept('editor');
    const replay = await api().post('/api/v1/invitations/accept').set(invitee.auth).send({ token });
    expect(replay.status).toBe(422);
  });
});

describe('ownership', () => {
  it('transfers ownership and demotes the previous owner to admin', async () => {
    const owner = await registerUser();
    const member = await registerUser();

    const shared = await api().post('/api/v1/workspaces').set(owner.auth).send({ name: 'Team', type: 'shared' });
    const workspaceId = shared.body.workspace.id;

    await api()
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set(owner.auth)
      .send({ email: member.email, role: 'admin' });
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentInTests.at(-1)?.text ?? '')?.[1];
    await api().post('/api/v1/invitations/accept').set(member.auth).send({ token });

    const response = await api()
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .set(owner.auth)
      .send({ newOwnerId: member.id });
    expect(response.status).toBe(204);

    const roles = await db
      .selectFrom('workspace_members')
      .select(['user_id', 'role'])
      .where('workspace_id', '=', workspaceId)
      .execute();

    expect(roles.find((r) => r.user_id === member.id)?.role).toBe('owner');
    expect(roles.find((r) => r.user_id === owner.id)?.role).toBe('admin');
  });

  it('refuses to archive the only personal workspace', async () => {
    const user = await registerUser();
    const response = await api().delete(`/api/v1/workspaces/${user.workspaceId}`).set(user.auth);
    expect(response.status).toBe(409);
  });
});

describe('activity feed', () => {
  it('records workspace actions and keeps audit rows out of the feed', async () => {
    const user = await registerUser();
    await createAccount(user, { name: 'Nubank' });

    const response = await api().get(`/api/v1/workspaces/${user.workspaceId}/activity`).set(user.auth);

    expect(response.status).toBe(200);
    const actions = response.body.items.map((item: { action: string }) => item.action);
    expect(actions).toContain('account.created');
    // Logins are audit-only and must not appear in the collaboration feed.
    expect(actions).not.toContain('auth.login');
  });
});
