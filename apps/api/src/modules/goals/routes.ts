import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http.js';
import { requireEditor, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { dateSchema, positiveMoneySchema } from '../shared/schemas.js';
import * as goalService from './service.js';

const idParams = z.object({ workspaceId: uuidSchema, id: uuidSchema });

const goalCategorySchema = z.enum([
  'emergency_fund',
  'vacation',
  'car',
  'house',
  'education',
  'retirement',
  'investment',
  'other',
]);

export const goalRouter: Router = Router({ mergeParams: true });

goalRouter.get(
  '/',
  requireViewer,
  validate({ query: z.object({ status: z.enum(['active', 'achieved', 'paused', 'cancelled']).optional() }) }),
  asyncHandler(async (req, res) => {
    const options = query<{ status?: 'active' | 'achieved' | 'paused' | 'cancelled' }>(req);
    res.json({ goals: await goalService.listGoals(workspaceContext(req).id, options) });
  }),
);

goalRouter.post(
  '/',
  requireEditor,
  validate({
    body: z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(1000).nullish(),
      category: goalCategorySchema.optional(),
      targetAmount: positiveMoneySchema,
      currency: z.string().length(3).optional(),
      targetDate: dateSchema.nullish(),
      accountId: uuidSchema.nullish(),
      priority: z.number().int().min(1).max(5).optional(),
      color: z.string().max(20).nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const input = body<Omit<goalService.CreateGoalInput, 'workspaceId' | 'createdBy' | 'currency'> & { currency?: string }>(req);
    const goal = await goalService.createGoal({
      ...input,
      currency: input.currency ?? workspace.baseCurrency,
      workspaceId: workspace.id,
      createdBy: req.user!.id,
    });
    res.status(201).json({ goal });
  }),
);

goalRouter.get(
  '/:id',
  requireViewer,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const workspaceId = workspaceContext(req).id;
    const [goal, contributions] = await Promise.all([
      goalService.getGoal(workspaceId, id),
      goalService.listContributions(workspaceId, id),
    ]);
    res.json({ goal, contributions });
  }),
);

goalRouter.patch(
  '/:id',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(1000).nullish(),
      targetAmount: positiveMoneySchema.optional(),
      targetDate: dateSchema.nullish(),
      status: z.enum(['active', 'achieved', 'paused', 'cancelled']).optional(),
      priority: z.number().int().min(1).max(5).optional(),
      color: z.string().max(20).nullish(),
      accountId: uuidSchema.nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const input = body<goalService.UpdateGoalInput>(req);
    res.json({ goal: await goalService.updateGoal(workspaceContext(req).id, id, input, req.user!.id) });
  }),
);

goalRouter.delete(
  '/:id',
  requireEditor,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await goalService.deleteGoal(workspaceContext(req).id, id, req.user!.id);
    res.status(204).send();
  }),
);

goalRouter.post(
  '/:id/contributions',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      amount: positiveMoneySchema,
      occurredOn: dateSchema.optional(),
      transactionId: uuidSchema.nullish(),
      note: z.string().max(300).nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const input = body<Omit<goalService.ContributionInput, 'workspaceId' | 'goalId' | 'createdBy'>>(req);
    const goal = await goalService.addContribution({
      ...input,
      workspaceId: workspaceContext(req).id,
      goalId: id,
      createdBy: req.user!.id,
    });
    res.status(201).json({ goal });
  }),
);

goalRouter.delete(
  '/:id/contributions/:contributionId',
  requireEditor,
  validate({ params: idParams.extend({ contributionId: uuidSchema }) }),
  asyncHandler(async (req, res) => {
    const { contributionId } = params<{ contributionId: string }>(req);
    await goalService.deleteContribution(workspaceContext(req).id, contributionId);
    res.status(204).send();
  }),
);
