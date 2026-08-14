import { db, type Executor } from '../../db/client.js';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import type { MemberRole, WorkspaceType } from '../../db/types.js';
import { seedDefaultCategories } from '../categories/service.js';
import { seedDefaultAlertRules } from '../alerts/defaults.js';
import { recordActivity } from '../activity/service.js';

export interface WorkspaceSummary {
  id: string;
  name: string;
  type: WorkspaceType;
  ownerId: string;
  baseCurrency: string;
  timezone: string;
  role: MemberRole;
  memberCount: number;
  settings: Record<string, unknown>;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface CreateWorkspaceInput {
  name: string;
  type?: WorkspaceType;
  baseCurrency?: string;
  timezone?: string;
  locale?: string;
  ownerId: string;
  seedCategories?: boolean;
}

/**
 * Creates a workspace with its owner membership, starter categories and default
 * alert rules in a single transaction — a half-created workspace would leave the
 * user with a dashboard that cannot categorise anything.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
  const created = await db.transaction().execute(async (trx) => {
    const workspace = await trx
      .insertInto('workspaces')
      .values({
        name: input.name.trim(),
        type: input.type ?? 'personal',
        owner_id: input.ownerId,
        base_currency: (input.baseCurrency ?? 'BRL').toUpperCase(),
        timezone: input.timezone ?? 'America/Sao_Paulo',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('workspace_members')
      .values({ workspace_id: workspace.id, user_id: input.ownerId, role: 'owner' })
      .execute();

    if (input.seedCategories !== false) {
      await seedDefaultCategories(workspace.id, input.locale ?? 'pt-BR', trx);
    }
    await seedDefaultAlertRules(workspace.id, input.ownerId, trx);

    return workspace;
  });

  await recordActivity({
    workspaceId: created.id,
    actorUserId: input.ownerId,
    action: 'workspace.created',
    entityType: 'workspace',
    entityId: created.id,
    summary: `Created workspace "${created.name}"`,
  });

  return {
    id: created.id,
    name: created.name,
    type: created.type,
    ownerId: created.owner_id,
    baseCurrency: created.base_currency,
    timezone: created.timezone,
    role: 'owner',
    memberCount: 1,
    settings: (created.settings ?? {}) as Record<string, unknown>,
    createdAt: created.created_at,
    archivedAt: created.archived_at,
  };
}

export async function listWorkspacesForUser(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<WorkspaceSummary[]> {
  let query = db
    .selectFrom('workspaces')
    .innerJoin('workspace_members', 'workspace_members.workspace_id', 'workspaces.id')
    .where('workspace_members.user_id', '=', userId);

  if (!options.includeArchived) query = query.where('workspaces.archived_at', 'is', null);

  const rows = await query
    .select((eb) => [
      'workspaces.id as id',
      'workspaces.name as name',
      'workspaces.type as type',
      'workspaces.owner_id as owner_id',
      'workspaces.base_currency as base_currency',
      'workspaces.timezone as timezone',
      'workspaces.settings as settings',
      'workspaces.created_at as created_at',
      'workspaces.archived_at as archived_at',
      'workspace_members.role as role',
      eb
        .selectFrom('workspace_members as wm')
        .select((inner) => inner.fn.countAll<number>().as('count'))
        .whereRef('wm.workspace_id', '=', 'workspaces.id')
        .as('member_count'),
    ])
    .orderBy('workspaces.created_at', 'asc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    ownerId: row.owner_id,
    baseCurrency: row.base_currency,
    timezone: row.timezone,
    role: row.role,
    memberCount: Number(row.member_count ?? 1),
    settings: (row.settings ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }));
}

export async function getWorkspaceForUser(workspaceId: string, userId: string): Promise<WorkspaceSummary> {
  const all = await listWorkspacesForUser(userId, { includeArchived: true });
  const found = all.find((w) => w.id === workspaceId);
  if (!found) throw notFound('resources.workspace');
  return found;
}

export interface UpdateWorkspaceInput {
  name?: string;
  baseCurrency?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

export async function updateWorkspace(
  workspaceId: string,
  actorId: string,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceSummary> {
  await db
    .updateTable('workspaces')
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.baseCurrency !== undefined ? { base_currency: input.baseCurrency.toUpperCase() } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.settings !== undefined ? { settings: JSON.stringify(input.settings) } : {}),
    })
    .where('id', '=', workspaceId)
    .executeTakeFirst();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'workspace.updated',
    entityType: 'workspace',
    entityId: workspaceId,
    summary: 'Updated workspace settings',
    changes: input as Record<string, unknown>,
  });

  return getWorkspaceForUser(workspaceId, actorId);
}

export async function archiveWorkspace(workspaceId: string, actorId: string): Promise<void> {
  const workspace = await db
    .selectFrom('workspaces')
    .select(['id', 'owner_id', 'type'])
    .where('id', '=', workspaceId)
    .executeTakeFirst();
  if (!workspace) throw notFound('resources.workspace');

  // Leaving someone with no workspace at all would break the dashboard, so the
  // last remaining personal workspace cannot be archived.
  if (workspace.type === 'personal') {
    const remaining = await db
      .selectFrom('workspaces')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('owner_id', '=', workspace.owner_id)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (Number(remaining?.count ?? 0) <= 1) {
      throw conflict('workspaces.lastActive');
    }
  }

  await db.updateTable('workspaces').set({ archived_at: new Date() }).where('id', '=', workspaceId).execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'workspace.archived',
    entityType: 'workspace',
    entityId: workspaceId,
    summary: 'Archived workspace',
  });
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export interface MemberRecord {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: MemberRole;
  joinedAt: Date;
}

export async function listMembers(workspaceId: string): Promise<MemberRecord[]> {
  const rows = await db
    .selectFrom('workspace_members')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .select([
      'workspace_members.id as id',
      'workspace_members.user_id as user_id',
      'workspace_members.role as role',
      'workspace_members.joined_at as joined_at',
      'users.email as email',
      'users.full_name as full_name',
      'users.avatar_url as avatar_url',
    ])
    .where('workspace_members.workspace_id', '=', workspaceId)
    .orderBy('workspace_members.joined_at', 'asc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: MemberRole,
  invitedBy: string | null,
  executor: Executor = db,
): Promise<void> {
  if (role === 'owner') throw unprocessable('workspaces.ownershipNotGranted');

  await executor
    .insertInto('workspace_members')
    .values({ workspace_id: workspaceId, user_id: userId, role, invited_by: invitedBy })
    .onConflict((oc) => oc.columns(['workspace_id', 'user_id']).doNothing())
    .execute();
}

export async function updateMemberRole(
  workspaceId: string,
  memberUserId: string,
  role: MemberRole,
  actorId: string,
): Promise<void> {
  if (role === 'owner') throw unprocessable('workspaces.useTransferEndpoint');

  const member = await db
    .selectFrom('workspace_members')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', memberUserId)
    .executeTakeFirst();
  if (!member) throw notFound('resources.member');
  if (member.role === 'owner') throw forbidden('workspaces.ownerRoleImmutable');

  await db
    .updateTable('workspace_members')
    .set({ role })
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', memberUserId)
    .execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'member.role_changed',
    entityType: 'workspace_member',
    entityId: member.id,
    summary: `Changed a member's role to ${role}`,
    changes: { role: { from: member.role, to: role } },
  });
}

export async function removeMember(
  workspaceId: string,
  memberUserId: string,
  actorId: string,
): Promise<void> {
  const member = await db
    .selectFrom('workspace_members')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', memberUserId)
    .executeTakeFirst();
  if (!member) throw notFound('resources.member');
  if (member.role === 'owner') throw forbidden('workspaces.ownerCannotBeRemoved');

  await db
    .deleteFrom('workspace_members')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', memberUserId)
    .execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'member.removed',
    entityType: 'workspace_member',
    entityId: member.id,
    summary: 'Removed a member from the workspace',
  });
}

/** Owner hands the workspace to an existing member; the old owner becomes admin. */
export async function transferOwnership(
  workspaceId: string,
  newOwnerUserId: string,
  actorId: string,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const target = await trx
      .selectFrom('workspace_members')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', newOwnerUserId)
      .executeTakeFirst();
    if (!target) throw unprocessable('workspaces.newOwnerMustBeMember');

    // The partial unique index allows only one owner row, so the current owner
    // is demoted first within the same transaction.
    await trx
      .updateTable('workspace_members')
      .set({ role: 'admin' })
      .where('workspace_id', '=', workspaceId)
      .where('role', '=', 'owner')
      .execute();

    await trx
      .updateTable('workspace_members')
      .set({ role: 'owner' })
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', newOwnerUserId)
      .execute();

    await trx.updateTable('workspaces').set({ owner_id: newOwnerUserId }).where('id', '=', workspaceId).execute();
  });

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'workspace.ownership_transferred',
    entityType: 'workspace',
    entityId: workspaceId,
    summary: 'Transferred workspace ownership',
    changes: { newOwnerId: newOwnerUserId },
  });
}
