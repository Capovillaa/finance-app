import { db } from '../../db/client.js';
import { toCsv } from '../../lib/csv.js';
import { periodRange, today, type DateOnly, type DateRange } from '../../lib/dates.js';
import { abs, add, percentOf, subtract } from '../../lib/money.js';
import { categoryBreakdown, periodTotals, trends, type CategoryBreakdownItem } from '../analytics/service.js';
import { listAccounts } from '../accounts/service.js';
import { listBudgets } from '../budgets/service.js';

export interface MonthlyStatement {
  workspaceId: string;
  range: DateRange;
  baseCurrency: string;
  openingBalance: string;
  closingBalance: string;
  totals: Awaited<ReturnType<typeof periodTotals>>;
  categories: CategoryBreakdownItem[];
  accounts: { id: string; name: string; currency: string; closingBalance: string }[];
  budgets: { name: string; totalLimit: string; totalSpent: string; percentUsed: number }[];
  transactionCount: number;
}

/**
 * A closed statement for one period: what came in, what went out, and where the
 * balance stood at each end. Opening balance is derived from the ledger before
 * the range, so a statement for any historical month is reproducible.
 */
export async function monthlyStatement(
  workspaceId: string,
  baseCurrency: string,
  anchor: DateOnly,
): Promise<MonthlyStatement> {
  const range = periodRange('month', anchor);

  const [openingRow, deltaRow, totals, categories, accounts, budgets, countRow] = await Promise.all([
    db
      .selectFrom('accounts')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('initial_balance'), eb.val('0')).as('total'))
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst(),
    db
      .selectFrom('transactions')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('base_amount'), eb.val('0')).as('total'))
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .where('status', '=', 'cleared')
      .where('occurred_on', '<', range.start)
      .executeTakeFirst(),
    periodTotals(workspaceId, range),
    categoryBreakdown(workspaceId, range, { depth: 0 }),
    listAccounts(workspaceId),
    listBudgets(workspaceId, baseCurrency, { activeOn: range.start }),
    db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .where('occurred_on', '>=', range.start)
      .where('occurred_on', '<=', range.end)
      .executeTakeFirst(),
  ]);

  const inRangeRow = await db
    .selectFrom('transactions')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('base_amount'), eb.val('0')).as('total'))
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'cleared')
    .where('occurred_on', '>=', range.start)
    .where('occurred_on', '<=', range.end)
    .executeTakeFirst();

  const openingBalance = add(openingRow?.total ?? '0', deltaRow?.total ?? '0');
  const closingBalance = add(openingBalance, inRangeRow?.total ?? '0');

  return {
    workspaceId,
    range,
    baseCurrency,
    openingBalance,
    closingBalance,
    totals,
    categories,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      closingBalance: account.currentBalance,
    })),
    budgets: budgets.map((budget) => ({
      name: budget.name,
      totalLimit: budget.totalLimit,
      totalSpent: budget.totalSpent,
      percentUsed: budget.percentUsed,
    })),
    transactionCount: Number(countRow?.count ?? 0),
  };
}

export interface YearOverYearRow {
  month: string;
  currentIncome: string;
  currentExpenses: string;
  previousIncome: string;
  previousExpenses: string;
  expenseChangePercent: number;
}

export async function yearOverYear(workspaceId: string, year: number): Promise<YearOverYearRow[]> {
  const [current, previous] = await Promise.all([
    trends(workspaceId, { start: `${year}-01-01`, end: `${year}-12-31` }, 'month'),
    trends(workspaceId, { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` }, 'month'),
  ]);

  const previousByMonth = new Map(previous.map((point) => [point.period.slice(5), point]));

  return current.map((point) => {
    const monthKey = point.period.slice(5);
    const prior = previousByMonth.get(monthKey);
    return {
      month: monthKey,
      currentIncome: point.income,
      currentExpenses: point.expenses,
      previousIncome: prior?.income ?? '0.0000',
      previousExpenses: prior?.expenses ?? '0.0000',
      expenseChangePercent:
        prior && Number(prior.expenses) !== 0
          ? percentOf(subtract(point.expenses, prior.expenses), prior.expenses)
          : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
//
// The escaping and assembly live in `lib/csv.ts`, next to the reader the import
// module uses, so the two halves of the format cannot drift apart.

export interface ExportFilters {
  from?: DateOnly;
  to?: DateOnly;
  accountIds?: string[];
  categoryIds?: string[];
}

export async function exportTransactionsCsv(
  workspaceId: string,
  filters: ExportFilters = {},
): Promise<string> {
  let query = db
    .selectFrom('transactions')
    .leftJoin('accounts', 'accounts.id', 'transactions.account_id')
    .leftJoin('categories', 'categories.id', 'transactions.category_id')
    .leftJoin('users', 'users.id', 'transactions.created_by')
    .where('transactions.workspace_id', '=', workspaceId)
    .where('transactions.deleted_at', 'is', null);

  if (filters.from) query = query.where('transactions.occurred_on', '>=', filters.from);
  if (filters.to) query = query.where('transactions.occurred_on', '<=', filters.to);
  if (filters.accountIds?.length) query = query.where('transactions.account_id', 'in', filters.accountIds);
  if (filters.categoryIds?.length) query = query.where('transactions.category_id', 'in', filters.categoryIds);

  const rows = await query
    .select([
      'transactions.occurred_on as occurred_on',
      'transactions.description as description',
      'transactions.merchant as merchant',
      'transactions.type as type',
      'transactions.status as status',
      'transactions.amount as amount',
      'transactions.currency as currency',
      'transactions.base_amount as base_amount',
      'transactions.notes as notes',
      'accounts.name as account_name',
      'categories.name as category_name',
      'users.full_name as created_by_name',
    ])
    .orderBy('transactions.occurred_on', 'asc')
    .orderBy('transactions.id', 'asc')
    .execute();

  return toCsv(
    [
      'Date',
      'Description',
      'Merchant',
      'Account',
      'Category',
      'Type',
      'Status',
      'Amount',
      'Currency',
      'Amount (base)',
      'Notes',
      'Created by',
    ],
    rows.map((row) => [
      row.occurred_on,
      row.description,
      row.merchant,
      row.account_name,
      row.category_name ?? 'Uncategorised',
      row.type,
      row.status,
      row.amount,
      row.currency,
      row.base_amount,
      row.notes,
      row.created_by_name,
    ]),
  );
}

export async function exportStatementCsv(
  workspaceId: string,
  baseCurrency: string,
  anchor: DateOnly = today('UTC'),
): Promise<string> {
  const statement = await monthlyStatement(workspaceId, baseCurrency, anchor);

  const rows: unknown[][] = [
    ['Period', `${statement.range.start} to ${statement.range.end}`],
    ['Base currency', statement.baseCurrency],
    ['Opening balance', statement.openingBalance],
    ['Closing balance', statement.closingBalance],
    ['Income', statement.totals.income],
    ['Expenses', statement.totals.expenses],
    ['Net', statement.totals.net],
    ['Savings rate (%)', statement.totals.savingsRate],
    ['Transactions', statement.transactionCount],
    [],
    ['Category', 'Total', '% of spending'],
    ...statement.categories.map((category) => [
      category.categoryName,
      abs(category.total),
      category.percentOfTotal,
    ]),
  ];

  return toCsv(['Field', 'Value', ''], rows);
}
