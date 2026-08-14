import { Router } from 'express';
import { z } from 'zod/v4';
import { CSV_DELIMITERS } from '../../lib/csv.js';
import { asyncHandler } from '../../lib/http.js';
import { t } from '../../lib/i18n.js';
import { requireEditor, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { IMPORT_COLUMNS } from './mapping.js';
import * as importService from './service.js';

const batchParams = z.object({ workspaceId: uuidSchema, batchId: uuidSchema });

const mappingSchema = z
  .object(Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, z.number().int().min(0).max(199).optional()])))
  .partial();

const optionsSchema = z.object({
  delimiter: z.enum(CSV_DELIMITERS as unknown as [string, ...string[]]).optional(),
  hasHeader: z.boolean().optional(),
  mapping: mappingSchema.optional(),
  dateFormat: z.enum(['iso', 'dmy', 'mdy']).optional(),
  decimalSeparator: z.enum(['.', ',']).optional(),
  signConvention: z.enum(['signed', 'debit_credit', 'direction_flag']).optional(),
  invertAmounts: z.boolean().optional(),
});

const previewSchema = optionsSchema.extend({
  accountId: uuidSchema,
  filename: z.string().max(255).nullish(),
  // The client reads the file and posts its text. Multipart would buy nothing
  // here: the payload is already capped well below the JSON body limit, and a
  // single content type keeps the authenticated fetch path identical to every
  // other call the client makes.
  content: z.string().min(1),
});

const commitSchema = z.object({
  rows: z
    .array(
      z.object({
        lineNumber: z.number().int().min(1),
        categoryId: uuidSchema.nullish(),
      }),
    )
    .min(1)
    .max(importService.MAX_IMPORT_ROWS),
});

export const importRouter: Router = Router({ mergeParams: true });

/**
 * Rendering row errors here rather than in the service keeps the stored preview
 * language-neutral: the same batch read by a Portuguese and an English client
 * comes back in each one's own words.
 */
function localizePreview(preview: importService.ImportPreview, locale: Parameters<typeof t>[0]) {
  return {
    ...preview,
    rows: preview.rows.map((row) => ({
      ...row,
      errors: row.errors.map((error) => ({
        field: error.field,
        message: t(locale, error.key, error.params),
      })),
    })),
  };
}

importRouter.get(
  '/',
  requireViewer,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
  asyncHandler(async (req, res) => {
    const { limit } = query<{ limit: number }>(req);
    res.json({ batches: await importService.listImportBatches(workspaceContext(req).id, limit) });
  }),
);

importRouter.post(
  '/preview',
  requireEditor,
  validate({ body: previewSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof previewSchema>>(req);
    const preview = await importService.previewImport({
      ...(input as Omit<importService.PreviewImportInput, 'workspaceId' | 'createdBy'>),
      workspaceId: workspaceContext(req).id,
      createdBy: req.user!.id,
    });
    res.status(201).json({ preview: localizePreview(preview, req.locale) });
  }),
);

importRouter.post(
  '/:batchId/commit',
  requireEditor,
  validate({ params: batchParams, body: commitSchema }),
  asyncHandler(async (req, res) => {
    const { batchId } = params<{ batchId: string }>(req);
    const { rows } = body<z.infer<typeof commitSchema>>(req);
    const result = await importService.commitImport(
      workspaceContext(req).id,
      batchId,
      rows as importService.CommitRowSelection[],
      req.user!.id,
    );
    res.status(201).json(result);
  }),
);

importRouter.delete(
  '/:batchId',
  requireEditor,
  validate({ params: batchParams }),
  asyncHandler(async (req, res) => {
    const { batchId } = params<{ batchId: string }>(req);
    const reverted = await importService.revertImport(workspaceContext(req).id, batchId, req.user!.id);
    res.json({ reverted });
  }),
);
