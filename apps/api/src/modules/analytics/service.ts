import { sql } from 'kysely';
import { db } from '../../db/client.js';
import {
  addMonths,
  endOfMonth,
  periodRange,
  shiftPeriod,
  startOfMonth,
  today,
  type DateOnly,
  type DateRange,
  type PeriodUnit,
} from '../../lib/dates.js';
import { abs, add, compare, percentOf, subtract, Decimal } from '../../lib/money.js';
import { cached, workspaceCacheKey } from '../../lib/redis.js';
import { listAccounts, totalBalance } from '../accounts/service.js';
import { listBudgets } from '../budgets/service.js';
import { listTransactions } from '../transactions/service.js';

const CACHE_TTL_SECONDS = 60;

export interface PeriodTotals {
  income: string;
  expenses: string;
  net: string;
  savingsRate: number;
}

/**
 * Income/expense totals for a range, in the workspace base currency.
 * Transfers are excluded everywhere in analytics: moving money between your own
 * accounts is neither income nor expense, and counting it would inflate both.
 */
export async function periodTotals(workspaceId: string, range: DateRange): Promise<PeriodTotals> {
  const row = await db
    .selectFrom('transactions')
    .select((eb) => [
      eb.fn
        .coalesce(
          eb.fn.sum<string>(sql<string>`CASE WHEN type = 'income' THEN base_amount ELSE 0 END`),
          sql<string>`0`,
        )
        .as('income'),
      eb.fn
        .coalesce(
          eb.fn.sum<string>(sql<string>`CASE WHEN type = 'expense' THEN abs(base_amount) ELSE 0 END`),
          sql<string>`0`,
        )
        .as('expenses'),
    ])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['cleared', 'pending'])
    .where('occurred_on', '>=', range.start)
    .where('occurred_on', '<=', range.end)
    .executeTakeFirst();

  const income = row?.income ?? '0';
  const expenses = row?.expenses ?? '0';
  const net = subtract(income, expenses);

  return {
    income: add('0', income),
    expenses: add('0', expenses),
    net,
    // Share of income that was not spent; meaningless without income.
    savingsRate: compare(income, '0') > 0 ? percentOf(net, income) : 0,
  };
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  parentId: string | null;
  total: string;
  transactionCount: number;
  percentOfTotal: number;
}

/**
 * Spending per category for the pie/donut charts.
 *
 * `depth` rolls children into their level-N ancestor, which is what makes a
 * three-level hierarchy readable in a chart: at depth 0 the user sees Food, not
 * eleven supermarket sub-categories.
 */
