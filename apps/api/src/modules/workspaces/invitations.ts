import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import type { MemberRole } from '../../db/types.js';
import { invitationEmail, sendEmail } from '../../lib/email.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import type { Locale } from '../../lib/i18n.js';
import { logger } from '../../lib/logger.js';
import { deriveSubkey } from '../../lib/subkey.js';
import { recordActivity } from '../activity/service.js';
import { addMember } from './service.js';

const INVITATION_TTL_DAYS = 14;

/**
 * Only the hash is stored, so a database leak cannot be used to join a
 * workspace. Keyed with a subkey derived from `JWT_REFRESH_SECRET`
 * (`lib/subkey.ts`), not the raw secret — see M-11 in AUDIT_REPORT.md, and
 * `modules/auth/tokens.ts`'s `hashRefreshToken` for the other purpose this
 * root secret used to share a key with.
 */
const INVITATION_TOKEN_SUBKEY = deriveSubkey('invitation-token');

function hashToken(token: string): string {
  return createHmac('sha256', INVITATION_TOKEN_SUBKEY).update(token).digest('hex');
}

export interface InvitationRecord {
  id: string;
  email: string;
  role: MemberRole;
  status: string;
  invitedByName: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateInvitationInput {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Exclude<MemberRole, 'owner'>;
  invitedBy: string;
  inviterName: string;
  /** The inviter's own language — the invitee has no account yet to have one. */
  inviterLocale?: Locale;
}

export async function createInvitation(
  input: CreateInvitationInput,
): Promise<{ invitation: InvitationRecord; acceptUrl: string; emailDelivered: boolean }> {
  const email = input.email.trim().toLowerCase();

  const existingMember = await db
    .selectFrom('workspace_members')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .select('workspace_members.id')
    .where('workspace_members.workspace_id', '=', input.workspaceId)
    .where('users.email', '=', email)
    .executeTakeFirst();
  if (existingMember) throw conflict('invitations.alreadyMember');

  const token = randomBytes(32).toString('base64url');

  const row = await db.transaction().execute(async (trx) => {
    // Re-inviting replaces the previous pending invitation, so the old link
    // stops working the moment a new one is issued.
    await trx
      .updateTable('workspace_invitations')
      .set({ status: 'revoked' })
      .where('workspace_id', '=', input.workspaceId)
      .where('email', '=', email)
      .where('status', '=', 'pending')
      .execute();

    return trx
      .insertInto('workspace_invitations')
      .values({
        workspace_id: input.workspaceId,
        email,
        role: input.role,
        token_hash: hashToken(token),
        invited_by: input.invitedBy,
        expires_at: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  const acceptUrl = `${env.WEB_BASE_URL}/invitations/accept?token=${token}`;

  // `sendEmail` already logs and swallows its own failure — that stays true,
  // an unreachable SMTP host must not fail the request that reserved the
  // seat. What used to be missing (P-5 in AUDIT_REPORT.md) is telling the
  // admin who sent it: the seat is real either way, but if the mail never
  // left the building they need to know to reach the invitee another way.
  const emailDelivered = await sendEmail(
    invitationEmail({
      to: email,
      inviterName: input.inviterName,
      workspaceName: input.workspaceName,
      role: input.role,
      acceptUrl,
      expiresInDays: INVITATION_TTL_DAYS,
      locale: input.inviterLocale,
    }),
  );

  if (!emailDelivered) {
    logger.warn(
      { workspaceId: input.workspaceId, invitationId: row.id, email },
      'Invitation created but its email failed to send',
    );
  }

  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.invitedBy,
    action: 'invitation.sent',
    entityType: 'workspace_invitation',
    entityId: row.id,
    summary: `Invited ${email} as ${input.role}`,
  });

  return {
    invitation: {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      invitedByName: input.inviterName,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    },
    acceptUrl,
    emailDelivered,
  };
}

export async function listInvitations(workspaceId: string): Promise<InvitationRecord[]> {
  const rows = await db
    .selectFrom('workspace_invitations')
    .leftJoin('users', 'users.id', 'workspace_invitations.invited_by')
    .select([
      'workspace_invitations.id as id',
      'workspace_invitations.email as email',
      'workspace_invitations.role as role',
      'workspace_invitations.status as status',
      'workspace_invitations.expires_at as expires_at',
      'workspace_invitations.created_at as created_at',
      'users.full_name as invited_by_name',
    ])
    .where('workspace_invitations.workspace_id', '=', workspaceId)
    .orderBy('workspace_invitations.created_at', 'desc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedByName: row.invited_by_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export async function revokeInvitation(
  workspaceId: string,
  invitationId: string,
  actorId: string,
): Promise<void> {
  const result = await db
    .updateTable('workspace_invitations')
    .set({ status: 'revoked' })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', invitationId)
    .where('status', '=', 'pending')
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0) === 0) throw notFound('resources.pendingInvitation');

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'invitation.revoked',
    entityType: 'workspace_invitation',
    entityId: invitationId,
    summary: 'Revoked an invitation',
  });
}

