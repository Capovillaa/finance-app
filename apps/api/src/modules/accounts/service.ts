import { sql } from 'kysely';
import { db } from '../../db/client.js';
import type { AccountType } from '../../db/types.js';
import { today, type DateOnly } from '../../lib/dates.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { add, subtract } from '../../lib/money.js';
import { recordActivity } from '../activity/service.js';
import { assertCurrencyExists, convertAmount } from '../currencies/service.js';

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  initialBalance: string;
  currentBalance: string;
  /** Cleared balance plus anything still pending, i.e. what is really committed. */
  availableBalance: string;
  creditLimit: string | null;
  statementDay: number | null;
  dueDay: number | null;
  color: string | null;
  icon: string | null;
  isArchived: boolean;
  createdAt: Date;
}

interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  initial_balance: string;
  current_balance: string;
  credit_limit: string | null;
  statement_day: number | null;
  due_day: number | null;
  color: string | null;
  icon: string | null;
  is_archived: boolean;
  created_at: Date;
  pending_total?: string | null;
}

function toRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    institution: row.institution,
    initialBalance: row.initial_balance,
    currentBalance: row.current_balance,
    availableBalance: add(row.current_balance, row.pending_total ?? '0'),
    creditLimit: row.credit_limit,
    statementDay: row.statement_day,
    dueDay: row.due_day,
    color: row.color,
    icon: row.icon,
    isArchived: row.is_archived,
    createdAt: row.created_at,
  };
}

export async function listAccounts(
  workspaceId: string,
  options: { includeArchived?: boolean } = {},
): Promise<AccountRecord[]> {
  let query = db.selectFrom('accounts').where('accounts.workspace_id', '=', workspaceId);
  if (!options.includeArchived) query = query.where('accounts.is_archived', '=', false);

  const rows = await query
    .select((eb) => [
      'accounts.id as id',
      'accounts.name as name',
      'accounts.type as type',
      'accounts.currency as currency',
      'accounts.institution as institution',
      'accounts.initial_balance as initial_balance',
      'accounts.current_balance as current_balance',
      'accounts.credit_limit as credit_limit',
      'accounts.statement_day as statement_day',
      'accounts.due_day as due_day',
      'accounts.color as color',
      'accounts.icon as icon',
      'accounts.is_archived as is_archived',
      'accounts.created_at as created_at',
      eb
        .selectFrom('transactions')
        .select((inner) =>
          inner.fn.coalesce(inner.fn.sum<string>('transactions.amount'), sql<string>`0`).as('total'),
        )
        .whereRef('transactions.account_id', '=', 'accounts.id')
        .where('transactions.status', '=', 'pending')
        .where('transactions.deleted_at', 'is', null)
        .as('pending_total'),
    ])
    .orderBy('accounts.name', 'asc')
    .execute();

  return rows.map((row) => toRecord(row as AccountRow));
}

export async function getAccount(workspaceId: string, accountId: string): Promise<AccountRecord> {
  const accounts = await listAccounts(workspaceId, { includeArchived: true });
  const found = accounts.find((a) => a.id === accountId);
  if (!found) throw notFound('resources.account');
  return found;
}

export interface CreateAccountInput {
  workspaceId: string;
  name: string;
  type: AccountType;
  currency: string;
  institution?: string | null;
  initialBalance?: string;
  creditLimit?: string | null;
  statementDay?: number | null;
  dueDay?: number | null;
  color?: string | null;
  icon?: string | null;
  createdBy: string;
}

export async function createAccount(input: CreateAccountInput): Promise<AccountRecord> {
  await assertCurrencyExists(input.currency);

  if (input.creditLimit != null && input.type !== 'credit_card') {
    throw unprocessable('accounts.creditLimitNotApplicable');
  }

  const row = await db
    .insertInto('accounts')
    .values({
      workspace_id: input.workspaceId,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency.toUpperCase(),
      institution: input.institution ?? null,
      initial_balance: input.initialBalance ?? '0',
      credit_limit: input.creditLimit ?? null,
      statement_day: input.statementDay ?? null,
      due_day: input.dueDay ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      created_by: input.createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.createdBy,
    action: 'account.created',
    entityType: 'account',
    entityId: row.id,
    summary: `Added account "${row.name}"`,
  });

  return toRecord(row as AccountRow);
}

export interface UpdateAccountInput {
  name?: string;
  institution?: string | null;
  initialBalance?: string;
  creditLimit?: string | null;
  statementDay?: number | null;
  dueDay?: number | null;
  color?: string | null;
  icon?: string | null;
  isArchived?: boolean;
}

export async function updateAccount(
  workspaceId: string,
  accountId: string,
  input: UpdateAccountInput,
  actorId: string,
): Promise<AccountRecord> {
  const before = await getAccount(workspaceId, accountId);

  await db
    .updateTable('accounts')
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.institution !== undefined ? { institution: input.institution } : {}),
      ...(input.initialBalance !== undefined ? { initial_balance: input.initialBalance } : {}),
      ...(input.creditLimit !== undefined ? { credit_limit: input.creditLimit } : {}),
      ...(input.statementDay !== undefined ? { statement_day: input.statementDay } : {}),
      ...(input.dueDay !== undefined ? { due_day: input.dueDay } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.isArchived !== undefined ? { is_archived: input.isArchived } : {}),
    })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', accountId)
    .execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'account.updated',
    entityType: 'account',
    entityId: accountId,
    summary: `Updated account "${before.name}"`,
    changes: input as Record<string, unknown>,
  });

  return getAccount(workspaceId, accountId);
}

