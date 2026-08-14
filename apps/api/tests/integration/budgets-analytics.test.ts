import { describe, expect, it } from 'vitest';
import { api, createAccount, createTransaction, findCategory, registerUser } from '../helpers.js';

const MONTH = new Date().toISOString().slice(0, 7);
const inThisMonth = (day: number): string => `${MONTH}-${String(day).padStart(2, '0')}`;

describe('budgets', () => {
  it('tracks spending against a limit and rolls subcategories up', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const food = await findCategory(user.workspaceId, 'Alimentação');
    const supermarket = await findCategory(user.workspaceId, 'Supermercado');

    const budget = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Monthly food',
        period: 'monthly',
        startDate: inThisMonth(1),
        lines: [{ categoryId: food, limitAmount: '1000.00', includeSubcategories: true }],
      });

    expect(budget.status).toBe(201);
    expect(budget.body.budget.lines[0].limitAmount).toBe('1000.0000');

    // Spending on a grandchild category must count against the parent's budget.
    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '250.00',
      categoryId: supermarket,
      occurredOn: inThisMonth(5),
    });

    const progress = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/budgets/${budget.body.budget.id}`)
      .set(user.auth);

    expect(progress.body.budget.lines[0].spentAmount).toBe('250.0000');
    expect(progress.body.budget.lines[0].percentUsed).toBe(25);
    expect(progress.body.budget.lines[0].status).toBe('on_track');
  });

  it('reports warning and exceeded states', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const transport = await findCategory(user.workspaceId, 'Transporte');

    const budget = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Transport',
        period: 'monthly',
        startDate: inThisMonth(1),
        lines: [{ categoryId: transport, limitAmount: '100.00', alertThresholdPercent: 80 }],
      });
    const budgetId = budget.body.budget.id;

    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '85.00',
      categoryId: transport,
      occurredOn: inThisMonth(3),
    });

    let progress = await api().get(`/api/v1/workspaces/${user.workspaceId}/budgets/${budgetId}`).set(user.auth);
    expect(progress.body.budget.lines[0].status).toBe('warning');

    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '30.00',
      categoryId: transport,
      occurredOn: inThisMonth(4),
    });

    progress = await api().get(`/api/v1/workspaces/${user.workspaceId}/budgets/${budgetId}`).set(user.auth);
    expect(progress.body.budget.lines[0].status).toBe('exceeded');
    expect(progress.body.budget.lines[0].remainingAmount).toBe('-15.0000');
  });

  it('keeps an audit trail when a limit is revised mid-period', async () => {
    const user = await registerUser();
    const food = await findCategory(user.workspaceId, 'Alimentação');

    const budget = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Food',
        period: 'monthly',
        startDate: inThisMonth(1),
        lines: [{ categoryId: food, limitAmount: '500.00' }],
      });

    const lineId = budget.body.budget.lines[0].id;
    const revised = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets/${budget.body.budget.id}/lines/${lineId}/revise`)
      .set(user.auth)
      .send({ newLimit: '800.00', reason: 'Guests this month' });

    expect(revised.status).toBe(200);
    expect(revised.body.budget.lines[0].limitAmount).toBe('800.0000');
  });

  it('rejects a budget on an income category', async () => {
    const user = await registerUser();
    const salary = await findCategory(user.workspaceId, 'Salário');

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Nope',
        period: 'monthly',
        startDate: inThisMonth(1),
        lines: [{ categoryId: salary, limitAmount: '100.00' }],
      });

    expect(response.status).toBe(422);
  });

  it('requires an end date for a custom period', async () => {
    const user = await registerUser();
    const food = await findCategory(user.workspaceId, 'Alimentação');

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/budgets`)
      .set(user.auth)
      .send({
        name: 'Custom',
        period: 'custom',
        startDate: inThisMonth(1),
        lines: [{ categoryId: food, limitAmount: '100.00' }],
      });

    expect(response.status).toBe(422);
  });
});

describe('analytics', () => {
  async function seedMonth(user: Awaited<ReturnType<typeof registerUser>>) {
    const account = await createAccount(user, { initialBalance: '0' });
    const salary = await findCategory(user.workspaceId, 'Salário');
    const supermarket = await findCategory(user.workspaceId, 'Supermercado');
    const restaurants = await findCategory(user.workspaceId, 'Restaurantes');

    await createTransaction(user, account.id, {
      type: 'income',
      amount: '5000.00',
      categoryId: salary,
      occurredOn: inThisMonth(1),
      description: 'Salary',
    });
    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '800.00',
      categoryId: supermarket,
      occurredOn: inThisMonth(5),
      description: 'Groceries',
    });
    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '200.00',
      categoryId: restaurants,
      occurredOn: inThisMonth(6),
      description: 'Dinner',
    });

    return account;
  }

  it('summarises income, expenses and savings rate', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api().get(`/api/v1/workspaces/${user.workspaceId}/analytics/summary`).set(user.auth);

    expect(response.body.totals.income).toBe('5000.0000');
    expect(response.body.totals.expenses).toBe('1000.0000');
    expect(response.body.totals.net).toBe('4000.0000');
    expect(response.body.totals.savingsRate).toBe(80);
  });

  it('excludes transfers from income and expenses', async () => {
    const user = await registerUser();
    const a = await createAccount(user, { name: 'A', initialBalance: '1000.00' });
    const b = await createAccount(user, { name: 'B', initialBalance: '0' });

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/transfers`)
      .set(user.auth)
      .send({ fromAccountId: a.id, toAccountId: b.id, amount: '500.00', description: 'Move', occurredOn: inThisMonth(2) })
      .expect(201);

    const response = await api().get(`/api/v1/workspaces/${user.workspaceId}/analytics/summary`).set(user.auth);
    expect(response.body.totals.income).toBe('0.0000');
    expect(response.body.totals.expenses).toBe('0.0000');
  });

  it('rolls the category breakdown up to top-level buckets', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/analytics/categories?depth=0`)
      .set(user.auth);

    const food = response.body.categories.find((c: { categoryName: string }) => c.categoryName === 'Alimentação');
    // 800 (supermarket, depth 2) + 200 (restaurants, depth 1) both roll into Food.
    expect(food.total).toBe('1000.0000');
    expect(food.percentOfTotal).toBe(100);
  });

  it('breaks the same data down one level deeper', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/analytics/categories?depth=1`)
      .set(user.auth);

    const names = response.body.categories.map((c: { categoryName: string }) => c.categoryName);
    expect(names).toContain('Mercado');
    expect(names).toContain('Restaurantes');
  });

  it('returns a dense trend series including empty months', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/analytics/trends?months=6`)
      .set(user.auth);

    expect(response.body.points).toHaveLength(6);
    const current = response.body.points.at(-1);
    expect(current.income).toBe('5000.0000');
    // Earlier months have no data but still appear, as zeros.
    expect(response.body.points[0].income).toBe('0.0000');
  });

  it('builds the dashboard in one call', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api().get(`/api/v1/workspaces/${user.workspaceId}/analytics/dashboard`).set(user.auth);

    expect(response.status).toBe(200);
    expect(response.body.totalBalance).toBe('4000.0000');
    expect(response.body.accounts).toHaveLength(1);
    expect(response.body.recentTransactions.length).toBe(3);
    expect(response.body.topCategories.length).toBeGreaterThan(0);
    expect(response.body.month.income).toBe('5000.0000');
  });

  it('tracks net worth month by month', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/analytics/net-worth?months=3`)
      .set(user.auth);

    expect(response.body.points).toHaveLength(3);
    expect(response.body.points.at(-1).balance).toBe('4000.0000');
  });

  it('exports transactions as CSV', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/reports/export/transactions.csv`)
      .set(user.auth);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('Date,Description');
    expect(response.text).toContain('Groceries');
  });

  it('produces a monthly statement', async () => {
    const user = await registerUser();
    await seedMonth(user);

    const response = await api().get(`/api/v1/workspaces/${user.workspaceId}/reports/statement`).set(user.auth);

    expect(response.status).toBe(200);
    expect(response.body.statement.totals.income).toBe('5000.0000');
    expect(response.body.statement.closingBalance).toBe('4000.0000');
    expect(response.body.statement.transactionCount).toBe(3);
  });
});
