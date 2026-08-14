import { sql } from 'kysely';
import { db, type Executor } from '../../db/client.js';
import type { BudgetPeriod } from '../../db/types.js';
import {
  addDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  today,
  type DateOnly,
} from '../../lib/dates.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { abs, add, compare, multiply, percentOf, subtract } from '../../lib/money.js';
import { invalidateWorkspaceCache } from '../../lib/redis.js';
import { recordActivity } from '../activity/service.js';
import { descendantIds } from '../categories/service.js';
import { convertAmount } from '../currencies/service.js';

export interface BudgetLineInput {
  categoryId: string;
  limitAmount: string;
  includeSubcategories?: boolean;
  alertThresholdPercent?: number;
}

export interface CreateBudgetInput {
  workspaceId: string;
  baseCurrency: string;
  name: string;
  period: BudgetPeriod;
  /** Any date inside the intended period; the exact range is derived from it. */
  startDate: DateOnly;
  endDate?: DateOnly;
  currency?: string;
  rollover?: boolean;
  lines: BudgetLineInput[];
  createdBy: string;
}

/** Derives the calendar range for a period so budgets always align to it. */
export function budgetRange(period: BudgetPeriod, startDate: DateOnly, endDate?: DateOnly): { start: DateOnly; end: DateOnly } {
  switch (period) {
    case 'monthly':
      return { start: startOfMonth(startDate), end: endOfMonth(startDate) };
    case 'quarterly':
      return { start: startOfQuarter(startDate), end: endOfQuarter(startDate) };
    case 'yearly':
      return { start: startOfYear(startDate), end: endOfYear(startDate) };
    case 'custom': {
      if (!endDate) throw unprocessable('budgets.customEndDateRequired');
      if (endDate < startDate) throw unprocessable('budgets.endBeforeStart');
      return { start: startDate, end: endDate };
    }
  }
}

export async function createBudget(input: CreateBudgetInput): Promise<BudgetProgress> {
  if (input.lines.length === 0) throw unprocessable('budgets.noLines');

  const range = budgetRange(input.period, input.startDate, input.endDate);
  const currency = (input.currency ?? input.baseCurrency).toUpperCase();

  const categoryIds = input.lines.map((l) => l.categoryId);
  const known = await db
    .selectFrom('categories')
    .select(['id', 'kind'])
    .where('workspace_id', '=', input.workspaceId)
    .where('id', 'in', categoryIds)
    .execute();

  if (known.length !== new Set(categoryIds).size) {
    throw unprocessable('budgets.categoriesNotInWorkspace');
  }
  const incomeCategory = known.find((c) => c.kind === 'income');
  if (incomeCategory) throw unprocessable('budgets.expenseOnly');

  const budgetId = await db.transaction().execute(async (trx) => {
    const budget = await trx
      .insertInto('budgets')
      .values({
        workspace_id: input.workspaceId,
        name: input.name.trim(),
        period: input.period,
        start_date: range.start,
        end_date: range.end,
        currency,
        rollover: input.rollover ?? false,
        created_by: input.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('budget_lines')
      .values(
        input.lines.map((line) => ({
          budget_id: budget.id,
          workspace_id: input.workspaceId,
          category_id: line.categoryId,
          limit_amount: abs(line.limitAmount),
          include_subcategories: line.includeSubcategories ?? true,
          alert_threshold_percent: line.alertThresholdPercent ?? 80,
        })),
      )
      .execute();

    return budget.id;
  });

  await invalidateWorkspaceCache(input.workspaceId);
  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.createdBy,
    action: 'budget.created',
    entityType: 'budget',
    entityId: budgetId,
    summary: `Created budget "${input.name}" for ${range.start} to ${range.end}`,
  });

  return getBudgetProgress(input.workspaceId, budgetId, input.baseCurrency);
}

export interface BudgetLineProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  includeSubcategories: boolean;
  limitAmount: string;
  spentAmount: string;
  remainingAmount: string;
  percentUsed: number;
  alertThresholdPercent: number;
  status: 'on_track' | 'warning' | 'exceeded';
}

export interface BudgetProgress {
  id: string;
  name: string;
  period: BudgetPeriod;
  startDate: DateOnly;
  endDate: DateOnly;
  currency: string;
  rollover: boolean;
  isActive: boolean;
  totalLimit: string;
  totalSpent: string;
  totalRemaining: string;
  percentUsed: number;
  /** Fraction of the period elapsed, so the UI can show pace vs spend. */
  periodProgressPercent: number;
  lines: BudgetLineProgress[];
}

/**
 * Spending is measured in the workspace base currency (`base_amount`), which is
 * the only way a multi-currency workspace can compare against one limit. A
 * budget denominated in another currency has its limit converted at the rate in
 * force on the period start date.
 */
