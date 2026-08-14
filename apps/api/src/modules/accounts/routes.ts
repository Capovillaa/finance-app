import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http.js';
import { requireAdmin, requireEditor, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { booleanQueryWithDefault, moneySchema, dateSchema } from '../shared/schemas.js';
import * as accountService from './service.js';

const accountTypeSchema = z.enum(['checking', 'savings', 'credit_card', 'investment', 'cash', 'loan']);

const createAccountSchema = z.object({
  name: z.string().min(1).max(120),
  type: accountTypeSchema,
  currency: z.string().length(3),
  institution: z.string().max(120).nullish(),
  initialBalance: moneySchema.optional(),
  creditLimit: moneySchema.nullish(),
  statementDay: z.number().int().min(1).max(31).nullish(),
  dueDay: z.number().int().min(1).max(31).nullish(),
  color: z.string().max(20).nullish(),
  icon: z.string().max(40).nullish(),
});

const updateAccountSchema = createAccountSchema
  .omit({ type: true, currency: true })
  .partial()
  .extend({ isArchived: z.boolean().optional() });

const idParams = z.object({ workspaceId: uuidSchema, id: uuidSchema });

/** Mounted under /workspaces/:workspaceId/accounts (auth + workspace resolved by the parent). */
export const accountRouter: Router = Router({ mergeParams: true });

accountRouter.get(
  '/',
  requireViewer,
  validate({ query: z.object({ includeArchived: booleanQueryWithDefault(false) }) }),
  asyncHandler(async (req, res) => {
    const { includeArchived } = query<{ includeArchived: boolean }>(req);
    const workspace = workspaceContext(req);
    const [accounts, balance] = await Promise.all([
      accountService.listAccounts(workspace.id, { includeArchived }),
      accountService.totalBalance(workspace.id, workspace.baseCurrency),
    ]);
    res.json({ accounts, totalBalance: balance.total, balanceByCurrency: balance.byCurrency });
  }),
);

accountRouter.post(
  '/',
  requireEditor,
  validate({ body: createAccountSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof createAccountSchema>>(req);
    const account = await accountService.createAccount({
      ...input,
      workspaceId: workspaceContext(req).id,
      createdBy: req.user!.id,
    });
    res.status(201).json({ account });
  }),
);

accountRouter.get(
  '/:id',
  requireViewer,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    res.json({ account: await accountService.getAccount(workspaceContext(req).id, id) });
  }),
);

accountRouter.patch(
  '/:id',
  requireEditor,
  validate({ params: idParams, body: updateAccountSchema }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const input = body<z.infer<typeof updateAccountSchema>>(req);
    res.json({
      account: await accountService.updateAccount(workspaceContext(req).id, id, input, req.user!.id),
    });
  }),
);

accountRouter.delete(
  '/:id',
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await accountService.deleteAccount(workspaceContext(req).id, id, req.user!.id);
    res.status(204).send();
  }),
);

accountRouter.get(
  '/:id/reconciliations',
  requireViewer,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    res.json({ reconciliations: await accountService.listReconciliations(workspaceContext(req).id, id) });
  }),
);

accountRouter.post(
  '/:id/reconciliations',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      statementDate: dateSchema,
      statementBalance: moneySchema,
      notes: z.string().max(500).nullish(),
      markTransactions: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const input = body<{
      statementDate: string;
      statementBalance: string;
      notes?: string | null;
      markTransactions?: boolean;
    }>(req);

    const result = await accountService.reconcileAccount({
      ...input,
      workspaceId: workspaceContext(req).id,
      accountId: id,
      reconciledBy: req.user!.id,
    });

    res.status(201).json({ reconciliation: result });
  }),
);
