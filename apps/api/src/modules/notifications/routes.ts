import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginationSchema } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { booleanQueryWithDefault } from '../shared/schemas.js';
import * as notificationService from './service.js';

/** User-scoped, not workspace-scoped: one inbox spans every workspace. */
export const notificationRouter: Router = Router();

notificationRouter.use(requireAuth);

notificationRouter.get(
  '/',
  validate({
    query: paginationSchema.extend({
      unreadOnly: booleanQueryWithDefault(false),
      workspaceId: uuidSchema.optional(),
      type: z.string().max(60).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = query<{ page: number; pageSize: number; unreadOnly: boolean; workspaceId?: string; type?: string }>(req);
    const { page, pageSize, ...filters } = q;
    res.json(await notificationService.listNotifications(req.user!.id, filters, { page, pageSize }));
  }),
);

notificationRouter.post(
  '/:id/read',
  validate({ params: z.object({ id: uuidSchema }) }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await notificationService.markRead(req.user!.id, id);
    res.status(204).send();
  }),
);

notificationRouter.post(
  '/read-all',
  validate({ body: z.object({ workspaceId: uuidSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const { workspaceId } = body<{ workspaceId?: string }>(req);
    res.json({ updated: await notificationService.markAllRead(req.user!.id, workspaceId) });
  }),
);

notificationRouter.delete(
  '/:id',
  validate({ params: z.object({ id: uuidSchema }) }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await notificationService.deleteNotification(req.user!.id, id);
    res.status(204).send();
  }),
);
