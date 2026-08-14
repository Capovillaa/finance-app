import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginationSchema } from '../../lib/http.js';
import { requireEditor, requireViewer, roleAtLeast, workspaceContext } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { booleanQuerySchema, booleanQueryWithDefault, csvUuidArray, dateSchema, moneySchema, positiveMoneySchema } from '../shared/schemas.js';
import { confirmScheduledTransaction } from '../recurring/service.js';
import * as transactionService from './service.js';

const idParams = z.object({ workspaceId: uuidSchema, id: uuidSchema });

const listQuerySchema = paginationSchema.extend({
  accountIds: csvUuidArray,
  categoryIds: csvUuidArray,
  tagIds: csvUuidArray,
  includeSubcategories: booleanQueryWithDefault(true),
  types: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(',')) as ('income' | 'expense' | 'transfer')[])),
  statuses: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(',')) as ('cleared' | 'pending' | 'scheduled' | 'void')[])),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  minAmount: moneySchema.optional(),
  maxAmount: moneySchema.optional(),
  search: z.string().max(200).optional(),
  createdBy: uuidSchema.optional(),
  isReconciled: booleanQuerySchema.optional(),
  sortBy: z.enum(['occurredOn', 'amount', 'createdAt']).default('occurredOn'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
});

const createSchema = z.object({
  accountId: uuidSchema,
  categoryId: uuidSchema.nullish(),
  type: z.enum(['income', 'expense']),
  amount: positiveMoneySchema,
  description: z.string().min(1).max(200),
  merchant: z.string().max(120).nullish(),
  notes: z.string().max(2000).nullish(),
  occurredOn: dateSchema,
  status: z.enum(['cleared', 'pending', 'scheduled']).optional(),
  paidByUserId: uuidSchema.nullish(),
  tagIds: z.array(uuidSchema).max(20).optional(),
});

export const transactionRouter: Router = Router({ mergeParams: true });

transactionRouter.get(
  '/',
  requireViewer,
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = query<z.infer<typeof listQuerySchema>>(req);
    const { page, pageSize, ...filters } = q;
    res.json(
      await transactionService.listTransactions(workspaceContext(req).id, filters as transactionService.TransactionFilters, {
        page,
        pageSize,
      }),
    );
  }),
);

transactionRouter.post(
  '/',
  requireEditor,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const input = body<z.infer<typeof createSchema>>(req);
    const transaction = await transactionService.createTransaction({
      ...input,
      workspaceId: workspace.id,
      baseCurrency: workspace.baseCurrency,
      createdBy: req.user!.id,
    });
    res.status(201).json({ transaction });
  }),
);