/**
 * Accounts with history are archived rather than deleted: transactions carry a
 * restrict-on-delete foreign key so the ledger can never lose its context.
 */
export async function deleteAccount(workspaceId: string, accountId: string, actorId: string): Promise<void> {
  const account = await getAccount(workspaceId, accountId);

  const used = await db
    .selectFrom('transactions')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('account_id', '=', accountId)
    .executeTakeFirst();

  if (Number(used?.count ?? 0) > 0) {
    throw conflict('accounts.hasTransactions');
  }

  await db.deleteFrom('accounts').where('workspace_id', '=', workspaceId).where('id', '=', accountId).execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'account.deleted',
    entityType: 'account',
    entityId: accountId,
    summary: `Deleted account "${account.name}"`,
  });
}

/** Total balance across accounts, converted into the workspace base currency. */
export async function totalBalance(
  workspaceId: string,
  baseCurrency: string,
  asOf: DateOnly = today('UTC'),
): Promise<{ total: string; byCurrency: Record<string, string> }> {
  const accounts = await listAccounts(workspaceId);

  const byCurrency: Record<string, string> = {};
  for (const account of accounts) {
    byCurrency[account.currency] = add(byCurrency[account.currency] ?? '0', account.currentBalance);
  }

  let total = '0';
  for (const [currency, amount] of Object.entries(byCurrency)) {
    const { amount: converted } = await convertAmount(amount, currency, baseCurrency, asOf);
    total = add(total, converted);
  }

  return { total, byCurrency };
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface ReconciliationInput {
  workspaceId: string;
  accountId: string;
  statementDate: DateOnly;
  statementBalance: string;
  notes?: string | null;
  reconciledBy: string;
  /** Mark every cleared transaction up to the statement date as reconciled. */
  markTransactions?: boolean;
}

export interface ReconciliationResult {
  id: string;
  statementDate: DateOnly;
  statementBalance: string;
  computedBalance: string;
  difference: string;
  status: 'open' | 'completed';
  transactionsMarked: number;
}

/**
 * Compares the account's computed balance at a statement date against the bank's
 * figure. A non-zero difference stays `open` so the user can hunt the missing
 * entry; a match closes the reconciliation and freezes those transactions.
 */
export async function reconcileAccount(input: ReconciliationInput): Promise<ReconciliationResult> {
  const account = await getAccount(input.workspaceId, input.accountId);

  return db.transaction().execute(async (trx) => {
    const sumRow = await trx
      .selectFrom('transactions')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), sql<string>`0`).as('total'))
      .where('account_id', '=', input.accountId)
      .where('status', '=', 'cleared')
      .where('deleted_at', 'is', null)
      .where('occurred_on', '<=', input.statementDate)
      .executeTakeFirst();

    const computed = add(account.initialBalance, sumRow?.total ?? '0');
    const difference = subtract(input.statementBalance, computed);
    const matched = difference === '0.0000' || Number(difference) === 0;

    const reconciliation = await trx
      .insertInto('account_reconciliations')
      .values({
        workspace_id: input.workspaceId,
        account_id: input.accountId,
        statement_date: input.statementDate,
        statement_balance: input.statementBalance,
        computed_balance: computed,
        difference,
        status: matched ? 'completed' : 'open',
        notes: input.notes ?? null,
        reconciled_by: input.reconciledBy,
        completed_at: matched ? new Date() : null,
      })
      .onConflict((oc) =>
        oc.columns(['account_id', 'statement_date']).doUpdateSet({
          statement_balance: input.statementBalance,
          computed_balance: computed,
          difference,
          status: matched ? 'completed' : 'open',
          notes: input.notes ?? null,
          reconciled_by: input.reconciledBy,
          completed_at: matched ? new Date() : null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    let transactionsMarked = 0;
    if (matched && input.markTransactions !== false) {
      const result = await trx
        .updateTable('transactions')
        .set({ is_reconciled: true, reconciliation_id: reconciliation.id })
        .where('account_id', '=', input.accountId)
        .where('status', '=', 'cleared')
        .where('deleted_at', 'is', null)
        .where('occurred_on', '<=', input.statementDate)
        .where('is_reconciled', '=', false)
        .executeTakeFirst();
      transactionsMarked = Number(result.numUpdatedRows ?? 0);
    }

    return {
      id: reconciliation.id,
      statementDate: reconciliation.statement_date,
      statementBalance: reconciliation.statement_balance,
      computedBalance: reconciliation.computed_balance,
      difference: reconciliation.difference,
      status: reconciliation.status,
      transactionsMarked,
    };
  });
}

export async function listReconciliations(workspaceId: string, accountId: string) {
  const rows = await db
    .selectFrom('account_reconciliations')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('account_id', '=', accountId)
    .orderBy('statement_date', 'desc')
    .limit(100)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    statementDate: row.statement_date,
    statementBalance: row.statement_balance,
    computedBalance: row.computed_balance,
    difference: row.difference,
    status: row.status,
    notes: row.notes,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }));
}
