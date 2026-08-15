import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { api, createAccount, createTransaction, findCategory, registerUser, seedExchangeRates } from '../helpers.js';

async function balanceOf(accountId: string): Promise<string> {
  const row = await db
    .selectFrom('accounts')
    .select('current_balance')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
  return row.current_balance;
}

describe('account balances', () => {
  it('starts at the opening balance', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });
    expect(await balanceOf(account.id)).toBe('1000.0000');
  });

  it('moves with income and expenses', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });

    await createTransaction(user, account.id, { type: 'expense', amount: '250.50' });
    expect(await balanceOf(account.id)).toBe('749.5000');

    await createTransaction(user, account.id, { type: 'income', amount: '500.00' });
    expect(await balanceOf(account.id)).toBe('1249.5000');
  });

  it('reverses the balance when a transaction is deleted, and restores it', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '100.00' });
    const transaction = await createTransaction(user, account.id, { type: 'expense', amount: '40.00' });
    expect(await balanceOf(account.id)).toBe('60.0000');

    await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}`)
      .set(user.auth)
      .expect(204);
    expect(await balanceOf(account.id)).toBe('100.0000');

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}/restore`)
      .set(user.auth)
      .expect(204);
    expect(await balanceOf(account.id)).toBe('60.0000');
  });

  it('hides a deleted row until asked for it, and names it so it can be restored', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '100.00' });
    const transaction = await createTransaction(user, account.id, { type: 'expense', amount: '40.00' });
    const list = `/api/v1/workspaces/${user.workspaceId}/transactions`;

    await api().delete(`${list}/${transaction.id}`).set(user.auth).expect(204);

    const hidden = await api().get(list).set(user.auth).expect(200);
    expect(hidden.body.items).toHaveLength(0);

    // Without this the restore endpoint is unreachable: nothing can name the
    // row to restore, because nothing can list what was deleted.
    const shown = await api().get(`${list}?includeDeleted=true`).set(user.auth).expect(200);
    expect(shown.body.items).toHaveLength(1);
    expect(shown.body.items[0].id).toBe(transaction.id);
    expect(shown.body.items[0].deletedAt).toEqual(expect.any(String));

    await api().post(`${list}/${transaction.id}/restore`).set(user.auth).expect(204);

    const restored = await api().get(list).set(user.auth).expect(200);
    expect(restored.body.items).toHaveLength(1);
    expect(restored.body.items[0].deletedAt).toBeNull();
  });

  it('follows an edited amount', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '100.00' });
    const transaction = await createTransaction(user, account.id, { type: 'expense', amount: '40.00' });

    await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}`)
      .set(user.auth)
      .send({ amount: '10.00' })
      .expect(200);

    expect(await balanceOf(account.id)).toBe('90.0000');
  });

  it('excludes scheduled transactions until they are confirmed', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '100.00' });
    const scheduled = await createTransaction(user, account.id, {
      type: 'expense',
      amount: '30.00',
      status: 'scheduled',
    });

    expect(await balanceOf(account.id)).toBe('100.0000');

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/${scheduled.id}/confirm`)
      .set(user.auth)
      .expect(204);

    expect(await balanceOf(account.id)).toBe('70.0000');
  });

  it('moves the balance when the opening balance is corrected', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '100.00' });
    await createTransaction(user, account.id, { type: 'expense', amount: '25.00' });

    await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/accounts/${account.id}`)
      .set(user.auth)
      .send({ initialBalance: '200.00' })
      .expect(200);

    expect(await balanceOf(account.id)).toBe('175.0000');
  });
});

describe('transaction validation', () => {
  it('stores expenses as negative and income as positive', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const expense = await createTransaction(user, account.id, { type: 'expense', amount: '10.00' });
    const income = await createTransaction(user, account.id, { type: 'income', amount: '10.00' });

    expect(expense.amount).toBe('-10.0000');
    expect(income.amount).toBe('10.0000');
  });

  it('rejects a zero amount', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions`)
      .set(user.auth)
      .send({ accountId: account.id, type: 'expense', amount: '0', description: 'Nothing', occurredOn: '2026-01-01' });

    expect(response.status).toBe(422);
  });

  it('rejects an expense filed under an income category', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const salary = await findCategory(user.workspaceId, 'Salário');

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions`)
      .set(user.auth)
      .send({
        accountId: account.id,
        type: 'expense',
        amount: '10.00',
        categoryId: salary,
        description: 'Wrong bucket',
        occurredOn: '2026-01-01',
      });

    expect(response.status).toBe(422);
  });

  it('rejects a category belonging to another workspace', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const account = await createAccount(bob);
    const aliceCategory = await findCategory(alice.workspaceId, 'Mercado');

    const response = await api()
      .post(`/api/v1/workspaces/${bob.workspaceId}/transactions`)
      .set(bob.auth)
      .send({
        accountId: account.id,
        type: 'expense',
        amount: '10.00',
        categoryId: aliceCategory,
        description: 'Cross-tenant',
        occurredOn: '2026-01-01',
      });

    expect(response.status).toBe(422);
  });

  it('rejects an invalid date', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions`)
      .set(user.auth)
      .send({ accountId: account.id, type: 'expense', amount: '10', description: 'Bad date', occurredOn: '2026-02-30' });

    expect(response.status).toBe(422);
  });

  it('keeps the entered date regardless of server timezone', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const transaction = await createTransaction(user, account.id, { occurredOn: '2026-01-01' });
    expect(transaction.occurredOn).toBe('2026-01-01');
  });
});