transactionRouter.post(
  '/transfers',
  requireEditor,
  validate({
    body: z.object({
      fromAccountId: uuidSchema,
      toAccountId: uuidSchema,
      amount: positiveMoneySchema,
      destinationAmount: positiveMoneySchema.optional(),
      description: z.string().min(1).max(200),
      notes: z.string().max(2000).nullish(),
      occurredOn: dateSchema,
      status: z.enum(['cleared', 'pending']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const input = body<Omit<transactionService.CreateTransferInput, 'workspaceId' | 'baseCurrency' | 'createdBy'>>(req);
    const legs = await transactionService.createTransfer({
      ...input,
      workspaceId: workspace.id,
      baseCurrency: workspace.baseCurrency,
      createdBy: req.user!.id,
    });
    res.status(201).json({ transactions: legs });
  }),
);

transactionRouter.post(
  '/bulk-categorize',
  requireEditor,
  validate({
    body: z.object({
      transactionIds: z.array(uuidSchema).min(1).max(500),
      categoryId: uuidSchema.nullable(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const input = body<{ transactionIds: string[]; categoryId: string | null }>(req);
    const updated = await transactionService.bulkCategorize(
      workspaceContext(req).id,
      input.transactionIds,
      input.categoryId,
      req.user!.id,
    );
    res.json({ updated });
  }),
);

transactionRouter.get(
  '/:id',
  requireViewer,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const workspaceId = workspaceContext(req).id;
    const [transaction, splits, comments] = await Promise.all([
      transactionService.getTransaction(workspaceId, id),
      transactionService.listSplits(workspaceId, id),
      transactionService.listComments(workspaceId, id),
    ]);
    res.json({ transaction, splits, comments });
  }),
);

transactionRouter.patch(
  '/:id',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      accountId: uuidSchema.optional(),
      categoryId: uuidSchema.nullish(),
      amount: positiveMoneySchema.optional(),
      description: z.string().min(1).max(200).optional(),
      merchant: z.string().max(120).nullish(),
      notes: z.string().max(2000).nullish(),
      occurredOn: dateSchema.optional(),
      status: z.enum(['cleared', 'pending', 'scheduled', 'void']).optional(),
      paidByUserId: uuidSchema.nullish(),
      tagIds: z.array(uuidSchema).max(20).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const { id } = params<{ id: string }>(req);
    const input = body<transactionService.UpdateTransactionInput>(req);
    res.json({
      transaction: await transactionService.updateTransaction(
        workspace.id,
        workspace.baseCurrency,
        id,
        input,
        req.user!.id,
      ),
    });
  }),
);

transactionRouter.delete(
  '/:id',
  requireEditor,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await transactionService.deleteTransaction(workspaceContext(req).id, id, req.user!.id);
    res.status(204).send();
  }),
);

transactionRouter.post(
  '/:id/restore',
  requireEditor,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await transactionService.restoreTransaction(workspaceContext(req).id, id, req.user!.id);
    res.status(204).send();
  }),
);

transactionRouter.post(
  '/:id/confirm',
  requireEditor,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await confirmScheduledTransaction(workspaceContext(req).id, id, req.user!.id);
    res.status(204).send();
  }),
);

// --- splits ---------------------------------------------------------------

transactionRouter.put(
  '/:id/splits',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      splits: z
        .array(
          z.object({
            userId: uuidSchema,
            shareAmount: positiveMoneySchema.optional(),
            weight: positiveMoneySchema.optional(),
            note: z.string().max(200).nullish(),
          }),
        )
        .max(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const { splits } = body<{ splits: transactionService.SplitInput[] }>(req);
    res.json({ splits: await transactionService.setSplits(workspaceContext(req).id, id, splits, req.user!.id) });
  }),
);

transactionRouter.post(
  '/:id/splits/:splitId/settle',
  requireEditor,
  validate({
    params: idParams.extend({ splitId: uuidSchema }),
    body: z.object({ settled: z.boolean().default(true) }),
  }),
  asyncHandler(async (req, res) => {
    const { splitId } = params<{ splitId: string }>(req);
    const { settled } = body<{ settled: boolean }>(req);
    await transactionService.settleSplit(workspaceContext(req).id, splitId, settled);
    res.status(204).send();
  }),
);

// --- comments -------------------------------------------------------------

transactionRouter.post(
  '/:id/comments',
  requireEditor,
  validate({ params: idParams, body: z.object({ body: z.string().min(1).max(2000) }) }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const input = body<{ body: string }>(req);
    const comment = await transactionService.addComment(workspaceContext(req).id, id, req.user!.id, input.body);
    res.status(201).json({ comment });
  }),
);

transactionRouter.delete(
  '/:id/comments/:commentId',
  requireViewer,
  validate({ params: idParams.extend({ commentId: uuidSchema }) }),
  asyncHandler(async (req, res) => {
    const { commentId } = params<{ commentId: string }>(req);
    const workspace = workspaceContext(req);
    await transactionService.deleteComment(
      workspace.id,
      commentId,
      req.user!.id,
      roleAtLeast(workspace.role, 'admin'),
    );
    res.status(204).send();
  }),
);
