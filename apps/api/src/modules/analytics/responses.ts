import { z } from 'zod/v4';
import { accountSchema } from '../accounts/responses.js';
import {
  component,
  currencyCode,
  dateOnly,
  dateRange,
  integer,
  jsonObject,
  money,
  percent,
  periodTotals,
  uuid,
} from '../shared/responses.js';
import { transactionSchema } from '../transactions/responses.js';

/**
 * What this module returns — analytics *and* reports, since `reportRouter` is
 * declared beside `analyticsRouter` in `routes.ts` even though its service lives
 * in `modules/reports`.
 *
 * **Every figure here is in the workspace's base currency.** Each transaction
 * stored its own `base_amount` at write time, converted at the rate in force on
 * the day it happened, so none of this joins the rate table at read time and a
 * historical figure does not move when today's rate does.
 *
 * The dashboard reuses `Account` and `Transaction` rather than describing
 * cut-down copies: the rows it embeds are the same rows those endpoints return,
 * and a client that already renders one should not need a second type for it.
 */

export const categoryBreakdownItemSchema = component(
  'CategoryBreakdownItem',
  z.object({
    categoryId: uuid.nullable().describe('Null for the uncategorised bucket.'),
    categoryName: z.string(),
    categoryColor: z.string().nullable(),
    parentId: uuid.nullable(),
    total: money,
    transactionCount: integer,
    percentOfTotal: percent,
  }),
);

export const trendPointSchema = component(
  'TrendPoint',
  z.object({
    period: z.string().describe('The bucket label: `2026`, `2026-03` or `2026-03-14`, following `unit`.'),
    periodStart: dateOnly,
    income: money,
    expenses: money,
    net: money,
  }),
);

export const comparisonResponse = z
  .object({
    current: periodTotals.extend({ range: dateRange }),
    previous: periodTotals.extend({ range: dateRange }),
    incomeChangePercent: percent,
    expenseChangePercent: percent,
    netChange: money,
  })
  .describe('One period against another — this month versus last, this year versus last.');

export const dashboardResponse = z
  .object({
    asOf: dateOnly,
    baseCurrency: currencyCode,
    totalBalance: money,
    balanceByCurrency: z.record(currencyCode, money),
    accounts: z.array(accountSchema),
    month: periodTotals.extend({ range: dateRange }),
    monthOverMonth: comparisonResponse,
    topCategories: z.array(categoryBreakdownItemSchema),
    budgets: z.array(
      z.object({
        id: uuid,
        name: z.string(),
        percentUsed: percent,
        status: z.string().describe('`on_track`, `warning` or `exceeded`.'),
        totalLimit: money,
        totalSpent: money,
      }),
    ),
    recentTransactions: z.array(transactionSchema),
    upcomingBills: z.array(
      z.object({ id: uuid, name: z.string(), amount: money, currency: currencyCode, dueOn: dateOnly }),
    ),
    goals: z.array(
      z.object({ id: uuid, name: z.string(), progressPercent: percent, targetAmount: money, currentAmount: money }),
    ),
    unreadNotifications: integer,
  })
  .describe('Everything the main dashboard needs, in one round trip. Cached briefly in Redis.');

export const summaryResponse = z.object({ range: dateRange, totals: periodTotals });

export const categoryBreakdownResponse = z.object({
  range: dateRange,
  categories: z.array(categoryBreakdownItemSchema),
});

export const trendsResponse = z
  .object({ range: dateRange, points: z.array(trendPointSchema) })
  .describe('A dense series: a period with no activity is a zero rather than a missing point.');

export const netWorthResponse = z
  .object({ points: z.array(z.object({ periodEnd: dateOnly, balance: money })) })
  .describe('The running balance at each month end, computed over the whole ledger rather than extrapolated.');

export const savingsRateResponse = z.object({
  points: z.array(
    z.object({
      period: z.string(),
      income: money,
      expenses: money,
      saved: money,
      savingsRate: percent,
    }),
  ),
});

export const budgetVarianceResponse = z.object({
  rows: z.array(
    z.object({
      categoryId: uuid,
      categoryName: z.string(),
      budgeted: money,
      actual: money,
      variance: money.describe('Budgeted minus actual, so a negative number is an overspend.'),
      variancePercent: percent,
      status: z.enum(['under', 'over', 'on_target']),
    }),
  ),
});

export const insightsResponse = z
  .object({
    insights: z.array(
      z.object({
        type: z.enum(['overspend', 'savings_opportunity', 'trend', 'positive']),
        title: z.string(),
        detail: z.string(),
        data: jsonObject.optional().describe('The numbers behind the sentence, when there are any.'),
      }),
    ),
  })
  .describe('Rule-based observations, every one traceable to a figure the user can check.');

// --- reports ---------------------------------------------------------------

export const monthlyStatementResponse = z
  .object({
    statement: z.object({
      workspaceId: uuid,
      range: dateRange,
      baseCurrency: currencyCode,
      openingBalance: money.describe('Derived from the ledger before the range, so a past month is reproducible.'),
      closingBalance: money,
      totals: periodTotals,
      categories: z.array(categoryBreakdownItemSchema).describe('Top-level only: subcategories are rolled up.'),
      accounts: z.array(
        z.object({
          id: uuid,
          name: z.string(),
          currency: currencyCode,
          closingBalance: money.describe("In the account's own currency, not the base currency."),
        }),
      ),
      budgets: z.array(
        z.object({ name: z.string(), totalLimit: money, totalSpent: money, percentUsed: percent }),
      ),
      transactionCount: integer,
    }),
  })
  .describe('A closed statement for one month.');

export const yearOverYearResponse = z
  .object({
    year: integer,
    rows: z.array(
      z.object({
        month: z.string().describe('The `MM` half of the month key, shared by both years.'),
        currentIncome: money,
        currentExpenses: money,
        previousIncome: money,
        previousExpenses: money,
        expenseChangePercent: percent.describe('0 when the prior year had no spending that month — not a 100% fall.'),
      }),
    ),
  })
  .describe('Twelve months of this year against the same months of last.');
