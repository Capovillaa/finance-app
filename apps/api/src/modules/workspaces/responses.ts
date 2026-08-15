import { GRANTABLE_ROLES, WORKSPACE_ROLES, WORKSPACE_TYPES } from '@finance/schemas';
import { z } from 'zod/v4';
import {
  component,
  currencyCode,
  integer,
  jsonObject,
  page,
  timestamp,
  uuid,
} from '../shared/responses.js';

/**
 * What this module returns — the workspace itself, its members, its invitations
 * and its activity feed.
 *
 * **An invitation never carries its token.** The token only ever leaves the
 * server inside the invitation email, which is why a revoked invitation cannot
 * be re-sent: there is nothing left to re-send. Listing one is enough to show it
 * and revoke it, and that is deliberate.
 */

export const workspaceSchema = component(
  'Workspace',
  z.object({
    id: uuid,
    name: z.string(),
    type: z.enum(WORKSPACE_TYPES),
    ownerId: uuid,
    baseCurrency: currencyCode.describe('Every analytic figure in this workspace is expressed in it.'),
    timezone: z.string(),
    role: z.enum(WORKSPACE_ROLES).describe("The calling user's role here, not a property of the workspace."),
    memberCount: integer,
    settings: jsonObject,
    createdAt: timestamp,
    archivedAt: timestamp.nullable(),
  }),
);

export const workspaceListResponse = z.object({ workspaces: z.array(workspaceSchema) });

export const workspaceResponse = z.object({ workspace: workspaceSchema });

export const workspaceMemberSchema = component(
  'WorkspaceMember',
  z.object({
    id: uuid.describe('The membership row, not the user.'),
    userId: uuid,
    email: z.string(),
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
    role: z.enum(WORKSPACE_ROLES),
    joinedAt: timestamp,
  }),
);

export const memberListResponse = z.object({ members: z.array(workspaceMemberSchema) });

export const workspaceInvitationSchema = component(
  'WorkspaceInvitation',
  z.object({
    id: uuid,
    email: z.string(),
    role: z.enum(GRANTABLE_ROLES).describe('Ownership moves through its own endpoint, so it cannot be invited to.'),
    status: z.string().describe('`pending`, `accepted`, `revoked` or `expired`.'),
    invitedByName: z.string().nullable(),
    expiresAt: timestamp,
    createdAt: timestamp,
  }),
);

export const invitationListResponse = z.object({ invitations: z.array(workspaceInvitationSchema) });

export const invitationResponse = z
  .object({ invitation: workspaceInvitationSchema })
  .describe('The seat is reserved and the email is on its way. The token is not returned.');

export const acceptedInvitationResponse = z
  .object({
    workspaceId: uuid,
    workspaceName: z.string(),
    role: z.enum(WORKSPACE_ROLES),
  })
  .describe('Where the caller has just been admitted, so a client can navigate straight there.');

export const activityItemSchema = component(
  'ActivityItem',
  z.object({
    id: uuid,
    action: z.string().describe('A dotted verb, e.g. `account.created`.'),
    entityType: z.string(),
    entityId: uuid.nullable(),
    summary: z.string(),
    changes: jsonObject,
    createdAt: timestamp,
    actor: z
      .object({ id: uuid, fullName: z.string(), avatarUrl: z.string().nullable() })
      .nullable()
      .describe('Null when the event was raised by a background job rather than a person.'),
  }),
);

export const activityPageResponse = page(activityItemSchema).describe(
  'The collaboration feed. Audit-only events are included for an admin who asks for them, and for nobody else.',
);
