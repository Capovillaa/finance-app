import { z } from 'zod/v4';
import { component, integer, jsonObject, page, timestamp, uuid } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * The inbox is **user-scoped, not workspace-scoped**: one list spans every
 * workspace the caller belongs to, which is why `workspaceId` is nullable — an
 * account-level notice belongs to no workspace at all.
 */

export const notificationSchema = component(
  'Notification',
  z.object({
    id: uuid,
    workspaceId: uuid.nullable().describe('Null for a notice about the account rather than about a workspace.'),
    type: z.string().describe('The alert rule type that raised it, or a system event name.'),
    severity: z.enum(['info', 'warning', 'critical']),
    title: z.string().describe("Already rendered in the recipient's language."),
    message: z.string().describe("Already rendered in the recipient's language."),
    data: jsonObject.describe('Whatever the rule attached — amounts, ids — for a client to link from.'),
    readAt: timestamp.nullable(),
    createdAt: timestamp,
  }),
);

export const notificationPageResponse = page(notificationSchema)
  .extend({ unreadCount: integer.describe('Across the whole inbox, not just this page.') })
  .describe('One page of the inbox, newest first.');

export const markAllReadResponse = z.object({ updated: integer });
