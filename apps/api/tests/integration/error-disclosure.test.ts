import { describe, expect, it } from 'vitest';
import { api, registerUser } from '../helpers.js';

/**
 * What a rejected request tells the caller about the database behind it.
 *
 * The unit tests beside this one pin the mapping; these drive a real Postgres
 * violation through the whole stack, because that is the only way to see what
 * actually reaches the wire. Every assertion below failed before H-1's fix — a
 * duplicate account name answered with
 * `Key (workspace_id, lower(name))=(01a0…, savings) already exists.`, which
 * names an index, a column expression, and a workspace id.
 */

/** Fragments that only ever come from Postgres's own `detail` string. */
const POSTGRES_TELLS = [
  'Key (',
  'already exists.',
  'is not present in table',
  'Failing row contains',
  'violates',
  'constraint',
  'workspace_id',
  'lower(name)',
];

function expectNoDatabaseInternals(body: unknown): void {
  const serialised = JSON.stringify(body);
  for (const tell of POSTGRES_TELLS) {
    expect(serialised).not.toContain(tell);
  }
}

/**
 * The same sentence in the three shipped languages. Which one comes back
 * depends on the signed-in user's stored `locale` — `requireAuth` overwrites
 * whatever `Accept-Language` asked for — and a registration defaults to pt-BR,
 * so a test that wants a particular language has to say so (see the last case).
 */
const CONFLICT_MESSAGES = [
  'A record with these values already exists',
  'Já existe um registro com esses valores',
  'Ya existe un registro con estos valores',
];

describe('database errors reaching a client', () => {
  it('answers a unique violation generically, naming nothing', async () => {
    const user = await registerUser();
    const account = {
      name: 'Savings',
      type: 'savings',
      currency: 'BRL',
      openingBalance: '100.00',
    };

    const first = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts`)
      .set(user.auth)
      .send(account);
    expect(first.status).toBe(201);

    const duplicate = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts`)
      .set(user.auth)
      .send(account);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('conflict');
    expect(CONFLICT_MESSAGES).toContain(duplicate.body.error.message);
    expect(duplicate.body.error.requestId).toBeTruthy();
    expectNoDatabaseInternals(duplicate.body);
  });

  it('answers a foreign-key violation without naming the table it looked in', async () => {
    const user = await registerUser();

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions`)
      .set(user.auth)
      .send({
        accountId: '01a00000-0000-7000-8000-000000000000',
        type: 'expense',
        amount: '10.00',
        description: 'Nowhere',
        occurredOn: '2026-01-01',
      });

    expect([404, 422]).toContain(response.status);
    expectNoDatabaseInternals(response.body);
  });

  it('renders the message in the caller’s language, which a raw detail could not be', async () => {
    const user = await registerUser();
    // A registration defaults to pt-BR, so ask for English explicitly — this is
    // the half of the fix that is a gain rather than a subtraction: the sentence
    // now comes from the catalogue, so it can be translated at all.
    await api().patch('/api/v1/users/me').set(user.auth).send({ locale: 'en' });

    const account = { name: 'Duplicada', type: 'checking', currency: 'BRL' };
    await api().post(`/api/v1/workspaces/${user.workspaceId}/accounts`).set(user.auth).send(account);
    const duplicate = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts`)
      .set(user.auth)
      .send(account);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe('A record with these values already exists');
  });

  it('never returns a stack trace', async () => {
    const user = await registerUser();
    const account = { name: 'Stackless', type: 'checking', currency: 'BRL' };

    await api().post(`/api/v1/workspaces/${user.workspaceId}/accounts`).set(user.auth).send(account);
    const duplicate = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts`)
      .set(user.auth)
      .send(account);

    expect(duplicate.body.error.stack).toBeUndefined();
  });
});
