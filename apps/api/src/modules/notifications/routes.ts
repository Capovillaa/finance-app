import { Router } from 'express';
import { z } from 'zod/v4';
import { asyncHandler, paginationSchema } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { NO_BODY, responds } from '../../middleware/responds.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { booleanQueryWithDefault } from '../shared/schemas.js';
import { markAllReadResponse, notificationPageResponse } from './responses.js';
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
  responds({ 200: notificationPageResponse }),
  asyncHandler(async (req, res) => {
    const q = query<{ page: number; pageSize: number; unreadOnly: boolean; workspaceId?: string; type?: string }>(req);
    const { page, pageSize, ...filters } = q;
    res.json(await notificationService.listNotifications(req.user!.id, filters, { page, pageSize }));
  }),
);

notificationRouter.post(
  '/:id/read',
  validate({ params: z.object({ id: uuidSchema }) }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await notificationService.markRead(req.user!.id, id);
    res.status(204).send();
  }),
);

notificationRouter.post(
  '/read-all',
  validate({ body: z.object({ workspaceId: uuidSchema.optional() }) }),
  responds({ 200: markAllReadResponse }),
  asyncHandler(async (req, res) => {
    const { workspaceId } = body<{ workspaceId?: string }>(req);
    res.json({ updated: await notificationService.markAllRead(req.user!.id, workspaceId) });
  }),
);

notificationRouter.delete(
  '/:id',
  validate({ params: z.object({ id: uuidSchema }) }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const { id } = params<{ id: string }>(req);
    await notificationService.deleteNotification(req.user!.id, id);
    res.status(204).send();
  }),
);