export async function categoryBreakdown(
  workspaceId: string,
  range: DateRange,
  options: { type?: 'expense' | 'income'; depth?: 0 | 1 | 2; limit?: number } = {},
): Promise<CategoryBreakdownItem[]> {
  const type = options.type ?? 'expense';
  const depth = options.depth ?? 0;

  const result = await sql<{
    category_id: string | null;
    category_name: string | null;
    category_color: string | null;
    parent_id: string | null;
    total: string;
    transaction_count: number;
  }>`
    WITH RECURSIVE ancestry AS (
      SELECT id, id AS root_id, parent_id, depth
      FROM categories
      WHERE workspace_id = ${workspaceId}
      UNION ALL
      SELECT a.id, c.id AS root_id, c.parent_id, c.depth
      FROM ancestry a
      JOIN categories c ON c.id = a.parent_id
    ),
    -- For each category, the ancestor at the requested depth (or itself when
    -- the category is shallower than that).
    rollup AS (
      SELECT DISTINCT ON (a.id)
        a.id AS category_id,
        a.root_id AS bucket_id
      FROM ancestry a
      JOIN categories c ON c.id = a.root_id
      WHERE c.depth <= ${depth}
      ORDER BY a.id, c.depth DESC
    )
    SELECT
      b.id AS category_id,
      b.name AS category_name,
      b.color AS category_color,
      b.parent_id,
      abs(sum(t.base_amount))::text AS total,
      count(*)::int AS transaction_count
    FROM transactions t
    JOIN rollup r ON r.category_id = t.category_id
    JOIN categories b ON b.id = r.bucket_id
    WHERE t.workspace_id = ${workspaceId}
      AND t.type = ${type}
      AND t.deleted_at IS NULL
      AND t.status IN ('cleared','pending')
      AND t.occurred_on >= ${range.start}
      AND t.occurred_on <= ${range.end}
    GROUP BY b.id, b.name, b.color, b.parent_id

    UNION ALL

    -- Uncategorised spending still has to appear, or the chart will not add up.
    SELECT
      NULL AS category_id,
      'Uncategorised' AS category_name,
      NULL AS category_color,
      NULL AS parent_id,
      abs(sum(t.base_amount))::text AS total,
      count(*)::int AS transaction_count
    FROM transactions t
    WHERE t.workspace_id = ${workspaceId}
      AND t.type = ${type}
      AND t.category_id IS NULL
      AND t.deleted_at IS NULL
      AND t.status IN ('cleared','pending')
      AND t.occurred_on >= ${range.start}
      AND t.occurred_on <= ${range.end}
    HAVING count(*) > 0
  `.execute(db);

  // Sorting happens here rather than in SQL: the totals are cast to text to
  // preserve NUMERIC precision, and ordering text would sort "9" above "10".
  const rows = [...result.rows].sort((a, b) => Number(b.total) - Number(a.total));
  const grandTotal = rows.reduce<string>((acc, row) => add(acc, row.total), '0');

  const items = rows.map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name ?? 'Uncategorised',
    categoryColor: row.category_color,
    parentId: row.parent_id,
    total: add('0', row.total),
    transactionCount: row.transaction_count,
    percentOfTotal: percentOf(row.total, grandTotal),
  }));

  return options.limit ? items.slice(0, options.limit) : items;
}

export interface TrendPoint {
  period: string;
  periodStart: DateOnly;
  income: string;
  expenses: string;
  net: string;
}

/**
 * Dense time series for the trend charts. Periods with no activity are emitted
 * as zeros so the chart shows a gap in spending rather than skipping the month.
 */
export async function trends(
  workspaceId: string,
  range: DateRange,
  unit: Exclude<PeriodUnit, 'quarter'> = 'month',
): Promise<TrendPoint[]> {
  const truncUnit = unit === 'day' ? 'day' : unit === 'week' ? 'week' : unit === 'year' ? 'year' : 'month';
  const labelFormat = truncUnit === 'year' ? 'YYYY' : truncUnit === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

  const result = await sql<{
    period_start: string;
    label: string;
    income: string;
    expenses: string;
  }>`
    WITH series AS (
      SELECT generate_series(
        date_trunc(${truncUnit}, ${range.start}::date),
        date_trunc(${truncUnit}, ${range.end}::date),
        ${sql.raw(`'1 ${truncUnit}'::interval`)}
      )::date AS period_start
    ),
    totals AS (
      SELECT
        date_trunc(${truncUnit}, occurred_on)::date AS period_start,
        coalesce(sum(CASE WHEN type = 'income' THEN base_amount ELSE 0 END), 0)::text AS income,
        coalesce(sum(CASE WHEN type = 'expense' THEN abs(base_amount) ELSE 0 END), 0)::text AS expenses
      FROM transactions
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND status IN ('cleared','pending')
        AND occurred_on >= ${range.start}
        AND occurred_on <= ${range.end}
      GROUP BY 1
    )
    SELECT
      s.period_start::text AS period_start,
      to_char(s.period_start, ${labelFormat}) AS label,
      coalesce(t.income, '0') AS income,
      coalesce(t.expenses, '0') AS expenses
    FROM series s
    LEFT JOIN totals t ON t.period_start = s.period_start
    ORDER BY s.period_start
  `.execute(db);

  return result.rows.map((row) => ({
    period: row.label,
    periodStart: row.period_start,
    income: add('0', row.income),
    expenses: add('0', row.expenses),
    net: subtract(row.income, row.expenses),
  }));
}

