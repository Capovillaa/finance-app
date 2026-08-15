import { Router } from 'express';
import { z } from 'zod/v4';
import { asyncHandler } from '../../lib/http.js';
import { requireAdmin, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { NO_BODY, responds } from '../../middleware/responds.js';
import { body, params, uuidSchema, validate } from '../../middleware/validate.js';
import { today } from '../../lib/dates.js';
import { evaluateWorkspaceAlerts } from './engine.js';
import { alertEvaluationResponse, alertRuleListResponse, alertRuleResponse } from './responses.js';
import * as alertService from './service.js';

const alertTypeSchema = z.enum([
  'budget_threshold',
  'budget_exceeded',
  'large_transaction',
  'unusual_spending',
  'duplicate_transaction',
  'bill_due',
  'goal_milestone',
  'low_balance',
]);

export const alertRouter: Router = Router({ mergeParams: true });

alertRouter.get(
  '/',
  requireViewer,
  responds({ 200: alertRuleListResponse }),
  asyncHandler(async (req, res) => {
    res.json({ rules: await alertService.listAlertRules(workspaceContext(req).id) });
  }),
);

alertRouter.put(
  '/',
  requireAdmin,
  validate({
    body: z.object({
      type: alertTypeSchema,
      isEnabled: z.boolean().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      channels: z.array(z.enum(['in_app', 'email', 'push'])).min(1).optional(),
      scopeCategoryId: uuidSchema.nullish(),
      scopeAccountId: uuidSchema.nullish(),
    }),
  }),
  responds({ 200: alertRuleResponse }),
  asyncHandler(async (req, res) => {
    const input = body<Omit<alertService.UpsertAlertRuleInput, 'workspaceId' | 'actorId'>>(req);
    const rule = await alertService.upsertAlertRule({
      ...input,
      workspaceId: workspaceContext(req).id,
      actorId: req.user!.id,
    });
    res.json({ rule });
  }),
);

alertRouter.delete(
  '/:id',
  requireAdmin,
  validate({ params: z.object({ workspaceId: uuidSchema, id: uuidSchema }) }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await alertService.deleteAlertRule(workspaceContext(req).id, id);
    res.status(204).send();
  }),
);

/** Runs the alert scan on demand, rather than waiting for the scheduled job. */
alertRouter.post(
  '/evaluate',
  requireAdmin,
  responds({ 200: alertEvaluationResponse }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    res.json(await evaluateWorkspaceAlerts(workspace.id, today(workspace.timezone)));
  }),
);
