import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { addDays, today } from '../../src/lib/dates.js';
import { evaluateWorkspaceAlerts } from '../../src/modules/alerts/engine.js';
import { api, createAccount, createTransaction, findCategory, registerUser } from '../helpers.js';

const MONTH = new Date().toISOString().slice(0, 7);
const inThisMonth = (day: number): string => `${MONTH}-${String(day).padStart(2, '0')}`;

async function notificationsFor(userId: string, type?: string) {
  let query = db.selectFrom('notifications').selectAll().where('user_id', '=', userId);
  if (type) query = query.where('type', '=', type);
  return query.execute();
}

describe('recurring transactions', () => {
  it('materialises due occurrences and stops double-creating them', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '0' });
    const rent = await findCategory(user.workspaceId, 'Aluguel');

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring`)
      .set(user.auth)
      .send({
        accountId: account.id,
        categoryId: rent,
        name: 'Aluguel',
        type: 'expense',
        amount: '2500.00',
        description: 'Aluguel do apartamento',
        frequency: 'monthly',
        startDate: '2026-01-05',
        autoPost: true,
      });

    expect(created.status).toBe(201);
    expect(created.body.recurring.nextOccurrenceOn).toBe('2026-01-05');
    expect(created.body.recurring.summary).toBe('Monthly on day 5');

    const first = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring/${created.body.recurring.id}/materialize`)
      .set(user.auth)
      .send({ through: '2026-03-31' });

    expect(first.body.created).toBe(3);

    // Running again must be a no-op, not three more rent charges.
    const second = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring/${created.body.recurring.id}/materialize`)
      .set(user.auth)
      .send({ through: '2026-03-31' });

    expect(second.body.created).toBe(0);

    const transactions = await db
      .selectFrom('transactions')
      .selectAll()
      .where('recurring_transaction_id', '=', created.body.recurring.id)
      .execute();
    expect(transactions).toHaveLength(3);
    expect(transactions.every((t) => t.status === 'cleared')).toBe(true);
  });

  it('creates unconfirmed rows when auto-post is off', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring`)
      .set(user.auth)
      .send({
        accountId: account.id,
        name: 'Internet',
        type: 'expense',
        amount: '120.00',
        description: 'Internet bill',
        frequency: 'monthly',
        startDate: '2026-01-20',
        autoPost: false,
      });

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring/${created.body.recurring.id}/materialize`)
      .set(user.auth)
      .send({ through: '2026-01-31' });

    const row = await db
      .selectFrom('transactions')
      .selectAll()
      .where('recurring_transaction_id', '=', created.body.recurring.id)
      .executeTakeFirstOrThrow();

    expect(row.status).toBe('scheduled');

    // Scheduled bills must not touch the balance until confirmed.
    const account_ = await db
      .selectFrom('accounts')
      .select('current_balance')
      .where('id', '=', account.id)
      .executeTakeFirstOrThrow();
    expect(account_.current_balance).toBe('1000.0000');
  });

  it('previews upcoming occurrences', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring`)
      .set(user.auth)
      .send({
        accountId: account.id,
        name: 'Weekly',
        type: 'expense',
        amount: '50.00',
        description: 'Weekly expense',
        frequency: 'weekly',
        startDate: '2026-01-05',
      });

    const detail = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/recurring/${created.body.recurring.id}`)
      .set(user.auth);

    expect(detail.body.upcoming).toHaveLength(12);
    expect(detail.body.upcoming[0]).toBe('2026-01-05');
    expect(detail.body.upcoming[1]).toBe('2026-01-12');
  });
});

describe('alert evaluation', () => {
  it('raises a budget-exceeded alert once, not on every scan', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const transport = await findCategory(user.workspaceId, 'Transporte');

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Transport',
        period: 'monthly',
        startDate: inThisMonth(1),
        lines: [{ categoryId: transport, limitAmount: '100.00' }],
      });

    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '150.00',
      categoryId: transport,
      occurredOn: inThisMonth(2),
    });

    const first = await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));
    expect(first.byType.budget_exceeded).toBe(1);

    // Dedupe keys make repeated scans idempotent.
    const second = await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));
    expect(second.byType.budget_exceeded ?? 0).toBe(0);

    const alerts = await notificationsFor(user.id, 'budget_exceeded');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.severity).toBe('critical');
    // The message itself is rendered in the recipient's own language (a new
    // user defaults to pt-BR), so assert on the structured payload rather than
    // English wording.
    const data = alerts[0]!.data as { spent: string; limit: string };
    expect(data.spent).toBe('150.0000');
    expect(data.limit).toBe('100.0000');
  });

  it('warns before the limit is reached', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const food = await findCategory(user.workspaceId, 'Alimentação');

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Food',
        period: 'monthly',
        startDate: inThisMonth(1),
        lines: [{ categoryId: food, limitAmount: '1000.00', alertThresholdPercent: 80 }],
      });

    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '850.00',
      categoryId: food,
      occurredOn: inThisMonth(2),
    });

    const summary = await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));
    expect(summary.byType.budget_threshold).toBe(1);
    expect(summary.byType.budget_exceeded ?? 0).toBe(0);
  });

  it('flags a large transaction', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '5000.00',
      description: 'New laptop',
      occurredOn: today('UTC'),
    });

    await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));

    const alerts = await notificationsFor(user.id, 'large_transaction');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.message).toContain('New laptop');
  });

  it('flags a probable duplicate', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    for (let i = 0; i < 2; i += 1) {
      await createTransaction(user, account.id, {
        type: 'expense',
        amount: '59.90',
        description: 'Padaria Central',
        occurredOn: today('UTC'),
      });
    }

    await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));

    const alerts = await notificationsFor(user.id, 'duplicate_transaction');
    expect(alerts).toHaveLength(1);
  });

  it('warns about a bill coming due', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const dueOn = addDays(today('UTC'), 2);
    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/recurring`)
      .set(user.auth)
      .send({
        accountId: account.id,
        name: 'Energia',
        type: 'expense',
        amount: '300.00',
        description: 'Conta de luz',
        frequency: 'monthly',
        startDate: dueOn,
      });

    await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));

    const alerts = await notificationsFor(user.id, 'bill_due');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.message).toContain('Energia');
  });

  it('warns on a low balance but ignores credit cards', async () => {
    const user = await registerUser();
    await createAccount(user, { name: 'Conta corrente', type: 'checking', initialBalance: '25.00' });
    await createAccount(user, { name: 'Cartão', type: 'credit_card', initialBalance: '-2000.00' });

    await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));

    const alerts = await notificationsFor(user.id, 'low_balance');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.title).toContain('Conta corrente');
  });

  it('respects a disabled rule', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/alerts`)
      .set(user.auth)
      .send({ type: 'large_transaction', isEnabled: false })
      .expect(200);

    await createTransaction(user, account.id, { type: 'expense', amount: '9000.00', occurredOn: today('UTC') });
    await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));

    expect(await notificationsFor(user.id, 'large_transaction')).toHaveLength(0);
  });

  it('honours a custom threshold', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/alerts`)
      .set(user.auth)
      .send({ type: 'large_transaction', config: { minAmount: '50.0000', multipleOfAverage: 100 } })
      .expect(200);

    await createTransaction(user, account.id, { type: 'expense', amount: '60.00', occurredOn: today('UTC') });
    await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));

    expect(await notificationsFor(user.id, 'large_transaction')).toHaveLength(1);
  });

  it('rejects a config value with no bound on it (M-3 in AUDIT_REPORT.md)', async () => {
    const user = await registerUser();

    const hugeLookback = await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/alerts`)
      .set(user.auth)
      .send({ type: 'large_transaction', config: { lookbackDays: 1_000_000 } });
    expect(hugeLookback.status).toBe(422);

    const unboundedMilestones = await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/alerts`)
      .set(user.auth)
      .send({ type: 'goal_milestone', config: { milestones: Array(500).fill(1) } });
    expect(unboundedMilestones.status).toBe(422);

    // A field that belongs to a different alert type's config is rejected
    // too, not silently ignored.
    const wrongTypeField = await api()
      .put(`/api/v1/workspaces/${user.workspaceId}/alerts`)
      .set(user.auth)
      .send({ type: 'bill_due', config: { thresholdPercent: 80 } });
    expect(wrongTypeField.status).toBe(422);
  });

  it('notifies every member of a shared workspace', async () => {
    const owner = await registerUser();
    const member = await registerUser();

    const shared = await api().post('/api/v1/workspaces').set(owner.auth).send({ name: 'Casa', type: 'shared' });
    const workspaceId = shared.body.workspace.id;

    await api()
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set(owner.auth)
      .send({ email: member.email, role: 'editor' });

    const { sentInTests } = await import('../../src/lib/email.js');
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentInTests.at(-1)?.text ?? '')?.[1];
    await api().post('/api/v1/invitations/accept').set(member.auth).send({ token });

    const account = await api()
      .post(`/api/v1/workspaces/${workspaceId}/accounts`)
      .set(owner.auth)
      .send({ name: 'Conjunta', type: 'checking', currency: 'BRL', initialBalance: '10.00' });

    await api()
      .post(`/api/v1/workspaces/${workspaceId}/transactions`)
      .set(owner.auth)
      .send({
        accountId: account.body.account.id,
        type: 'expense',
        amount: '8000.00',
        description: 'Reforma',
        occurredOn: today('UTC'),
      });

    await evaluateWorkspaceAlerts(workspaceId, today('UTC'));

    expect(await notificationsFor(owner.id, 'large_transaction')).toHaveLength(1);
    expect(await notificationsFor(member.id, 'large_transaction')).toHaveLength(1);
  });
});