export interface NetWorthPoint {
  periodEnd: DateOnly;
  balance: string;
}

/**
 * Running balance across all accounts at each month end. Computed as a cumulative
 * sum over the ledger plus opening balances, so it reflects history exactly
 * rather than extrapolating from today's figure.
 */
export async function netWorthTrend(workspaceId: string, months = 12): Promise<NetWorthPoint[]> {
  const end = endOfMonth(today('UTC'));
  const start = startOfMonth(addMonths(end, -(months - 1)));

  const openingRow = await db
    .selectFrom('accounts')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('initial_balance'), sql<string>`0`).as('total'))
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();

  const priorRow = await db
    .selectFrom('transactions')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('base_amount'), sql<string>`0`).as('total'))
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'cleared')
    .where('occurred_on', '<', start)
    .executeTakeFirst();

  const result = await sql<{ period_end: string; delta: string }>`
    WITH series AS (
      SELECT (date_trunc('month', gs)::date + interval '1 month - 1 day')::date AS period_end
      FROM generate_series(${start}::date, ${end}::date, '1 month'::interval) gs
    ),
    monthly AS (
      SELECT
        (date_trunc('month', occurred_on)::date + interval '1 month - 1 day')::date AS period_end,
        coalesce(sum(base_amount), 0)::text AS delta
      FROM transactions
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND status = 'cleared'
        AND occurred_on >= ${start}
        AND occurred_on <= ${end}
      GROUP BY 1
    )
    SELECT s.period_end::text AS period_end, coalesce(m.delta, '0') AS delta
    FROM series s
    LEFT JOIN monthly m ON m.period_end = s.period_end
    ORDER BY s.period_end
  `.execute(db);

  let running = add(openingRow?.total ?? '0', priorRow?.total ?? '0');

  return result.rows.map((row) => {
    running = add(running, row.delta);
    return { periodEnd: row.period_end, balance: running };
  });
}

export interface ComparisonResult {
  current: PeriodTotals & { range: DateRange };
  previous: PeriodTotals & { range: DateRange };
  incomeChangePercent: number;
  expenseChangePercent: number;
  netChange: string;
}

/** Period-over-period comparison (this month vs last, this year vs last). */
export async function comparePeriods(
  workspaceId: string,
  unit: PeriodUnit,
  anchor: DateOnly,
  offset = -1,
): Promise<ComparisonResult> {
  const currentRange = periodRange(unit, anchor);
  const previousRange = shiftPeriod(unit, currentRange, offset);

  const [current, previous] = await Promise.all([
    periodTotals(workspaceId, currentRange),
    periodTotals(workspaceId, previousRange),
  ]);

  return {
    current: { ...current, range: currentRange },
    previous: { ...previous, range: previousRange },
    incomeChangePercent: changePercent(previous.income, current.income),
    expenseChangePercent: changePercent(previous.expenses, current.expenses),
    netChange: subtract(current.net, previous.net),
  };
}

function changePercent(from: string, to: string): number {
  if (compare(from, '0') === 0) return compare(to, '0') === 0 ? 0 : 100;
  return new Decimal(to).minus(from).div(new Decimal(from).abs()).times(100).toDecimalPlaces(2).toNumber();
}

export interface DashboardSummary {
  asOf: DateOnly;
  baseCurrency: string;
  totalBalance: string;
  balanceByCurrency: Record<string, string>;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  month: PeriodTotals & { range: DateRange };
  monthOverMonth: ComparisonResult;
  topCategories: CategoryBreakdownItem[];
  budgets: { id: string; name: string; percentUsed: number; status: string; totalLimit: string; totalSpent: string }[];
  recentTransactions: Awaited<ReturnType<typeof listTransactions>>['items'];
  upcomingBills: { id: string; name: string; amount: string; currency: string; dueOn: DateOnly }[];
  goals: { id: string; name: string; progressPercent: number; targetAmount: string; currentAmount: string }[];
  unreadNotifications: number;
}

/**
 * Everything the main dashboard needs, in one round trip. Cached briefly in
 * Redis because it is the most-requested endpoint in the product and every write
 * path invalidates the workspace's cache namespace.
 */
