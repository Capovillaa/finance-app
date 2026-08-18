import { describe, expect, it } from 'vitest';
import { sentInTests } from '../../src/lib/email.js';
import { createNotification } from '../../src/modules/notifications/service.js';
import {
  api,
  createAccount,
  createTransaction,
  findCategory,
  isoDate,
  registerUser,
  seedExchangeRates,
} from '../helpers.js';

/*
 * Finding what is missing:
 *   RESPONSE_REACH=1 npx vitest run 2>&1 | grep -o "REACH .*" | sort -u
 * lists every declaration the suite reaches. Anything declared and absent from
 * that list belongs here.
 */

/**
 * One successful call to every endpoint that declares a response schema.
 *
 * `responds()` parses each response against its declaration under
 * `NODE_ENV=test`, so a request that comes back 200 here has had its whole body
 * checked field by field — that is what these tests are for, and it is why they
 * assert so little themselves. What they guarantee is *reach*: a schema nothing
 * ever exercises is an assertion nobody made, and the rest of the suite happens
 * to drive most of the failure paths and only some of the success ones.
 *
 * Add a case here whenever a module gains response schemas, for the endpoints
 * the domain tests do not already succeed against.
 */

describe('accounts', () => {
  it('describes the account list, one account, and both reconciliation shapes', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '500.00' });
    await createTransaction(user, account.id, { type: 'expense', amount: '100.00', occurredOn: '2026-03-10' });

    const list = await api().get(`/api/v1/workspaces/${user.workspaceId}/accounts`).set(user.auth);
    expect(list.status).toBe(200);
    expect(list.body.accounts).toHaveLength(1);
    expect(list.body.totalBalance).toBe('400.0000');

    const one = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/accounts/${account.id}`)
      .set(user.auth);
    expect(one.status).toBe(200);

    const reconciled = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts/${account.id}/reconciliations`)
      .set(user.auth)
      .send({ statementDate: '2026-03-31', statementBalance: '400.00', notes: 'March statement' });
    expect(reconciled.status).toBe(201);

    // The stored row carries `notes` and `completedAt`, which the result of the
    // run does not — two schemas, and only this call reaches the first.
    const history = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/accounts/${account.id}/reconciliations`)
      .set(user.auth);
    expect(history.status).toBe(200);
    expect(history.body.reconciliations).toHaveLength(1);
    expect(history.body.reconciliations[0].notes).toBe('March statement');
  });

  it('describes an archived account, whose fields are all nullable at once', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const archived = await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/accounts/${account.id}`)
      .set(user.auth)
      .send({ isArchived: true, institution: null, color: null, icon: null });

    expect(archived.status).toBe(200);
    expect(archived.body.account.isArchived).toBe(true);
    expect(archived.body.account.institution).toBeNull();
  });

  it('describes a credit card, the one account type that carries a limit', async () => {
    const user = await registerUser();

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts`)
      .set(user.auth)
      .send({
        name: 'Card',
        type: 'credit_card',
        currency: 'BRL',
        creditLimit: '5000.00',
        statementDay: 10,
        dueDay: 20,
      });

    expect(created.status).toBe(201);
    expect(created.body.account.creditLimit).toBe('5000.0000');

    // An account with no history is deleted outright rather than archived.
    const deleted = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/accounts/${created.body.account.id}`)
      .set(user.auth);
    expect(deleted.status).toBe(204);
  });
});

describe('categories', () => {
  it('describes both shapes the list endpoint can return', async () => {
    const user = await registerUser();

    const tree = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/categories?shape=tree`)
      .set(user.auth);
    expect(tree.status).toBe(200);
    expect(tree.body.categories[0].children).toBeDefined();

    const flat = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/categories?shape=flat`)
      .set(user.auth);
    expect(flat.status).toBe(200);
    expect(flat.body.categories[0].children).toBeUndefined();
    expect(flat.body.categories.length).toBeGreaterThan(tree.body.categories.length);
  });

  it('describes the default template, which is nodes rather than rows', async () => {
    const user = await registerUser();

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/categories/template`)
      .set(user.auth);

    expect(response.status).toBe(200);
    expect(response.body.template.length).toBeGreaterThan(0);
    expect(response.body.template[0].id).toBeUndefined();
  });

  it('describes a created, updated and deleted category', async () => {
    const user = await registerUser();
    const food = await findCategory(user.workspaceId, 'Alimentação');

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/categories`)
      .set(user.auth)
      .send({ name: 'Bakery', parentId: food, color: '#123456' });
    expect(created.status).toBe(201);
    expect(created.body.category.depth).toBe(1);

    const updated = await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/categories/${created.body.category.id}`)
      .set(user.auth)
      .send({ name: 'Padaria', isArchived: true });
    expect(updated.status).toBe(200);
    expect(updated.body.category.name).toBe('Padaria');

    const deleted = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/categories/${created.body.category.id}`)
      .set(user.auth);
    expect(deleted.status).toBe(204);
    expect(deleted.body).toEqual({});
  });
});