describe('transfers', () => {
  it('creates two linked legs and moves both balances', async () => {
    const user = await registerUser();
    const checking = await createAccount(user, { name: 'Checking', initialBalance: '1000.00' });
    const savings = await createAccount(user, { name: 'Savings', initialBalance: '0' });

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/transfers`)
      .set(user.auth)
      .send({
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amount: '300.00',
        description: 'Monthly saving',
        occurredOn: '2026-02-01',
      });

    expect(response.status).toBe(201);
    expect(response.body.transactions).toHaveLength(2);
    expect(await balanceOf(checking.id)).toBe('700.0000');
    expect(await balanceOf(savings.id)).toBe('300.0000');
  });

  it('deletes both legs together', async () => {
    const user = await registerUser();
    const checking = await createAccount(user, { name: 'C', initialBalance: '1000.00' });
    const savings = await createAccount(user, { name: 'S', initialBalance: '0' });

    const created = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/transfers`)
      .set(user.auth)
      .send({ fromAccountId: checking.id, toAccountId: savings.id, amount: '100.00', description: 'T', occurredOn: '2026-02-01' });

    await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/transactions/${created.body.transactions[0].id}`)
      .set(user.auth)
      .expect(204);

    expect(await balanceOf(checking.id)).toBe('1000.0000');
    expect(await balanceOf(savings.id)).toBe('0.0000');
  });

  it('refuses a transfer to the same account', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/transfers`)
      .set(user.auth)
      .send({ fromAccountId: account.id, toAccountId: account.id, amount: '10', description: 'X', occurredOn: '2026-01-01' });

    expect(response.status).toBe(422);
  });

  it('converts across currencies using the stored rate', async () => {
    await seedExchangeRates('2020-01-01');
    const user = await registerUser();
    const brl = await createAccount(user, { name: 'BRL account', currency: 'BRL', initialBalance: '1000.00' });
    const usd = await createAccount(user, { name: 'USD account', currency: 'USD', initialBalance: '0' });

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/transactions/transfers`)
      .set(user.auth)
      .send({ fromAccountId: brl.id, toAccountId: usd.id, amount: '500.00', description: 'FX', occurredOn: '2026-01-15' })
      .expect(201);

    expect(await balanceOf(brl.id)).toBe('500.0000');
    // 500 BRL at 0.20 USD/BRL
    expect(await balanceOf(usd.id)).toBe('100.0000');
  });
});

describe('search and filtering', () => {
  it('filters by date range, category and free text', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const groceries = await findCategory(user.workspaceId, 'Mercado');

    await createTransaction(user, account.id, {
      description: 'Supermercado Extra',
      occurredOn: '2026-01-15',
      categoryId: groceries,
      amount: '200.00',
    });
    await createTransaction(user, account.id, { description: 'Netflix', occurredOn: '2026-02-15', amount: '55.90' });

    const byDate = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions?from=2026-01-01&to=2026-01-31`)
      .set(user.auth);
    expect(byDate.body.items).toHaveLength(1);
    expect(byDate.body.items[0].description).toBe('Supermercado Extra');

    const byCategory = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions?categoryIds=${groceries}`)
      .set(user.auth);
    expect(byCategory.body.items).toHaveLength(1);

    // Partial-word search has to work: users type a prefix, not a whole word.
    const bySearch = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions?search=superm`)
      .set(user.auth);
    expect(bySearch.body.items).toHaveLength(1);
  });

  it('rolls subcategories into a parent filter', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const supermarket = await findCategory(user.workspaceId, 'Supermercado');
    const food = await findCategory(user.workspaceId, 'Alimentação');

    await createTransaction(user, account.id, { categoryId: supermarket, amount: '80.00' });

    const rolled = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions?categoryIds=${food}&includeSubcategories=true`)
      .set(user.auth);
    expect(rolled.body.items).toHaveLength(1);

    const exact = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions?categoryIds=${food}&includeSubcategories=false`)
      .set(user.auth);
    expect(exact.body.items).toHaveLength(0);
  });

  it('paginates with a stable order', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    for (let i = 0; i < 5; i += 1) {
      await createTransaction(user, account.id, { description: `Tx ${i}`, occurredOn: '2026-01-01' });
    }

    const first = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions?page=1&pageSize=2`)
      .set(user.auth);
    const second = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions?page=2&pageSize=2`)
      .set(user.auth);

    expect(first.body.total).toBe(5);
    expect(first.body.totalPages).toBe(3);
    expect(first.body.hasMore).toBe(true);

    const firstIds = first.body.items.map((t: { id: string }) => t.id);
    const secondIds = second.body.items.map((t: { id: string }) => t.id);
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
  });
});

