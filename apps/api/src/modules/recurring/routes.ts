import {
  LIMITS,
  RECURRING_FREQUENCIES,
  TRANSACTION_TYPES,
  dayOfMonthField,
  descriptionField,
  leadTimeDaysField,
  merchantField,
  monthOfYearField,
  nameField,
  notesField,
  occurrenceLimitField,
  recurringIntervalField,
  weekdayField,
} from '@finance/schemas';
import { Router } from 'express';
import { z } from 'zod/v4';
import { asyncHandler } from '../../lib/http.js';
import { requireEditor, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { addDays, today } from '../../lib/dates.js';
import { booleanQueryWithDefault, dateSchema, positiveMoneySchema } from '../shared/schemas.js';
import * as recurringService from './service.js';

const idParams = z.object({ workspaceId: uuidSchema, id: uuidSchema });

export const recurringRouter: Router = Router({ mergeParams: true });

recurringRouter.get(
  '/',
  requireViewer,
  validate({ query: z.object({ includeInactive: booleanQueryWithDefault(false) }) }),
  asyncHandler(async (req, res) => {
    const options = query<{ includeInactive: boolean }>(req);
    res.json({ recurring: await recurringService.listRecurring(workspaceContext(req).id, options) });
  }),
);

recurringRouter.post(
  '/',
  requireEditor,
  validate({
    body: z
      .object({
        accountId: uuidSchema,
        categoryId: uuidSchema.nullish(),
        name: nameField,
        type: z.enum(TRANSACTION_TYPES),
        amount: positiveMoneySchema,
        description: descriptionField,
        merchant: merchantField.nullish(),
        notes: notesField.nullish(),
        frequency: z.enum(RECURRING_FREQUENCIES),
        intervalCount: recurringIntervalField.optional(),
        byWeekday: z.array(weekdayField).max(LIMITS.weekdaysPerRule.max).nullish(),
        dayOfMonth: dayOfMonthField.nullish(),
        monthOfYear: monthOfYearField.nullish(),
        startDate: dateSchema,
        endDate: dateSchema.nullish(),
        occurrenceLimit: occurrenceLimitField.nullish(),
        autoPost: z.boolean().optional(),
        leadTimeDays: leadTimeDaysField.optional(),
      })
      .refine(
        (value) => value.frequency !== 'custom' || value.intervalCount !== undefined,
        { message: 'validation.intervalRequired', path: ['intervalCount'] },
      ),
  }),
  asyncHandler(async (req, res) => {
    const input = body<Omit<recurringService.CreateRecurringInput, 'workspaceId' | 'createdBy'>>(req);
    const recurring = await recurringService.createRecurring({
      ...input,
      workspaceId: workspaceContext(req).id,
      createdBy: req.user!.id,
    });
    res.status(201).json({ recurring });
  }),
);

recurringRouter.get(
  '/:id',
  requireViewer,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const workspaceId = workspaceContext(req).id;
    const [recurring, upcoming] = await Promise.all([
      recurringService.getRecurring(workspaceId, id),
      recurringService.previewOccurrences(workspaceId, id, 12),
    ]);
    res.json({ recurring, upcoming });
  }),
);

recurringRouter.patch(
  '/:id',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      name: nameField.optional(),
      amount: positiveMoneySchema.optional(),
      description: descriptionField.optional(),
      merchant: merchantField.nullish(),
      categoryId: uuidSchema.nullish(),
      endDate: dateSchema.nullish(),
      isActive: z.boolean().optional(),
      autoPost: z.boolean().optional(),
      leadTimeDays: leadTimeDaysField.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const input = body<recurringService.UpdateRecurringInput>(req);
    res.json({ recurring: await recurringService.updateRecurring(workspaceContext(req).id, id, input, req.user!.id) });
  }),
);

recurringRouter.delete(
  '/:id',
  requireEditor,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await recurringService.deleteRecurring(workspaceContext(req).id, id, req.user!.id);
    res.status(204).send();
  }),
);

/** Generates the transactions this schedule owes now, without waiting for the job. */
recurringRouter.post(
  '/:id/materialize',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({ through: dateSchema.optional() }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { id } = params<{ id: string }>(req);
    const { through } = body<{ through?: string }>(req);

    // Confirm the schedule belongs to this workspace before touching it.
    await recurringService.getRecurring(workspace.id, id);

    const result = await recurringService.materializeSchedule(
      id,
      through ?? addDays(today(workspace.timezone), 30),
    );
    res.json(result);
  }),
);