describe('transactions', () => {
  it('describes the detail view, which carries splits and comments alongside the row', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const transaction = await createTransaction(user, account.id, { type: 'expense', amount: '80.00' });

    await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}/splits`)
      .set(user.auth)
      .send({ splits: [{ userId: user.id, note: 'my half' }] });

    const comment = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}/comments`)
      .set(user.auth)
      .send({ body: 'Checked against the receipt.' });
    expect(comment.status).toBe(201);

    const detail = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}`)
      .set(user.auth);

    expect(detail.status).toBe(200);
    expect(detail.body.splits).toHaveLength(1);
    expect(detail.body.comments).toHaveLength(1);
    // The joined names and the tag list are the fields create/update omit.
    expect(detail.body.transaction.accountName).toBeDefined();
    expect(detail.body.transaction.tags).toEqual([]);

    const settled = await api()
      .post(
        `/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}/splits/${detail.body.splits[0].id}/settle`,
      )
      .set(user.auth)
      .send({ settled: true });
    expect(settled.status).toBe(204);

    const removed = await api()
      .delete(
        `/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}/comments/${comment.body.comment.id}`,
      )
      .set(user.auth);
    expect(removed.status).toBe(204);
  });

  it('describes a bulk recategorisation, which returns a count rather than rows', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const groceries = await findCategory(user.workspaceId, 'Mercado');
    const first = await createTransaction(user, account.id, { description: 'One' });
    const second = await createTransaction(user, account.id, { description: 'Two' });

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/bulk-categorize`)
      .set(user.auth)
      .send({ transactionIds: [first.id, second.id], categoryId: groceries });

    expect(response.status).toBe(200);
    expect(response.body.updated).toBe(2);
  });
});

describe('budgets', () => {
  it('describes the list, an edit, a line added and removed, a rollover and a delete', async () => {
    const user = await registerUser();
    const groceries = await findCategory(user.workspaceId, 'Mercado');
    const restaurants = await findCategory(user.workspaceId, 'Restaurantes');

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'March',
        period: 'monthly',
        startDate: '2026-03-01',
        rollover: true,
        lines: [{ categoryId: groceries, limitAmount: '800.00' }],
      });
    expect(created.status).toBe(201);

    const listed = await api().get(`/api/v1/workspaces/${user.workspaceId}/budgets`).set(user.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.budgets).toHaveLength(1);

    const renamed = await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/budgets/${created.body.budget.id}`)
      .set(user.auth)
      .send({ name: 'March (revised)' });
    expect(renamed.status).toBe(200);

    // Adding a line returns the whole budget: the totals above it have moved.
    const withLine = await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/budgets/${created.body.budget.id}/lines`)
      .set(user.auth)
      .send({ categoryId: restaurants, limitAmount: '300.00' });
    expect(withLine.status).toBe(200);
    expect(withLine.body.budget.lines).toHaveLength(2);

    const addedLine = withLine.body.budget.lines.find(
      (line: { categoryId: string }) => line.categoryId === restaurants,
    );
    const withoutLine = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/budgets/${created.body.budget.id}/lines/${addedLine.id}`)
      .set(user.auth);
    expect(withoutLine.status).toBe(204);

    const next = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets/${created.body.budget.id}/rollover`)
      .set(user.auth);
    expect(next.status).toBe(201);
    expect(next.body.budget.startDate).toBe('2026-04-01');

    const deleted = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/budgets/${created.body.budget.id}`)
      .set(user.auth);
    expect(deleted.status).toBe(204);
  });
});

describe('goals', () => {
  it('describes the list, a status change and a delete', async () => {
    const user = await registerUser();

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/goals`)
      .set(user.auth)
      .send({ name: 'Emergency fund', targetAmount: '10000.00', targetDate: '2027-01-01' });
    expect(created.status).toBe(201);
    expect(created.body.goal.requiredMonthlyContribution).not.toBeNull();

    const listed = await api().get(`/api/v1/workspaces/${user.workspaceId}/goals`).set(user.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.goals).toHaveLength(1);

    // `achievedAt` is only ever non-null on this path, so the nullable timestamp
    // is exercised both ways.
    const achieved = await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/goals/${created.body.goal.id}`)
      .set(user.auth)
      .send({ status: 'achieved' });
    expect(achieved.status).toBe(200);
    expect(achieved.body.goal.achievedAt).not.toBeNull();

    const deleted = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/goals/${created.body.goal.id}`)
      .set(user.auth);
    expect(deleted.status).toBe(204);
  });
});

