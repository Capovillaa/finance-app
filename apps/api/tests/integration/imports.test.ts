import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { purgeExpiredPreviews } from '../../src/modules/imports/service.js';
import { api, createAccount, createTransaction, findCategory, registerUser, type TestUser } from '../helpers.js';

/** A three-row Brazilian export: semicolons, comma decimals, day-first dates. */
const BRAZILIAN_CSV = [
  'Data;Histórico;Valor',
  '01/03/2026;Padaria Central;-10,50',
  '15/03/2026;Salário;3.500,00',
  '25/03/2026;"Mercado, Bom";-249,90',
].join('\r\n');

/** The same statement as a US-style export: commas, dot decimals, month-first. */
const AMERICAN_CSV = [
  'Date,Description,Amount',
  '03/01/2026,Bakery,-10.50',
  '03/15/2026,Payroll,3500.00',
].join('\n');

async function preview(user: TestUser, accountId: string, content: string, overrides: Record<string, unknown> = {}) {
  const response = await api()
    .post(`/api/v1/workspaces/${user.workspaceId}/imports/preview`)
    .set(user.auth)
    .send({ accountId, content, filename: 'statement.csv', ...overrides });

  if (response.status !== 201) {
    throw new Error(`preview failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.preview;
}

async function commit(user: TestUser, batchId: string, lineNumbers: number[]) {
  const response = await api()
    .post(`/api/v1/workspaces/${user.workspaceId}/imports/${batchId}/commit`)
    .set(user.auth)
    .send({ rows: lineNumbers.map((lineNumber) => ({ lineNumber })) });

  if (response.status !== 201) {
    throw new Error(`commit failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

async function balanceOf(accountId: string): Promise<string> {
  const row = await db
    .selectFrom('accounts')
    .select('current_balance')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
  return row.current_balance;
}

describe('import preview', () => {
  it('reads a Brazilian export end to end without writing anything', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });

    const result = await preview(user, account.id, BRAZILIAN_CSV);

    expect(result.options.delimiter).toBe(';');
    expect(result.options.decimalSeparator).toBe(',');
    expect(result.options.dateFormat).toBe('dmy');
    expect(result.options.signConvention).toBe('signed');
    expect(result.options.mapping).toEqual({ date: 0, description: 1, amount: 2 });
    expect(result.counts).toEqual({ total: 3, ready: 3, invalid: 0, duplicate: 0 });

    expect(result.rows[0]).toMatchObject({
      lineNumber: 2,
      occurredOn: '2026-03-01',
      description: 'Padaria Central',
      amount: '-10.5000',
      type: 'expense',
    });
    // A quoted field keeps its comma.
    expect(result.rows[2].description).toBe('Mercado, Bom');
    expect(result.totals).toEqual({ inflow: '3500.0000', outflow: '260.4000', net: '3239.6000' });

    // The whole point of preview-then-commit: nothing has moved yet.
    expect(await balanceOf(account.id)).toBe('1000.0000');
    const count = await db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('workspace_id', '=', user.workspaceId)
      .executeTakeFirstOrThrow();
    expect(Number(count.count)).toBe(0);
  });

  it('infers a month-first date layout from the file', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const result = await preview(user, account.id, AMERICAN_CSV);
    expect(result.options.dateFormat).toBe('mdy');
    expect(result.rows[1].occurredOn).toBe('2026-03-15');
  });

  it('flags an ambiguous date layout instead of guessing silently', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    // Every date here reads either way round.
    const csv = 'Date,Description,Amount\n01/02/2026,Coffee,-5.00\n03/04/2026,Lunch,-20.00';
    const result = await preview(user, account.id, csv);

    expect(result.dateFormatAmbiguous).toBe(true);

    // Saying so settles it, and the rows move accordingly.
    const explicit = await preview(user, account.id, csv, { dateFormat: 'mdy' });
    expect(explicit.dateFormatAmbiguous).toBe(false);
    expect(explicit.rows[0].occurredOn).toBe('2026-01-02');
  });

  it('reads separate debit and credit columns', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const csv = [
      'Date,Description,Debit,Credit',
      '2026-03-01,Rent,1500.00,',
      '2026-03-05,Refund,,42.00',
    ].join('\n');

    const result = await preview(user, account.id, csv);
    expect(result.options.signConvention).toBe('debit_credit');
    expect(result.rows[0]).toMatchObject({ amount: '-1500.0000', type: 'expense' });
    expect(result.rows[1]).toMatchObject({ amount: '42.0000', type: 'income' });
  });

  it('reads a positive amount beside a D/C flag', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const csv = ['Data;Histórico;Valor;Tipo', '2026-03-01;Aluguel;1500,00;D', '2026-03-05;Reembolso;42,00;C'].join(
      '\n',
    );

    const result = await preview(user, account.id, csv);
    expect(result.options.signConvention).toBe('direction_flag');
    expect(result.rows[0].amount).toBe('-1500.0000');
    expect(result.rows[1].amount).toBe('42.0000');
  });

  it('reports per-row errors against their line number, in the request locale', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const csv = [
      'Date,Description,Amount',
      '2026-03-01,Good row,-10.00',
      'not-a-date,Bad date,-10.00',
      '2026-03-03,,-10.00',
      '2026-03-04,Bad amount,not-a-number',
      '2026-03-05,Zero,0.00',
    ].join('\n');

    const response = await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/preview`)
      .set(user.auth)
      .set('Accept-Language', 'pt-BR')
      .send({ accountId: account.id, content: csv });

    expect(response.status).toBe(201);
    const { preview: result } = response.body;

    expect(result.counts).toEqual({ total: 5, ready: 1, invalid: 4, duplicate: 0 });
    expect(result.rows[1].errors[0]).toMatchObject({ field: 'date' });
    expect(result.rows[1].errors[0].message).toContain('não é uma data válida');
    expect(result.rows[2].errors[0].field).toBe('description');
    expect(result.rows[3].errors[0].field).toBe('amount');
    expect(result.rows[4].errors[0].field).toBe('amount');
  });

  it('matches a category column by name', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    // The default tree is seeded in Brazilian Portuguese.
    const groceriesId = await findCategory(user.workspaceId, 'Mercado');

    // Matched case- and accent-insensitively, so `MERCADO` finds `Mercado`.
    const csv = ['Date,Description,Amount,Category', '2026-03-01,Market,-99.00,MERCADO'].join('\n');
    const result = await preview(user, account.id, csv);

    expect(result.rows[0].categoryId).toBe(groceriesId);
    expect(result.rows[0].categoryName).toBe('Mercado');
  });

  it('rejects a file it cannot map', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/preview`)
      .set(user.auth)
      .send({ accountId: account.id, content: 'col1,col2\nfoo,bar' })
      .expect(422);
  });

  it('refuses a file with more rows than the cap', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const rows = Array.from({ length: 2001 }, (_, i) => `2026-03-01,Row ${i},-1.00`);
    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/preview`)
      .set(user.auth)
      .send({ accountId: account.id, content: ['Date,Description,Amount', ...rows].join('\n') })
      .expect(400);
  });

  it('requires editor rights', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const viewer = await registerUser();

    await db
      .insertInto('workspace_members')
      .values({ workspace_id: user.workspaceId, user_id: viewer.id, role: 'viewer' })
      .execute();

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/preview`)
      .set(viewer.auth)
      .send({ accountId: account.id, content: BRAZILIAN_CSV })
      .expect(403);
  });
});

