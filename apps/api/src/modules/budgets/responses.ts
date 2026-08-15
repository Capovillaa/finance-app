import { BUDGET_PERIODS } from '@finance/schemas';
import { z } from 'zod/v4';
import { component, currencyCode, dateOnly, money, percent, uuid } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * Every endpoint here answers with **progress**, never with the stored row: a
 * budget is only meaningful next to what has been spent against it, and the
 * service recomputes that on each read. So `PUT /lines` and
 * `POST /lines/:id/revise` both return the whole budget again rather than the
 * line they touched — the totals above it have moved.
 *
 * `spentAmount` and the limits are in the budget's own `currency`, which the
 * service has already converted into from the workspace base currency where
 * they differ.
 */

export const budgetLineProgressSchema = component(
  'BudgetLineProgress',
  z.object({
    id: uuid,
    categoryId: uuid,
    categoryName: z.string(),
    categoryColor: z.string().nullable(),
    includeSubcategories: z.boolean().describe('When true, spending in descendant categories counts against this line.'),
    limitAmount: money,
    spentAmount: money,
    remainingAmount: money.describe('Negative once the line is overspent.'),
    percentUsed: percent,
    alertThresholdPercent: percent.describe('Where `warning` starts.'),
    status: z.enum(['on_track', 'warning', 'exceeded']).describe('Derived from spend against limit; never sent by a caller.'),
  }),
);

export const budgetProgressSchema = component(
  'BudgetProgress',
  z.object({
    id: uuid,
    name: z.string(),
    period: z.enum(BUDGET_PERIODS),
    startDate: dateOnly,
    endDate: dateOnly,
    currency: currencyCode,
    rollover: z.boolean(),
    isActive: z.boolean(),
    totalLimit: money,
    totalSpent: money,
    totalRemaining: money,
    percentUsed: percent,
    periodProgressPercent: percent.describe('How much of the period has elapsed, so a client can show pace against spend.'),
    lines: z.array(budgetLineProgressSchema),
  }),
);

export const budgetListResponse = z.object({ budgets: z.array(budgetProgressSchema) });

export const budgetResponse = z.object({ budget: budgetProgressSchema });