describe('reconciliation', () => {
  it('completes when the statement matches and then freezes those transactions', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });
    const transaction = await createTransaction(user, account.id, { type: 'expense', amount: '150.00', occurredOn: '2026-01-10' });

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts/${account.id}/reconciliations`)
      .set(user.auth)
      .send({ statementDate: '2026-01-31', statementBalance: '850.00' });

    expect(response.status).toBe(201);
    expect(response.body.reconciliation.status).toBe('completed');
    expect(response.body.reconciliation.difference).toBe('0.0000');
    expect(response.body.reconciliation.transactionsMarked).toBe(1);

    const edit = await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/transactions/${transaction.id}`)
      .set(user.auth)
      .send({ amount: '160.00' });
    expect(edit.status).toBe(409);
  });

  it('stays open and reports the gap when the statement disagrees', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });
    await createTransaction(user, account.id, { type: 'expense', amount: '150.00', occurredOn: '2026-01-10' });

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/accounts/${account.id}/reconciliations`)
      .set(user.auth)
      .send({ statementDate: '2026-01-31', statementBalance: '800.00' });

    expect(response.body.reconciliation.status).toBe('open');
    expect(response.body.reconciliation.difference).toBe('-50.0000');
  });
});

describe('expense splitting', () => {
  it('splits evenly and reconciles to the total', async () => {
    const owner = await registerUser();
    const account = await createAccount(owner, { initialBalance: '0' });
    const transaction = await createTransaction(owner, account.id, { type: 'expense', amount: '100.00' });

    const response = await api()
      .put(`/api/v1/workspaces/${owner.workspaceId}/transactions/${transaction.id}/splits`)
      .set(owner.auth)
      .send({ splits: [{ userId: owner.id }] });

    expect(response.status).toBe(200);
    expect(response.body.splits[0].shareAmount).toBe('100.0000');
  });

  it('rejects explicit shares that do not add up', async () => {
    const owner = await registerUser();
    const account = await createAccount(owner);
    const transaction = await createTransaction(owner, account.id, { type: 'expense', amount: '100.00' });

    const response = await api()
      .put(`/api/v1/workspaces/${owner.workspaceId}/transactions/${transaction.id}/splits`)
      .set(owner.auth)
      .send({ splits: [{ userId: owner.id, shareAmount: '60.00' }] });

    expect(response.status).toBe(422);
  });

  it('rejects a participant who is not a workspace member', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const account = await createAccount(owner);
    const transaction = await createTransaction(owner, account.id, { type: 'expense', amount: '100.00' });

    const response = await api()
      .put(`/api/v1/workspaces/${owner.workspaceId}/transactions/${transaction.id}/splits`)
      .set(owner.auth)
      .send({ splits: [{ userId: outsider.id }] });

    expect(response.status).toBe(422);
  });
});

describe('categories', () => {
  it('returns the seeded hierarchy as a tree', async () => {
    const user = await registerUser();
    const response = await api().get(`/api/v1/workspaces/${user.workspaceId}/categories`).set(user.auth);

    expect(response.status).toBe(200);
    const food = response.body.categories.find((c: { name: string }) => c.name === 'Alimentação');
    expect(food.children.length).toBeGreaterThan(0);
    const groceries = food.children.find((c: { name: string }) => c.name === 'Mercado');
    expect(groceries.children.length).toBeGreaterThan(0);
  });

  it('refuses a fourth level', async () => {
    const user = await registerUser();
    const supermarket = await findCategory(user.workspaceId, 'Supermercado');

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/categories`)
      .set(user.auth)
      .send({ name: 'Too deep', parentId: supermarket });

    expect(response.status).toBe(422);
  });

  it('refuses to delete a category that is in use', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const groceries = await findCategory(user.workspaceId, 'Mercado');
    await createTransaction(user, account.id, { categoryId: groceries });

    const response = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/categories/${groceries}`)
      .set(user.auth);

    expect(response.status).toBe(409);
  });

  it('refuses to move a category into its own subtree', async () => {
    const user = await registerUser();
    const food = await findCategory(user.workspaceId, 'Alimentação');
    const groceries = await findCategory(user.workspaceId, 'Mercado');

    const response = await api()
      .patch(`/api/v1/workspaces/${user.workspaceId}/categories/${food}`)
      .set(user.auth)
      .send({ parentId: groceries });

    expect(response.status).toBe(422);
  });
});
