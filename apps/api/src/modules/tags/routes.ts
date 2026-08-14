import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { notFound } from '../../lib/errors.js';
import { asyncHandler } from '../../lib/http.js';
import { requireEditor, requireViewer, workspaceContext } from '../../middleware/auth.js';
import { body, params, uuidSchema, validate } from '../../middleware/validate.js';

export const tagRouter: Router = Router({ mergeParams: true });

tagRouter.get(
  '/',
  requireViewer,
  asyncHandler(async (req, res) => {
    const rows = await db
      .selectFrom('tags')
      .leftJoin('transaction_tags', 'transaction_tags.tag_id', 'tags.id')
      .select((eb) => [
        'tags.id as id',
        'tags.name as name',
        'tags.color as color',
        eb.fn.count<number>('transaction_tags.transaction_id').as('usage_count'),
      ])
      .where('tags.workspace_id', '=', workspaceContext(req).id)
      .groupBy(['tags.id', 'tags.name', 'tags.color'])
      .orderBy('tags.name', 'asc')
      .execute();

    res.json({
      tags: rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        usageCount: Number(row.usage_count ?? 0),
      })),
    });
  }),
);

tagRouter.post(
  '/',
  requireEditor,
  validate({ body: z.object({ name: z.string().min(1).max(40), color: z.string().max(20).nullish() }) }),
  asyncHandler(async (req, res) => {
    const input = body<{ name: string; color?: string | null }>(req);
    const tag = await db
      .insertInto('tags')
      .values({
        workspace_id: workspaceContext(req).id,
        name: input.name.trim(),
        color: input.color ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json({ tag: { id: tag.id, name: tag.name, color: tag.color } });
  }),
);

tagRouter.delete(
  '/:id',
  requireEditor,
  validate({ params: z.object({ workspaceId: uuidSchema, id: uuidSchema }) }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const result = await db
      .deleteFrom('tags')
      .where('workspace_id', '=', workspaceContext(req).id)
      .where('id', '=', id)
      .executeTakeFirst();

    if (Number(result.numDeletedRows ?? 0) === 0) throw notFound('resources.tag');
    res.status(204).send();
  }),
);