describe('import commit', () => {
  it('writes the selected rows and moves the balance', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    const committed = await commit(user, result.batchId, [2, 3, 4]);

    expect(committed).toMatchObject({ batchId: result.batchId, imported: 3 });
    // 1000 - 10.50 + 3500 - 249.90
    expect(await balanceOf(account.id)).toBe('4239.6000');

    const rows = await db
      .selectFrom('transactions')
      .select(['description', 'amount', 'type', 'occurred_on', 'import_batch_id'])
      .where('workspace_id', '=', user.workspaceId)
      .orderBy('occurred_on', 'asc')
      .execute();

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      description: 'Padaria Central',
      amount: '-10.5000',
      type: 'expense',
      occurred_on: '2026-03-01',
      import_batch_id: result.batchId,
    });
    expect(rows[1]!.type).toBe('income');
  });

  it('imports only the rows the user kept', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '0' });

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    await commit(user, result.batchId, [3]);

    expect(await balanceOf(account.id)).toBe('3500.0000');
  });

  it('accepts a category override per row', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const groceriesId = await findCategory(user.workspaceId, 'Mercado');

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/${result.batchId}/commit`)
      .set(user.auth)
      .send({ rows: [{ lineNumber: 2, categoryId: groceriesId }] })
      .expect(201);

    const row = await db
      .selectFrom('transactions')
      .select('category_id')
      .where('workspace_id', '=', user.workspaceId)
      .executeTakeFirstOrThrow();
    expect(row.category_id).toBe(groceriesId);
  });

  it('refuses a category whose kind contradicts the row', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    const salaryId = await findCategory(user.workspaceId, 'Salário');

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    // Line 2 is an expense; Salário is an income category.
    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/${result.batchId}/commit`)
      .set(user.auth)
      .send({ rows: [{ lineNumber: 2, categoryId: salaryId }] })
      .expect(422);

    // And nothing was written: the whole commit is one transaction.
    const count = await db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('workspace_id', '=', user.workspaceId)
      .executeTakeFirstOrThrow();
    expect(Number(count.count)).toBe(0);
  });

  it('refuses a row that still has errors', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const csv = 'Date,Description,Amount\n2026-03-01,Fine,-10.00\nnope,Broken,-10.00';
    const result = await preview(user, account.id, csv);

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/${result.batchId}/commit`)
      .set(user.auth)
      .send({ rows: [{ lineNumber: 3 }] })
      .expect(422);
  });

  it('cannot be committed twice', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    await commit(user, result.batchId, [2]);

    await api()
      .post(`/api/v1/workspaces/${user.workspaceId}/imports/${result.batchId}/commit`)
      .set(user.auth)
      .send({ rows: [{ lineNumber: 3 }] })
      .expect(409);
  });
});

describe('duplicate detection', () => {
  it('flags every row when the same file is imported twice', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });

    const first = await preview(user, account.id, BRAZILIAN_CSV);
    await commit(user, first.batchId, [2, 3, 4]);

    const second = await preview(user, account.id, BRAZILIAN_CSV);
    expect(second.counts).toEqual({ total: 3, ready: 0, invalid: 0, duplicate: 3 });
    for (const row of second.rows) {
      expect(row.duplicateOfTransactionId).not.toBeNull();
    }

    // Flagged, not dropped: the user can still insist.
    await commit(user, second.batchId, [2]);
    expect(await balanceOf(account.id)).toBe('4229.1000');
  });

  it('flags a row that matches a transaction entered by hand', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '10.50',
      description: 'Padaria Central',
      occurredOn: '2026-03-01',
    });

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    expect(result.rows[0].duplicateOfTransactionId).not.toBeNull();
    expect(result.rows[1].duplicateOfTransactionId).toBeNull();
  });

  it('does not let one ledger row absorb two identical file rows', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '5.00',
      description: 'Cafezinho',
      occurredOn: '2026-03-01',
    });

    // Two genuinely identical coffees on the same day.
    const csv = ['Date,Description,Amount', '2026-03-01,Cafezinho,-5.00', '2026-03-01,Cafezinho,-5.00'].join('\n');
    const result = await preview(user, account.id, csv);

    expect(result.rows[0].duplicateOfTransactionId).not.toBeNull();
    // The second is flagged against the *file*, not against the same ledger row.
    expect(result.rows[1].duplicateOfTransactionId).toBeNull();
    expect(result.rows[1].duplicateOfLineNumber).toBe(2);
  });

  it('ignores a row that only shares the amount', async () => {
    const user = await registerUser();
    const account = await createAccount(user);
    await createTransaction(user, account.id, {
      type: 'expense',
      amount: '10.50',
      description: 'Something else entirely',
      occurredOn: '2026-03-01',
    });

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    expect(result.rows[0].duplicateOfTransactionId).toBeNull();
  });
});

describe('undo', () => {
  it('reverses a whole batch and returns the balance', async () => {
    const user = await registerUser();
    const account = await createAccount(user, { initialBalance: '1000.00' });

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    await commit(user, result.batchId, [2, 3, 4]);
    expect(await balanceOf(account.id)).toBe('4239.6000');

    const response = await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/imports/${result.batchId}`)
      .set(user.auth)
      .expect(200);

    expect(response.body.reverted).toBe(3);
    expect(await balanceOf(account.id)).toBe('1000.0000');

    // Soft-deleted, so the ledger no longer lists them.
    const listed = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/transactions`)
      .set(user.auth)
      .expect(200);
    expect(listed.body.items).toHaveLength(0);
  });

  it('cannot undo the same batch twice, or one that was never committed', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const uncommitted = await preview(user, account.id, BRAZILIAN_CSV);
    await api()
      .delete(`/api/v1/workspaces/${user.workspaceId}/imports/${uncommitted.batchId}`)
      .set(user.auth)
      .expect(409);

    const result = await preview(user, account.id, BRAZILIAN_CSV);
    await commit(user, result.batchId, [2]);
    await api().delete(`/api/v1/workspaces/${user.workspaceId}/imports/${result.batchId}`).set(user.auth).expect(200);
    await api().delete(`/api/v1/workspaces/${user.workspaceId}/imports/${result.batchId}`).set(user.auth).expect(409);
  });

  it('does not leak a batch from another workspace', async () => {
    const owner = await registerUser();
    const account = await createAccount(owner);
    const result = await preview(owner, account.id, BRAZILIAN_CSV);
    await commit(owner, result.batchId, [2]);

    const stranger = await registerUser();
    await api()
      .delete(`/api/v1/workspaces/${stranger.workspaceId}/imports/${result.batchId}`)
      .set(stranger.auth)
      .expect(404);
  });
});

describe('import history', () => {
  it('lists committed batches and hides uncommitted previews', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    await preview(user, account.id, BRAZILIAN_CSV); // abandoned
    const result = await preview(user, account.id, BRAZILIAN_CSV);
    await commit(user, result.batchId, [2, 3]);

    const response = await api()
      .get(`/api/v1/workspaces/${user.workspaceId}/imports`)
      .set(user.auth)
      .expect(200);

    expect(response.body.batches).toHaveLength(1);
    expect(response.body.batches[0]).toMatchObject({
      id: result.batchId,
      status: 'committed',
      filename: 'statement.csv',
      rowCount: 3,
      importedCount: 2,
      accountId: account.id,
    });
  });

  it('sweeps abandoned previews and leaves committed batches alone', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    const abandoned = await preview(user, account.id, BRAZILIAN_CSV);
    const kept = await preview(user, account.id, BRAZILIAN_CSV);
    await commit(user, kept.batchId, [2]);
    const fresh = await preview(user, account.id, BRAZILIAN_CSV);

    // Age the abandoned one past its TTL; the other two must be untouched.
    await db
      .updateTable('import_batches')
      .set({ expires_at: new Date(Date.now() - 60_000) })
      .where('id', '=', abandoned.batchId)
      .execute();

    expect(await purgeExpiredPreviews()).toBe(1);

    const remaining = await db
      .selectFrom('import_batches')
      .select(['id', 'status'])
      .where('workspace_id', '=', user.workspaceId)
      .execute();

    expect(remaining.map((row) => row.id).sort()).toEqual([kept.batchId, fresh.batchId].sort());
  });

  it('recalls the mapping from the last import of the same layout', async () => {
    const user = await registerUser();
    const account = await createAccount(user);

    // An ambiguous file, resolved by hand the first time.
    const csv = 'Date,Description,Amount\n01/02/2026,Coffee,-5.00';
    const first = await preview(user, account.id, csv, { dateFormat: 'mdy' });
    await commit(user, first.batchId, [2]);

    const second = await preview(user, account.id, 'Date,Description,Amount\n03/04/2026,Lunch,-20.00');
    expect(second.mappingRecalled).toBe(true);
    expect(second.options.dateFormat).toBe('mdy');
    expect(second.dateFormatAmbiguous).toBe(false);
    expect(second.rows[0].occurredOn).toBe('2026-03-04');
  });
});