describe('recurring', () => {
  it('describes the list, an edit and a delete', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const groceries = await findCategory(user.workspaceId, 'Mercado');

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring`)
      .set(user.auth)
      .send({
        accountId: account.id,
        categoryId: groceries,
        name: 'Rent',
        type: 'expense',
        amount: '2000.00',
        description: 'Rent',
        frequency: 'monthly',
        dayOfMonth: 5,
        startDate: '2026-03-05',
      });
    expect(created.status).toBe(201);
    // The stored value is signed, unlike the magnitude the request carried.
    expect(created.body.recurring.amount).toBe('-2000.0000');

    const listed = await api().get(`/api/v1/workspaces/${user.workspaceId}/recurring`).set(user.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.recurring[0].accountName).toBeDefined();
    // Joined alongside the account name. It was not, until the generated client
    // types made the Recurring screen's silent `undefined` a compile error.
    expect(listed.body.recurring[0].categoryName).toBe('Mercado');

    const detail = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/recurring/${created.body.recurring.id}`)
      .set(user.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.recurring.categoryName).toBe('Mercado');
    expect(detail.body.upcoming.length).toBeGreaterThan(0);

    const paused = await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/recurring/${created.body.recurring.id}`)
      .set(user.auth)
      .send({ isActive: false });
    expect(paused.status).toBe(200);
    expect(paused.body.recurring.isActive).toBe(false);

    const deleted = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/recurring/${created.body.recurring.id}`)
      .set(user.auth);
    expect(deleted.status).toBe(204);
  });
});

describe('tags', () => {
  it('describes a created tag, the list with its usage count, and the delete', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/tags`)
      .set(user.auth)
      .send({ name: 'travel', color: '#336699' });
    expect(created.status).toBe(201);
    // `usageCount` is a listing-only join; the create response omits it.
    expect(created.body.tag.usageCount).toBeUndefined();

    await createTransaction(user, account.id, {});
    const listed = await api().get(`/api/v1/workspaces/${user.workspaceId}/tags`).set(user.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.tags[0].usageCount).toBe(0);

    const deleted = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/tags/${created.body.tag.id}`)
      .set(user.auth);
    expect(deleted.status).toBe(204);
  });
});

describe('auth and the account', () => {
  it('describes both ways a session ends', async () => {
    const user = await registerUser();

    const logout = await api().post('/api/v1/auth/logout').send({ refreshToken: user.refreshToken });
    expect(logout.status).toBe(204);

    const again = await registerUser();
    const all = await api().post('/api/v1/auth/logout-all').set(again.auth).send();
    expect(all.status).toBe(204);
  });

  it('describes a profile edit, the data export and the erasure', async () => {
    const user = await registerUser();

    const updated = await api()
      .patch('/api/v1/users/me')
      .set(user.auth)
      .send({ fullName: 'Renamed Person', locale: 'es', avatarUrl: null });
    expect(updated.status).toBe(200);
    expect(updated.body.user.fullName).toBe('Renamed Person');

    // Not modelled as a schema — it is a file whose shape follows the database.
    const exported = await api().get('/api/v1/users/me/export').set(user.auth);
    expect(exported.status).toBe(200);
    expect(exported.headers['content-disposition']).toContain('attachment');

    // Scheduled, not performed: the erasure needs the password, and answers
    // with when it will actually happen.
    const erased = await api()
      .delete('/api/v1/users/me')
      .set(user.auth)
      .send({ confirm: true, currentPassword: user.password });
    expect(erased.status).toBe(200);
    expect(Date.parse(erased.body.deletionScheduledFor)).toBeGreaterThan(Date.now());
  });
});

