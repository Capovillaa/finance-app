import { Router } from 'express';
import { z } from 'zod/v4';
import { asyncHandler } from '../../lib/http.js';
import { requireEditor, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { booleanQueryWithDefault } from '../shared/schemas.js';
import * as categoryService from './service.js';
import { DEFAULT_CATEGORY_TEMPLATE } from './defaults.js';

const idParams = z.object({ workspaceId: uuidSchema, id: uuidSchema });

export const categoryRouter: Router = Router({ mergeParams: true });

categoryRouter.get(
  '/',
  requireViewer,
  validate({
    query: z.object({
      includeArchived: booleanQueryWithDefault(false),
      kind: z.enum(['income', 'expense', 'transfer']).optional(),
      /** `tree` nests children; `flat` returns rows with a depth field. */
      shape: z.enum(['tree', 'flat']).default('tree'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const options = query<{ includeArchived: boolean; kind?: 'income' | 'expense' | 'transfer'; shape: string }>(req);
    const records = await categoryService.listCategories(workspaceContext(req).id, {
      includeArchived: options.includeArchived,
      ...(options.kind ? { kind: options.kind } : {}),
    });

    res.json(options.shape === 'flat' ? { categories: records } : { categories: categoryService.buildTree(records) });
  }),
);

categoryRouter.get('/template', requireViewer, (_req, res) => {
  res.json({ template: DEFAULT_CATEGORY_TEMPLATE });
});

categoryRouter.post(
  '/',
  requireEditor,
  validate({
    body: z.object({
      name: z.string().min(1).max(80),
      parentId: uuidSchema.nullish(),
      kind: z.enum(['income', 'expense', 'transfer']).optional(),
      color: z.string().max(20).nullish(),
      icon: z.string().max(40).nullish(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const input = body<Parameters<typeof categoryService.createCategory>[0]>(req);
    const category = await categoryService.createCategory({ ...input, workspaceId: workspaceContext(req).id });
    res.status(201).json({ category });
  }),
);

categoryRouter.patch(
  '/:id',
  requireEditor,
  validate({
    params: idParams,
    body: z.object({
      name: z.string().min(1).max(80).optional(),
      parentId: uuidSchema.nullish(),
      color: z.string().max(20).nullish(),
      icon: z.string().max(40).nullish(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
      isArchived: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const input = body<categoryService.UpdateCategoryInput>(req);
    res.json({ category: await categoryService.updateCategory(workspaceContext(req).id, id, input) });
  }),
);

categoryRouter.delete(
  '/:id',
  requireEditor,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await categoryService.deleteCategory(workspaceContext(req).id, id);
    res.status(204).send();
  }),
);