describe('notifications inbox', () => {
  it('lists, counts and marks notifications read', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    await createTransaction(user, account.id, { type: 'expense', amount: '9000.00', occurredOn: today('UTC') });
    await evaluateWorkspaceAlerts(user.workspaceId, today('UTC'));

    const list = await api().get('/api/v1/notifications').set(user.auth);
    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBeGreaterThan(0);

    const id = list.body.items[0].id;
    await api().post(`/api/v1/notifications/${id}/read`).set(user.auth).expect(204);

    const after = await api().get('/api/v1/notifications?unreadOnly=true').set(user.auth);
    expect(after.body.items.map((n: { id: string }) => n.id)).not.toContain(id);
  });

  it('keeps one user out of another user\'s inbox', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const account = await createAccount(alice);
    await createTransaction(alice, account.id, { type: 'expense', amount: '9000.00', occurredOn: today('UTC') });
    await evaluateWorkspaceAlerts(alice.workspaceId, today('UTC'));

    const response = await api().get('/api/v1/notifications').set(bob.auth);
    expect(response.body.items).toHaveLength(0);
  });
});

describe('goals', () => {
  it('tracks contributions and closes the goal when the target is met', async () => {
    const user = await registerUser();

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/goals`)
      .set(user.auth)
      .send({ name: 'Reserva de emergência', category: 'emergency_fund', targetAmount: '10000.00' });

    expect(created.status).toBe(201);
    expect(created.body.goal.progressPercent).toBe(0);

    const goalId = created.body.goal.id;

    const partial = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/goals/${goalId}/contributions`)
      .set(user.auth)
      .send({ amount: '2500.00' });

    expect(partial.body.goal.currentAmount).toBe('2500.0000');
    expect(partial.body.goal.progressPercent).toBe(25);
    expect(partial.body.goal.status).toBe('active');

    const completed = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/goals/${goalId}/contributions`)
      .set(user.auth)
      .send({ amount: '7500.00' });

    expect(completed.body.goal.status).toBe('achieved');
    expect(completed.body.goal.achievedAt).toBeTruthy();
    expect(completed.body.goal.remainingAmount).toBe('0.0000');
  });

  it('reverses the total when a contribution is deleted', async () => {
    const user = await registerUser();
    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/goals`)
      .set(user.auth)
      .send({ name: 'Viagem', targetAmount: '5000.00' });

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/goals/${created.body.goal.id}/contributions`)
      .set(user.auth)
      .send({ amount: '1000.00' });

    const detail = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/goals/${created.body.goal.id}`)
      .set(user.auth);
    const contributionId = detail.body.contributions[0].id;

    await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/goals/${created.body.goal.id}/contributions/${contributionId}`)
      .set(user.auth)
      .expect(204);

    const after = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/goals/${created.body.goal.id}`)
      .set(user.auth);
    expect(after.body.goal.currentAmount).toBe('0.0000');
  });

  it('rejects a target date in the past', async () => {
    const user = await registerUser();
    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/goals`)
      .set(user.auth)
      .send({ name: 'Late', targetAmount: '100.00', targetDate: '2020-01-01' });

    expect(response.status).toBe(422);
  });
});