export async function dashboardSummary(
  workspaceId: string,
  baseCurrency: string,
  userId: string,
  timezone = 'UTC',
): Promise<DashboardSummary> {
  const asOf = today(timezone);
  const key = workspaceCacheKey(workspaceId, 'dashboard', userId, asOf);

  return cached(key, CACHE_TTL_SECONDS, async () => {
    const monthRange = periodRange('month', asOf);

    const [balances, accounts, month, monthOverMonth, topCategories, budgets, recent, bills, goals, unread] =
      await Promise.all([
        totalBalance(workspaceId, baseCurrency, asOf),
        listAccounts(workspaceId),
        periodTotals(workspaceId, monthRange),
        comparePeriods(workspaceId, 'month', asOf),
        categoryBreakdown(workspaceId, monthRange, { depth: 0, limit: 8 }),
        listBudgets(workspaceId, baseCurrency, { activeOn: asOf }),
        listTransactions(workspaceId, {}, { page: 1, pageSize: 10 }),
        db
          .selectFrom('recurring_transactions')
          .select(['id', 'name', 'amount', 'currency', 'next_occurrence_on'])
          .where('workspace_id', '=', workspaceId)
          .where('is_active', '=', true)
          .where('type', '=', 'expense')
          .where('next_occurrence_on', 'is not', null)
          .orderBy('next_occurrence_on', 'asc')
          .limit(5)
          .execute(),
        db
          .selectFrom('financial_goals')
          .select(['id', 'name', 'target_amount', 'current_amount'])
          .where('workspace_id', '=', workspaceId)
          .where('status', '=', 'active')
          .orderBy('priority', 'asc')
          .limit(5)
          .execute(),
        db
          .selectFrom('notifications')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('user_id', '=', userId)
          .where('workspace_id', '=', workspaceId)
          .where('read_at', 'is', null)
          .executeTakeFirst(),
      ]);

    return {
      asOf,
      baseCurrency,
      totalBalance: balances.total,
      balanceByCurrency: balances.byCurrency,
      accounts,
      month: { ...month, range: monthRange },
      monthOverMonth,
      topCategories,
      budgets: budgets.map((budget) => ({
        id: budget.id,
        name: budget.name,
        percentUsed: budget.percentUsed,
        status:
          budget.percentUsed > 100 ? 'exceeded' : budget.percentUsed >= 80 ? 'warning' : 'on_track',
        totalLimit: budget.totalLimit,
        totalSpent: budget.totalSpent,
      })),
      recentTransactions: recent.items,
      upcomingBills: bills.map((bill) => ({
        id: bill.id,
        name: bill.name,
        amount: abs(bill.amount),
        currency: bill.currency,
        dueOn: bill.next_occurrence_on!,
      })),
      goals: goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        progressPercent: percentOf(goal.current_amount, goal.target_amount),
        targetAmount: goal.target_amount,
        currentAmount: goal.current_amount,
      })),
      unreadNotifications: Number(unread?.count ?? 0),
    };
  });
}

export interface BudgetVarianceRow {
  categoryId: string;
  categoryName: string;
  budgeted: string;
  actual: string;
  variance: string;
  variancePercent: number;
  status: 'under' | 'over' | 'on_target';
}

/** Budget vs actual, the bar chart in the analytics dashboard. */
export async function budgetVariance(
  workspaceId: string,
  baseCurrency: string,
  asOf: DateOnly = today('UTC'),
): Promise<BudgetVarianceRow[]> {
  const budgets = await listBudgets(workspaceId, baseCurrency, { activeOn: asOf });
  const rows: BudgetVarianceRow[] = [];

  for (const budget of budgets) {
    for (const line of budget.lines) {
      const variance = subtract(line.limitAmount, line.spentAmount);
      rows.push({
        categoryId: line.categoryId,
        categoryName: line.categoryName,
        budgeted: line.limitAmount,
        actual: line.spentAmount,
        variance,
        variancePercent: percentOf(variance, line.limitAmount),
        status: compare(variance, '0') < 0 ? 'over' : line.percentUsed >= 95 ? 'on_target' : 'under',
      });
    }
  }

  return rows;
}