export interface AcceptedInvitation {
  workspaceId: string;
  workspaceName: string;
  role: MemberRole;
}

/**
 * Accepts an invitation on behalf of the signed-in user.
 *
 * The invited address must match the accepting account: otherwise anyone with
 * the link could join a workspace it was never meant for.
 */
export async function acceptInvitation(token: string, userId: string): Promise<AcceptedInvitation> {
  const tokenHash = hashToken(token);

  return db.transaction().execute(async (trx) => {
    const invitation = await trx
      .selectFrom('workspace_invitations')
      .innerJoin('workspaces', 'workspaces.id', 'workspace_invitations.workspace_id')
      .select([
        'workspace_invitations.id as id',
        'workspace_invitations.workspace_id as workspace_id',
        'workspace_invitations.email as email',
        'workspace_invitations.role as role',
        'workspace_invitations.status as status',
        'workspace_invitations.expires_at as expires_at',
        'workspace_invitations.invited_by as invited_by',
        'workspaces.name as workspace_name',
      ])
      .where('workspace_invitations.token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!invitation) throw notFound('resources.invitation');
    if (invitation.status !== 'pending') throw unprocessable('invitations.notValid');

    if (invitation.expires_at.getTime() <= Date.now()) {
      await trx
        .updateTable('workspace_invitations')
        .set({ status: 'expired' })
        .where('id', '=', invitation.id)
        .execute();
      throw unprocessable('invitations.expired');
    }

    const user = await trx
      .selectFrom('users')
      .select(['id', 'email', 'email_verified_at'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw unprocessable('invitations.wrongEmail');
    }

    // Membership is authorised by comparing an email *string* above, which is
    // only meaningful once the account has proven it controls that address —
    // otherwise anyone who learns a victim is about to be invited could
    // register the address first and accept the invitation themselves.
    if (!user.email_verified_at) {
      throw unprocessable('invitations.emailNotVerified');
    }

    await addMember(invitation.workspace_id, userId, invitation.role, invitation.invited_by, trx);

    await trx
      .updateTable('workspace_invitations')
      .set({ status: 'accepted', accepted_at: new Date(), accepted_by: userId })
      .where('id', '=', invitation.id)
      .execute();

    await recordActivity({
      workspaceId: invitation.workspace_id,
      actorUserId: userId,
      action: 'invitation.accepted',
      entityType: 'workspace_invitation',
      entityId: invitation.id,
      summary: `${user.email} joined the workspace as ${invitation.role}`,
      executor: trx,
    });

    return {
      workspaceId: invitation.workspace_id,
      workspaceName: invitation.workspace_name,
      role: invitation.role,
    };
  });
}

/** Marks lapsed invitations, called by the maintenance job. */
export async function expireStaleInvitations(): Promise<number> {
  const result = await db
    .updateTable('workspace_invitations')
    .set({ status: 'expired' })
    .where('status', '=', 'pending')
    .where('expires_at', '<', new Date())
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
}