export async function getBudgetProgress(
  workspaceId: string,
  budgetId: string,
  baseCurrency: string,
  asOf: DateOnly = today('UTC'),
): Promise<BudgetProgress> {
  const budget = await db
    .selectFrom('budgets')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', budgetId)
    .executeTakeFirst();
  if (!budget) throw notFound('resources.budget');

  const lines = await db
    .selectFrom('budget_lines')
    .innerJoin('categories', 'categories.id', 'budget_lines.category_id')
    .select([
      'budget_lines.id as id',
      'budget_lines.category_id as category_id',
      'budget_lines.limit_amount as limit_amount',
      'budget_lines.include_subcategories as include_subcategories',
      'budget_lines.alert_threshold_percent as alert_threshold_percent',
      'categories.name as category_name',
      'categories.color as category_color',
    ])
    .where('budget_lines.budget_id', '=', budgetId)
    .orderBy('categories.name', 'asc')
    .execute();

  const spendByCategory = await spendingByCategory(workspaceId, budget.start_date, budget.end_date);

  const conversion =
    budget.currency === baseCurrency
      ? { rate: '1' }
      : await convertAmount('1', budget.currency, baseCurrency, budget.start_date);

  const lineProgress: BudgetLineProgress[] = [];
  let totalLimit = '0';
  let totalSpent = '0';

  for (const line of lines) {
    const ids = line.include_subcategories
      ? await descendantIds(workspaceId, line.category_id)
      : [line.category_id];

    const spent = ids.reduce<string>((acc, id) => add(acc, spendByCategory.get(id) ?? '0'), '0');
    const limitInBase =
      conversion.rate === '1' ? line.limit_amount : multiply(line.limit_amount, conversion.rate);

    const remaining = subtract(limitInBase, spent);
    const percentUsed = percentOf(spent, limitInBase);

    lineProgress.push({
      id: line.id,
      categoryId: line.category_id,
      categoryName: line.category_name,
      categoryColor: line.category_color,
      includeSubcategories: line.include_subcategories,
      limitAmount: limitInBase,
      spentAmount: spent,
      remainingAmount: remaining,
      percentUsed,
      alertThresholdPercent: line.alert_threshold_percent,
      status:
        compare(spent, limitInBase) > 0
          ? 'exceeded'
          : percentUsed >= line.alert_threshold_percent
            ? 'warning'
            : 'on_track',
    });

    totalLimit = add(totalLimit, limitInBase);
    totalSpent = add(totalSpent, spent);
  }

  return {
    id: budget.id,
    name: budget.name,
    period: budget.period,
    startDate: budget.start_date,
    endDate: budget.end_date,
    currency: baseCurrency,
    rollover: budget.rollover,
    isActive: budget.is_active,
    totalLimit,
    totalSpent,
    totalRemaining: subtract(totalLimit, totalSpent),
    percentUsed: percentOf(totalSpent, totalLimit),
    periodProgressPercent: periodElapsedPercent(budget.start_date, budget.end_date, asOf),
    lines: lineProgress,
  };
}

function periodElapsedPercent(start: DateOnly, end: DateOnly, asOf: DateOnly): number {
  if (asOf < start) return 0;
  if (asOf >= end) return 100;
  const totalDays = Math.max(1, daysInclusive(start, end));
  const elapsed = daysInclusive(start, asOf);
  return Math.round((elapsed / totalDays) * 10000) / 100;
}

function daysInclusive(start: DateOnly, end: DateOnly): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

/**
 * Expense totals per category for a date range, as positive magnitudes in the
 * workspace base currency. Transfers are excluded: moving money between your own
 * accounts is not spending.
 */
export async function spendingByCategory(
  workspaceId: string,
  from: DateOnly,
  to: DateOnly,
  executor: Executor = db,
): Promise<Map<string, string>> {
  const rows = await executor
    .selectFrom('transactions')
    .select((eb) => [
      'category_id',
      eb.fn.coalesce(eb.fn.sum<string>('base_amount'), sql<string>`0`).as('total'),
    ])
    .where('workspace_id', '=', workspaceId)
    .where('type', '=', 'expense')
    .where('status', 'in', ['cleared', 'pending'])
    .where('deleted_at', 'is', null)
    .where('occurred_on', '>=', from)
    .where('occurred_on', '<=', to)
    .groupBy('category_id')
    .execute();

  const result = new Map<string, string>();
  for (const row of rows) {
    if (row.category_id) result.set(row.category_id, abs(row.total));
  }
  return result;
}

export async function listBudgets(
  workspaceId: string,
  baseCurrency: string,
  options: { activeOn?: DateOnly; includeInactive?: boolean } = {},
): Promise<BudgetProgress[]> {
  let query = db.selectFrom('budgets').select('id').where('workspace_id', '=', workspaceId);
  if (!options.includeInactive) query = query.where('is_active', '=', true);
  if (options.activeOn) {
    query = query.where('start_date', '<=', options.activeOn).where('end_date', '>=', options.activeOn);
  }

  const rows = await query.orderBy('start_date', 'desc').execute();
  return Promise.all(rows.map((row) => getBudgetProgress(workspaceId, row.id, baseCurrency)));
}

