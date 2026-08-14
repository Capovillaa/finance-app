import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginationSchema } from '../../lib/http.js';
import {
  currentUser,
  requireAdmin,
  requireAuth,
  requireOwner,
  requireViewer,
  withWorkspace,
  workspaceContext,
} from '../../middleware/auth.js';
import { body, params, query, uuidSchema, validate } from '../../middleware/validate.js';
import { booleanQueryWithDefault } from '../shared/schemas.js';
import { listActivity } from '../activity/service.js';
import { acceptInvitation, createInvitation, listInvitations, revokeInvitation } from './invitations.js';
import * as workspaceService from './service.js';

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['personal', 'shared']).default('personal'),
  baseCurrency: z.string().length(3).optional(),
  timezone: z.string().max(60).optional(),
  seedCategories: z.boolean().optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  baseCurrency: z.string().length(3).optional(),
  timezone: z.string().max(60).optional(),
  settings: z.record(z.unknown()).optional(),
});

const workspaceParamSchema = z.object({ workspaceId: uuidSchema });

export const workspaceRouter: Router = Router();

workspaceRouter.use(requireAuth);

workspaceRouter.get(
  '/',
  validate({ query: z.object({ includeArchived: booleanQueryWithDefault(false) }) }),
  asyncHandler(async (req, res) => {
    const { includeArchived } = query<{ includeArchived: boolean }>(req);
    res.json({ workspaces: await workspaceService.listWorkspacesForUser(req.user!.id, { includeArchived }) });
  }),
);

workspaceRouter.post(
  '/',
  validate({ body: createWorkspaceSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof createWorkspaceSchema>>(req);
    const workspace = await workspaceService.createWorkspace({
      ...input,
      ownerId: req.user!.id,
      locale: 'pt-BR',
    });
    res.status(201).json({ workspace });
  }),
);

workspaceRouter.get(
  '/:workspaceId',
  validate({ params: workspaceParamSchema }),
  withWorkspace,
  requireViewer,
  asyncHandler(async (req, res) => {
    const { workspaceId } = params<{ workspaceId: string }>(req);
    res.json({ workspace: await workspaceService.getWorkspaceForUser(workspaceId, req.user!.id) });
  }),
);

workspaceRouter.patch(
  '/:workspaceId',
  validate({ params: workspaceParamSchema, body: updateWorkspaceSchema }),
  withWorkspace,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { workspaceId } = params<{ workspaceId: string }>(req);
    const input = body<z.infer<typeof updateWorkspaceSchema>>(req);
    res.json({ workspace: await workspaceService.updateWorkspace(workspaceId, req.user!.id, input) });
  }),
);

workspaceRouter.delete(
  '/:workspaceId',
  validate({ params: workspaceParamSchema }),
  withWorkspace,
  requireOwner,
  asyncHandler(async (req, res) => {
    const { workspaceId } = params<{ workspaceId: string }>(req);
    await workspaceService.archiveWorkspace(workspaceId, req.user!.id);
    res.status(204).send();
  }),
);

// --- members ---------------------------------------------------------------

workspaceRouter.get(
  '/:workspaceId/members',
  validate({ params: workspaceParamSchema }),
  withWorkspace,
  requireViewer,
  asyncHandler(async (req, res) => {
    res.json({ members: await workspaceService.listMembers(workspaceContext(req).id) });
  }),
);

workspaceRouter.patch(
  '/:workspaceId/members/:userId',
  validate({
    params: workspaceParamSchema.extend({ userId: uuidSchema }),
    body: z.object({ role: z.enum(['admin', 'editor', 'viewer']) }),
  }),
  withWorkspace,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = params<{ userId: string }>(req);
    const { role } = body<{ role: 'admin' | 'editor' | 'viewer' }>(req);
    await workspaceService.updateMemberRole(workspaceContext(req).id, userId, role, req.user!.id);
    res.status(204).send();
  }),
);

workspaceRouter.delete(
  '/:workspaceId/members/:userId',
  validate({ params: workspaceParamSchema.extend({ userId: uuidSchema }) }),
  withWorkspace,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = params<{ userId: string }>(req);
    await workspaceService.removeMember(workspaceContext(req).id, userId, req.user!.id);
    res.status(204).send();
  }),
);

workspaceRouter.post(
  '/:workspaceId/transfer-ownership',
  validate({ params: workspaceParamSchema, body: z.object({ newOwnerId: uuidSchema }) }),
  withWorkspace,
  requireOwner,
  asyncHandler(async (req, res) => {
    const { newOwnerId } = body<{ newOwnerId: string }>(req);
    await workspaceService.transferOwnership(workspaceContext(req).id, newOwnerId, req.user!.id);
    res.status(204).send();
  }),
);

// --- invitations -----------------------------------------------------------

workspaceRouter.get(
  '/:workspaceId/invitations',
  validate({ params: workspaceParamSchema }),
  withWorkspace,
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ invitations: await listInvitations(workspaceContext(req).id) });
  }),
);

workspaceRouter.post(
  '/:workspaceId/invitations',
  validate({
    params: workspaceParamSchema,
    body: z.object({
      email: z.string().email().max(254),
      role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
    }),
  }),
  withWorkspace,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const workspace = workspaceContext(req);
    const input = body<{ email: string; role: 'admin' | 'editor' | 'viewer' }>(req);

    const { invitation } = await createInvitation({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      email: input.email,
      role: input.role,
      invitedBy: req.user!.id,
      inviterName: req.user!.fullName,
      inviterLocale: req.locale,
    });

    res.status(201).json({ invitation });
  }),
);

workspaceRouter.delete(
  '/:workspaceId/invitations/:invitationId',
  validate({ params: workspaceParamSchema.extend({ invitationId: uuidSchema }) }),
  withWorkspace,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { invitationId } = params<{ invitationId: string }>(req);
    await revokeInvitation(workspaceContext(req).id, invitationId, req.user!.id);
    res.status(204).send();
  }),
);

// --- activity feed ---------------------------------------------------------

workspaceRouter.get(
  '/:workspaceId/activity',
  validate({
    params: workspaceParamSchema,
    query: paginationSchema.extend({
      entityType: z.string().max(40).optional(),
      entityId: uuidSchema.optional(),
      actorUserId: uuidSchema.optional(),
      includeAudit: booleanQueryWithDefault(false),
    }),
  }),
  withWorkspace,
  requireViewer,
  asyncHandler(async (req, res) => {
    const filters = query<{
      page: number;
      pageSize: number;
      entityType?: string;
      entityId?: string;
      actorUserId?: string;
      includeAudit: boolean;
    }>(req);

    const workspace = workspaceContext(req);
    // Only admins may inspect the audit trail; the collaboration feed is open
    // to every member.
    const includeAudit = filters.includeAudit && (workspace.role === 'owner' || workspace.role === 'admin');

    res.json(
      await listActivity(
        workspace.id,
        {
          ...(filters.entityType ? { entityType: filters.entityType } : {}),
          ...(filters.entityId ? { entityId: filters.entityId } : {}),
          ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
          includeAudit,
        },
        { page: filters.page, pageSize: filters.pageSize },
      ),
    );
  }),
);

// --- invitation acceptance (not workspace-scoped) --------------------------

export const invitationRouter: Router = Router();

invitationRouter.post(
  '/accept',
  requireAuth,
  validate({ body: z.object({ token: z.string().min(10).max(200) }) }),
  asyncHandler(async (req, res) => {
    const { token } = body<{ token: string }>(req);
    const result = await acceptInvitation(token, currentUser(req).id);
    res.json(result);
  }),
);