export interface SavingsRatePoint {
  period: string;
  income: string;
  expenses: string;
  saved: string;
  savingsRate: number;
}

export async function savingsRateTrend(workspaceId: string, months = 12): Promise<SavingsRatePoint[]> {
  const end = endOfMonth(today('UTC'));
  const start = startOfMonth(addMonths(end, -(months - 1)));
  const points = await trends(workspaceId, { start, end }, 'month');

  return points.map((point) => ({
    period: point.period,
    income: point.income,
    expenses: point.expenses,
    saved: point.net,
    savingsRate: compare(point.income, '0') > 0 ? percentOf(point.net, point.income) : 0,
  }));
}

export interface SpendingInsight {
  type: 'overspend' | 'savings_opportunity' | 'trend' | 'positive';
  title: string;
  detail: string;
  data?: Record<string, unknown>;
}

/**
 * Plain-language observations for the "insights & recommendations" panel.
 * Deliberately rule-based and explainable — every insight can be traced to a
 * number the user can verify themselves.
 */
export async function insights(
  workspaceId: string,
  baseCurrency: string,
  asOf: DateOnly = today('UTC'),
): Promise<SpendingInsight[]> {
  const results: SpendingInsight[] = [];

  const comparison = await comparePeriods(workspaceId, 'month', asOf);
  const monthRange = periodRange('month', asOf);

  if (comparison.expenseChangePercent > 20 && compare(comparison.previous.expenses, '0') > 0) {
    results.push({
      type: 'trend',
      title: 'Spending is up sharply this month',
      detail: `You have spent ${baseCurrency} ${comparison.current.expenses} so far, ${Math.round(comparison.expenseChangePercent)}% more than the same point last month (${baseCurrency} ${comparison.previous.expenses}).`,
      data: { changePercent: comparison.expenseChangePercent },
    });
  } else if (comparison.expenseChangePercent < -10) {
    results.push({
      type: 'positive',
      title: 'Spending is down from last month',
      detail: `Expenses fell ${Math.abs(Math.round(comparison.expenseChangePercent))}% versus last month. At this pace you would save an extra ${baseCurrency} ${subtract(comparison.previous.expenses, comparison.current.expenses)}.`,
    });
  }

  if (comparison.current.savingsRate > 0 && comparison.current.savingsRate < 10) {
    results.push({
      type: 'savings_opportunity',
      title: 'Savings rate is below 10%',
      detail: `You are keeping ${comparison.current.savingsRate}% of your income this month. Trimming the largest category by 15% would add roughly ${baseCurrency} ${largestCategoryTrim(await categoryBreakdown(workspaceId, monthRange, { depth: 0, limit: 1 }))} back.`,
      data: { savingsRate: comparison.current.savingsRate },
    });
  } else if (comparison.current.savingsRate >= 20) {
    results.push({
      type: 'positive',
      title: 'Strong savings rate',
      detail: `You are saving ${comparison.current.savingsRate}% of your income this month.`,
    });
  }

  const variance = await budgetVariance(workspaceId, baseCurrency, asOf);
  const over = variance.filter((row) => row.status === 'over');
  if (over.length > 0) {
    const worst = over.sort((a, b) => Number(a.variance) - Number(b.variance))[0]!;
    results.push({
      type: 'overspend',
      title: `${worst.categoryName} is over budget`,
      detail: `${worst.categoryName} is at ${baseCurrency} ${worst.actual} against a ${baseCurrency} ${worst.budgeted} limit — ${baseCurrency} ${abs(worst.variance)} over.`,
      data: { categoryId: worst.categoryId },
    });
  }

  return results;
}

function largestCategoryTrim(breakdown: CategoryBreakdownItem[]): string {
  const largest = breakdown[0];
  if (!largest) return '0.00';
  return new Decimal(largest.total).times(0.15).toDecimalPlaces(2).toFixed(2);
}
