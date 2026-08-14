import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http.js';
import { requireViewer, workspaceContext } from '../../middleware/auth.js';
import { query, uuidSchema, validate } from '../../middleware/validate.js';
import { addMonths, periodRange, startOfMonth, today } from '../../lib/dates.js';
import { dateSchema } from '../shared/schemas.js';
import * as analytics from './service.js';
import * as reports from '../reports/service.js';

const workspaceParams = z.object({ workspaceId: uuidSchema });

const rangeQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const analyticsRouter: Router = Router({ mergeParams: true });

analyticsRouter.use(requireViewer);

function resolveRange(workspaceTimezone: string, from?: string, to?: string) {
  if (from && to) return { start: from, end: to };
  const current = periodRange('month', today(workspaceTimezone));
  return { start: from ?? current.start, end: to ?? current.end };
}

analyticsRouter.get(
  '/dashboard',
  validate({ params: workspaceParams }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    res.json(
      await analytics.dashboardSummary(workspace.id, workspace.baseCurrency, req.user!.id, workspace.timezone),
    );
  }),
);

analyticsRouter.get(
  '/summary',
  validate({ params: workspaceParams, query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { from, to } = query<{ from?: string; to?: string }>(req);
    const range = resolveRange(workspace.timezone, from, to);
    res.json({ range, totals: await analytics.periodTotals(workspace.id, range) });
  }),
);

analyticsRouter.get(
  '/categories',
  validate({
    params: workspaceParams,
    query: rangeQuery.extend({
      type: z.enum(['expense', 'income']).default('expense'),
      depth: z.coerce.number().int().min(0).max(2).default(0),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const options = query<{ from?: string; to?: string; type: 'expense' | 'income'; depth: 0 | 1 | 2; limit?: number }>(req);
    const range = resolveRange(workspace.timezone, options.from, options.to);
    res.json({
      range,
      categories: await analytics.categoryBreakdown(workspace.id, range, {
        type: options.type,
        depth: options.depth,
        ...(options.limit ? { limit: options.limit } : {}),
      }),
    });
  }),
);

analyticsRouter.get(
  '/trends',
  validate({
    params: workspaceParams,
    query: rangeQuery.extend({
      unit: z.enum(['day', 'week', 'month', 'year']).default('month'),
      months: z.coerce.number().int().min(1).max(60).default(12),
    }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const options = query<{ from?: string; to?: string; unit: 'day' | 'week' | 'month' | 'year'; months: number }>(req);

    const end = options.to ?? periodRange('month', today(workspace.timezone)).end;
    const start = options.from ?? startOfMonth(addMonths(end, -(options.months - 1)));

    res.json({ range: { start, end }, points: await analytics.trends(workspace.id, { start, end }, options.unit) });
  }),
);

analyticsRouter.get(
  '/net-worth',
  validate({ params: workspaceParams, query: z.object({ months: z.coerce.number().int().min(1).max(60).default(12) }) }),
  asyncHandler(async (req, res) => {
    const { months } = query<{ months: number }>(req);
    res.json({ points: await analytics.netWorthTrend(workspaceContext(req).id, months) });
  }),
);

analyticsRouter.get(
  '/savings-rate',
  validate({ params: workspaceParams, query: z.object({ months: z.coerce.number().int().min(1).max(60).default(12) }) }),
  asyncHandler(async (req, res) => {
    const { months } = query<{ months: number }>(req);
    res.json({ points: await analytics.savingsRateTrend(workspaceContext(req).id, months) });
  }),
);

analyticsRouter.get(
  '/budget-variance',
  validate({ params: workspaceParams, query: z.object({ asOf: dateSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { asOf } = query<{ asOf?: string }>(req);
    res.json({
      rows: await analytics.budgetVariance(
        workspace.id,
        workspace.baseCurrency,
        asOf ?? today(workspace.timezone),
      ),
    });
  }),
);

analyticsRouter.get(
  '/compare',
  validate({
    params: workspaceParams,
    query: z.object({
      unit: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
      anchor: dateSchema.optional(),
      offset: z.coerce.number().int().min(-24).max(-1).default(-1),
    }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const options = query<{ unit: 'day' | 'week' | 'month' | 'quarter' | 'year'; anchor?: string; offset: number }>(req);
    res.json(
      await analytics.comparePeriods(
        workspace.id,
        options.unit,
        options.anchor ?? today(workspace.timezone),
        options.offset,
      ),
    );
  }),
);

analyticsRouter.get(
  '/insights',
  validate({ params: workspaceParams }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    res.json({ insights: await analytics.insights(workspace.id, workspace.baseCurrency, today(workspace.timezone)) });
  }),
);

// --- reports ---------------------------------------------------------------

export const reportRouter: Router = Router({ mergeParams: true });

reportRouter.use(requireViewer);

reportRouter.get(
  '/statement',
  validate({ params: workspaceParams, query: z.object({ month: dateSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { month } = query<{ month?: string }>(req);
    res.json({
      statement: await reports.monthlyStatement(
        workspace.id,
        workspace.baseCurrency,
        month ?? today(workspace.timezone),
      ),
    });
  }),
);

reportRouter.get(
  '/year-over-year',
  validate({
    params: workspaceParams,
    query: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { year } = query<{ year?: number }>(req);
    const targetYear = year ?? Number(today(workspace.timezone).slice(0, 4));
    res.json({ year: targetYear, rows: await reports.yearOverYear(workspace.id, targetYear) });
  }),
);

reportRouter.get(
  '/export/transactions.csv',
  validate({
    params: workspaceParams,
    query: rangeQuery.extend({
      accountIds: z.union([z.string(), z.array(z.string())]).optional(),
      categoryIds: z.union([z.string(), z.array(z.string())]).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const options = query<{ from?: string; to?: string; accountIds?: string | string[]; categoryIds?: string | string[] }>(req);

    const toList = (value?: string | string[]): string[] | undefined => {
      if (!value) return undefined;
      const list = Array.isArray(value) ? value : value.split(',');
      return list.map((v) => v.trim()).filter(Boolean);
    };

    const csv = await reports.exportTransactionsCsv(workspace.id, {
      ...(options.from ? { from: options.from } : {}),
      ...(options.to ? { to: options.to } : {}),
      ...(toList(options.accountIds) ? { accountIds: toList(options.accountIds)! } : {}),
      ...(toList(options.categoryIds) ? { categoryIds: toList(options.categoryIds)! } : {}),
    });

    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="transactions-${today(workspace.timezone)}.csv"`);
    res.send(csv);
  }),
);

reportRouter.get(
  '/export/statement.csv',
  validate({ params: workspaceParams, query: z.object({ month: dateSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { month } = query<{ month?: string }>(req);
    const anchor = month ?? today(workspace.timezone);
    const csv = await reports.exportStatementCsv(workspace.id, workspace.baseCurrency, anchor);

    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="statement-${anchor.slice(0, 7)}.csv"`);
    res.send(csv);
  }),
);