export interface UpdateBudgetInput {
  name?: string;
  isActive?: boolean;
  rollover?: boolean;
}

export async function updateBudget(
  workspaceId: string,
  budgetId: string,
  input: UpdateBudgetInput,
  baseCurrency: string,
  actorId: string,
): Promise<BudgetProgress> {
  const result = await db
    .updateTable('budgets')
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.rollover !== undefined ? { rollover: input.rollover } : {}),
    })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', budgetId)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0) === 0) throw notFound('resources.budget');

  await invalidateWorkspaceCache(workspaceId);
  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'budget.updated',
    entityType: 'budget',
    entityId: budgetId,
    summary: 'Updated budget',
    changes: input as Record<string, unknown>,
  });

  return getBudgetProgress(workspaceId, budgetId, baseCurrency);
}

/**
 * Mid-period rebudgeting. The previous limit is preserved in `budget_revisions`
 * so a report can still explain why a category's ceiling moved.
 */
export async function reviseBudgetLine(
  workspaceId: string,
  budgetId: string,
  lineId: string,
  newLimit: string,
  reason: string | null,
  actorId: string,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const line = await trx
      .selectFrom('budget_lines')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('budget_id', '=', budgetId)
      .where('id', '=', lineId)
      .executeTakeFirst();
    if (!line) throw notFound('resources.budgetLine');

    await trx
      .insertInto('budget_revisions')
      .values({
        budget_line_id: lineId,
        workspace_id: workspaceId,
        previous_limit: line.limit_amount,
        new_limit: abs(newLimit),
        effective_from: today('UTC'),
        reason,
        changed_by: actorId,
      })
      .execute();

    await trx
      .updateTable('budget_lines')
      .set({ limit_amount: abs(newLimit) })
      .where('id', '=', lineId)
      .execute();
  });

  await invalidateWorkspaceCache(workspaceId);
  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'budget.line_revised',
    entityType: 'budget',
    entityId: budgetId,
    summary: `Revised a budget line limit to ${newLimit}`,
    changes: { lineId, newLimit, reason },
  });
}

export async function upsertBudgetLine(
  workspaceId: string,
  budgetId: string,
  line: BudgetLineInput,
): Promise<void> {
  await db
    .insertInto('budget_lines')
    .values({
      budget_id: budgetId,
      workspace_id: workspaceId,
      category_id: line.categoryId,
      limit_amount: abs(line.limitAmount),
      include_subcategories: line.includeSubcategories ?? true,
      alert_threshold_percent: line.alertThresholdPercent ?? 80,
    })
    .onConflict((oc) =>
      oc.columns(['budget_id', 'category_id']).doUpdateSet({
        limit_amount: abs(line.limitAmount),
        include_subcategories: line.includeSubcategories ?? true,
        alert_threshold_percent: line.alertThresholdPercent ?? 80,
      }),
    )
    .execute();

  await invalidateWorkspaceCache(workspaceId);
}

export async function deleteBudgetLine(workspaceId: string, budgetId: string, lineId: string): Promise<void> {
  const result = await db
    .deleteFrom('budget_lines')
    .where('workspace_id', '=', workspaceId)
    .where('budget_id', '=', budgetId)
    .where('id', '=', lineId)
    .executeTakeFirst();
  if (Number(result.numDeletedRows ?? 0) === 0) throw notFound('resources.budgetLine');
  await invalidateWorkspaceCache(workspaceId);
}

export async function deleteBudget(workspaceId: string, budgetId: string, actorId: string): Promise<void> {
  const result = await db
    .deleteFrom('budgets')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', budgetId)
    .executeTakeFirst();
  if (Number(result.numDeletedRows ?? 0) === 0) throw notFound('resources.budget');

  await invalidateWorkspaceCache(workspaceId);
  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'budget.deleted',
    entityType: 'budget',
    entityId: budgetId,
    summary: 'Deleted budget',
  });
}

/** Clones a budget into the next period, the usual "roll it forward" action. */
export async function rolloverBudget(
  workspaceId: string,
  budgetId: string,
  baseCurrency: string,
  actorId: string,
): Promise<BudgetProgress> {
  const budget = await db
    .selectFrom('budgets')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', budgetId)
    .executeTakeFirst();
  if (!budget) throw notFound('resources.budget');

  const lines = await db.selectFrom('budget_lines').selectAll().where('budget_id', '=', budgetId).execute();
  const nextStart = addDays(budget.end_date, 1);

  return createBudget({
    workspaceId,
    baseCurrency,
    name: budget.name,
    period: budget.period,
    startDate: nextStart,
    endDate: budget.period === 'custom' ? addDays(nextStart, daysInclusive(budget.start_date, budget.end_date) - 1) : undefined,
    currency: budget.currency,
    rollover: budget.rollover,
    createdBy: actorId,
    lines: lines.map((line) => ({
      categoryId: line.category_id,
      limitAmount: line.limit_amount,
      includeSubcategories: line.include_subcategories,
      alertThresholdPercent: line.alert_threshold_percent,
    })),
  });
}
