import {
  BUDGET_PERIODS,
  LIMITS,
  currencyField,
  nameField,
  percentField,
  reasonField,
} from '@finance/schemas';
import { Router } from 'express';
import { z } from 'zod/v4';
import { asyncHandler } from '../../lib/http.js';
import { requireEditor, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { NO_BODY, responds } from '../../middleware/responds.js';
import { booleanQueryWithDefault, dateSchema, positiveMoneySchema } from '../shared/schemas.js';
import { budgetListResponse, budgetResponse } from './responses.js';
import * as budgetService from './service.js';

const idParams = z.object({ workspaceId: uuidSchema, id: uuidSchema });

const lineSchema = z.object({
  categoryId: uuidSchema,
  limitAmount: positiveMoneySchema,
  includeSubcategories: z.boolean().optional(),
  alertThresholdPercent: percentField.optional(),
});

export const budgetRouter: Router = Router({ mergeParams: true });

budgetRouter.get(
  '/',
  requireViewer,
  validate({
    query: z.object({
      activeOn: dateSchema.optional(),
      includeInactive: booleanQueryWithDefault(false),
    }),
  }),
  responds({ 200: budgetListResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const options = query<{ activeOn?: string; includeInactive: boolean }>(req);
    res.json({ budgets: await budgetService.listBudgets(workspace.id, workspace.baseCurrency, options) });
  }),
);

budgetRouter.post(
  '/',
  requireEditor,
  validate({
    body: z.object({
      name: nameField,
      period: z.enum(BUDGET_PERIODS),
      startDate: dateSchema,
      endDate: dateSchema.optional(),
      currency: currencyField.optional(),
      rollover: z.boolean().optional(),
      lines: z
        .array(lineSchema)
        .min(LIMITS.budgetLines.min, 'validation.atLeastOneLine')
        .max(LIMITS.budgetLines.max, 'validation.maxBudgetLines'),
    }),
  }),
  responds({ 201: budgetResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const input = body<Omit<budgetService.CreateBudgetInput, 'workspaceId' | 'baseCurrency' | 'createdBy'>>(req);
    const budget = await budgetService.createBudget({
      ...input,
      workspaceId: workspace.id,
      baseCurrency: workspace.baseCurrency,
      createdBy: req.user!.id,
    });
    res.status(201).json({ budget });
  }),
);

budgetRouter.get(
  '/:id',
  requireViewer,
  validate({ params: idParams }),
  responds({ 200: budgetResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { id } = params<{ id: string }>(req);
    res.json({ budget: await budgetService.getBudgetProgress(workspace.id, id, workspace.baseCurrency) });
  }),
);

budgetRouter.patch(
  '/:id',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      name: nameField.optional(),
      isActive: z.boolean().optional(),
      rollover: z.boolean().optional(),
    }),
  }),
  responds({ 200: budgetResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { id } = params<{ id: string }>(req);
    const input = body<budgetService.UpdateBudgetInput>(req);
    res.json({
      budget: await budgetService.updateBudget(workspace.id, id, input, workspace.baseCurrency, req.user!.id),
    });
  }),
);

budgetRouter.delete(
  '/:id',
  requireEditor,
  validate({ params: idParams }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await budgetService.deleteBudget(workspaceContext(req).id, id, req.user!.id);
    res.status(204).send();
  }),
);

budgetRouter.put(
  '/:id/lines',
  requireEditor,
  validate({ params: idParams, body: lineSchema }),
  responds({ 200: budgetResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { id } = params<{ id: string }>(req);
    await budgetService.upsertBudgetLine(workspace.id, id, body<budgetService.BudgetLineInput>(req));
    res.json({ budget: await budgetService.getBudgetProgress(workspace.id, id, workspace.baseCurrency) });
  }),
);

budgetRouter.delete(
  '/:id/lines/:lineId',
  requireEditor,
  validate({ params: idParams.extend({ lineId: uuidSchema }) }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const { id, lineId } = params<{ id: string; lineId: string }>(req);
    await budgetService.deleteBudgetLine(workspaceContext(req).id, id, lineId);
    res.status(204).send();
  }),
);

/** Mid-period rebudgeting: keeps an auditable trail of the previous limit. */
budgetRouter.post(
  '/:id/lines/:lineId/revise',
  requireEditor,
  validate({
    params: idParams.extend({ lineId: uuidSchema }),
    body: z.object({ newLimit: positiveMoneySchema, reason: reasonField.nullish() }),
  }),
  responds({ 200: budgetResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { id, lineId } = params<{ id: string; lineId: string }>(req);
    const input = body<{ newLimit: string; reason?: string | null }>(req);

    await budgetService.reviseBudgetLine(
      workspace.id,
      id,
      lineId,
      input.newLimit,
      input.reason ?? null,
      req.user!.id,
    );

    res.json({ budget: await budgetService.getBudgetProgress(workspace.id, id, workspace.baseCurrency) });
  }),
);

budgetRouter.post(
  '/:id/rollover',
  requireEditor,
  validate({ params: idParams }),
  responds({ 201: budgetResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { id } = params<{ id: string }>(req);
    const budget = await budgetService.rolloverBudget(workspace.id, id, workspace.baseCurrency, req.user!.id);
    res.status(201).json({ budget });
  }),
);