describe('workspaces', () => {
  it('describes the list, creation, the single read and an admin edit', async () => {
    const user = await registerUser();

    const created = await api()
      .post('/api/v1/workspaces')
      .set(user.auth)
      .send({ name: 'Household', type: 'shared', baseCurrency: 'USD' });
    expect(created.status).toBe(201);
    expect(created.body.workspace.role).toBe('owner');

    const listed = await api().get('/api/v1/workspaces').set(user.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.workspaces).toHaveLength(2);

    const one = await api().get(`/api/v1/workspaces/${created.body.workspace.id}`).set(user.auth);
    expect(one.status).toBe(200);

    const renamed = await api()
      .patch(`/api/v1/workspaces/${created.body.workspace.id}`)
      .set(user.auth)
      .send({ name: 'Household budget', settings: { theme: 'dark' } });
    expect(renamed.status).toBe(200);
    expect(renamed.body.workspace.settings).toEqual({ theme: 'dark' });

    // Archiving is the owner-only delete; the row survives with `archivedAt` set.
    const archived = await api()
      .delete(`/api/v1/workspaces/${created.body.workspace.id}`)
      .set(user.auth);
    expect(archived.status).toBe(204);
  });

  it('describes members and invitations through a real invite/accept cycle', async () => {
    const owner = await registerUser();
    const invitee = await registerUser();

    const invited = await api()
      .post(`/api/v1/workspaces/${owner.workspaceId}/invitations`)
      .set(owner.auth)
      .send({ email: invitee.email, role: 'editor' });
    expect(invited.status).toBe(201);

    const pending = await api()
      .get(`/api/v1/workspaces/${owner.workspaceId}/invitations`)
      .set(owner.auth);
    expect(pending.status).toBe(200);
    expect(pending.body.invitations).toHaveLength(1);

    // The token only ever exists in the email — that is what makes it a secret.
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentInTests.at(-1)?.text ?? '')?.[1];
    const accepted = await api().post('/api/v1/invitations/accept').set(invitee.auth).send({ token });
    expect(accepted.status).toBe(200);
    expect(accepted.body.role).toBe('editor');

    const members = await api().get(`/api/v1/workspaces/${owner.workspaceId}/members`).set(owner.auth);
    expect(members.status).toBe(200);
    expect(members.body.members).toHaveLength(2);

    const promoted = await api()
      .patch(`/api/v1/workspaces/${owner.workspaceId}/members/${invitee.id}`)
      .set(owner.auth)
      .send({ role: 'admin' });
    expect(promoted.status).toBe(204);

    const removed = await api()
      .delete(`/api/v1/workspaces/${owner.workspaceId}/members/${invitee.id}`)
      .set(owner.auth);
    expect(removed.status).toBe(204);

    const second = await api()
      .post(`/api/v1/workspaces/${owner.workspaceId}/invitations`)
      .set(owner.auth)
      .send({ email: 'someone.else@example.com', role: 'viewer' });
    const revoked = await api()
      .delete(`/api/v1/workspaces/${owner.workspaceId}/invitations/${second.body.invitation.id}`)
      .set(owner.auth);
    expect(revoked.status).toBe(204);
  });
});

describe('notifications', () => {
  it('describes the inbox, marking all read and a delete', async () => {
    const user = await registerUser();

    const created = await createNotification({
      userId: user.id,
      workspaceId: user.workspaceId,
      type: 'budget_threshold',
      severity: 'warning',
      title: 'Groceries at 85%',
      message: 'You have spent R$ 680 of R$ 800.',
      data: { budgetId: null, percentUsed: 85 },
    });
    expect(created).not.toBeNull();

    const inbox = await api().get('/api/v1/notifications').set(user.auth);
    expect(inbox.status).toBe(200);
    expect(inbox.body.unreadCount).toBe(1);

    const readAll = await api().post('/api/v1/notifications/read-all').set(user.auth).send({});
    expect(readAll.status).toBe(200);
    expect(readAll.body.updated).toBe(1);

    const deleted = await api().delete(`/api/v1/notifications/${created!.id}`).set(user.auth);
    expect(deleted.status).toBe(204);
  });
});

describe('alerts', () => {
  it('describes the rule list, an on-demand scan and a rule removed', async () => {
    const user = await registerUser();

    const upserted = await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/alerts`)
      .set(user.auth)
      .send({ type: 'low_balance', config: { minBalance: '100.00' }, channels: ['in_app'] });
    expect(upserted.status).toBe(200);

    const listed = await api().get(`/api/v1/workspaces/${user.workspaceId}/alerts`).set(user.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.rules.map((rule: { id: string }) => rule.id)).toContain(upserted.body.rule.id);

    const scanned = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/alerts/evaluate`)
      .set(user.auth)
      .send();
    expect(scanned.status).toBe(200);
    expect(scanned.body.workspaceId).toBe(user.workspaceId);

    const removed = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/alerts/${upserted.body.rule.id}`)
      .set(user.auth);
    expect(removed.status).toBe(204);
  });
});

describe('currencies', () => {
  it('describes the supported list and a rate, including the trivial one', async () => {
    const user = await registerUser();
    await seedExchangeRates();

    const listed = await api().get('/api/v1/currencies').set(user.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.currencies.length).toBeGreaterThan(0);

    const converted = await api()
      .get('/api/v1/currencies/rate?from=BRL&to=USD&asOf=2026-01-01')
      .set(user.auth);
    expect(converted.status).toBe(200);
    // NUMERIC comes back with whatever scale Postgres kept, not a fixed one —
    // which is exactly why the schema describes a decimal string rather than a
    // fixed number of places.
    expect(Number(converted.body.rate)).toBe(0.2);

    // Same currency short-circuits to exactly "1" — a decimal string, not a number.
    const identity = await api().get('/api/v1/currencies/rate?from=BRL&to=BRL').set(user.auth);
    expect(identity.status).toBe(200);
    expect(identity.body.rate).toBe('1');
  });
});

describe('analytics and reports', () => {
  it('describes every series and comparison the charts read', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '5000.00' });
    const groceries = await findCategory(user.workspaceId, 'Mercado');
    await createTransaction(user, account.id, { type: 'income', amount: '4000.00', occurredOn: isoDate() });
    await createTransaction(user, account.id, { type: 'expense', amount: '900.00', categoryId: groceries, occurredOn: isoDate() });

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Current',
        period: 'monthly',
        startDate: `${isoDate().slice(0, 7)}-01`,
        lines: [{ categoryId: groceries, limitAmount: '800.00' }],
      });

    const paths = [
      'analytics/savings-rate',
      'analytics/budget-variance',
      'analytics/compare',
      'analytics/insights',
      'reports/year-over-year',
    ];

    for (const path of paths) {
      const response = await api().get(`/api/v1/workspaces/${user.workspaceId}/${path}`).set(user.auth);
      expect(response.status, path).toBe(200);
    }

    // The budget is overspent, so `budget-variance` has a row to describe rather
    // than an empty array that would exercise none of the fields.
    const variance = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/analytics/budget-variance`)
      .set(user.auth);
    expect(variance.body.rows[0].status).toBe('over');
  });

  it('describes the statement export, which is a file rather than a schema', async () => {
    const user = await registerUser();

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/reports/export/statement.csv`)
      .set(user.auth);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
  });
});

describe('the service routes', () => {
  it('describes liveness, readiness and the document itself', async () => {
    const live = await api().get('/health');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');

    // Readiness declares 200 and 503 with the same body; which one comes back
    // depends on whether Redis is up, and both are checked against the schema.
    const ready = await api().get('/health/ready');
    expect([200, 503]).toContain(ready.status);
    expect(ready.body.database).toBe('ok');

    const document = await api().get('/openapi.json');
    expect(document.status).toBe(200);
    expect(document.body.openapi).toBe('3.1.0');
  });

  it('exposes Prometheus metrics, including a route this same request just recorded', async () => {
    await api().get('/health');
    const metrics = await api().get('/metrics');

    expect(metrics.status).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('http_requests_total');
    expect(metrics.text).toContain('pg_pool_total_connections');
    expect(metrics.text).toContain('redis_connected');
    // The /health call above should already have posted a series for its own
    // route — proving the middleware's route-pattern label actually fires,
    // not just that the registry exists.
    expect(metrics.text).toMatch(/http_requests_total\{[^}]*route="\/health"/);
  });
});
