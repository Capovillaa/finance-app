import type { RequestHandler } from 'express';
import { db } from '../db/client.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { resolveLocale } from '../lib/i18n.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import type { MemberRole } from '../db/types.js';
import type { WorkspaceContext } from '../types/context.js';

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;
  return value.trim();
}

/**
 * Verifies the access token and loads the current user. The database read is
 * what makes a suspended or deleted account stop working immediately, rather
 * than at the end of the token's lifetime.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    const token = bearerToken(req.header('authorization'));
    if (!token) throw unauthorized('auth.missingToken');

    const payload = verifyAccessToken(token);

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'full_name', 'timezone', 'base_currency', 'locale', 'status', 'deleted_at'])
      .where('id', '=', payload.sub)
      .executeTakeFirst();

    if (!user || user.deleted_at || user.status !== 'active') {
      throw unauthorized('auth.accountInactive');
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      timezone: user.timezone,
      baseCurrency: user.base_currency,
    };
    // The signed-in profile's own preference outranks whatever `Accept-Language`
    // the client happened to send, so it survives a client that forgets the
    // header and stays correct if the browser's language and the profile disagree.
    req.locale = resolveLocale(user.locale);
  })()
    .then(() => next())
    .catch(next);
};

export function currentUser(req: { user?: { id: string } }): { id: string } {
  if (!req.user) throw unauthorized('common.unauthorized');
  return req.user;
}

const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Resolves `:workspaceId` and proves the caller is a member. Every
 * workspace-scoped route mounts this, which is what enforces data isolation:
 * downstream queries always filter on `req.workspace.id`.
 */
export const withWorkspace: RequestHandler = (req, _res, next) => {
  void (async () => {
    const user = currentUser(req);
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) throw unauthorized('workspaces.notSpecified');

    const row = await db
      .selectFrom('workspaces')
      .innerJoin('workspace_members', 'workspace_members.workspace_id', 'workspaces.id')
      .select([
        'workspaces.id as id',
        'workspaces.name as name',
        'workspaces.base_currency as base_currency',
        'workspaces.timezone as timezone',
        'workspaces.type as type',
        'workspaces.archived_at as archived_at',
        'workspace_members.role as role',
      ])
      .where('workspaces.id', '=', workspaceId)
      .where('workspace_members.user_id', '=', user.id)
      .executeTakeFirst();

    // A non-member gets the same 404 as a non-existent workspace: confirming
    // that an id exists would leak the shape of other people's data.
    if (!row) throw forbidden('workspaces.notMember');
    if (row.archived_at) throw forbidden('workspaces.archived');

    req.workspace = {
      id: row.id,
      name: row.name,
      role: row.role,
      baseCurrency: row.base_currency,
      timezone: row.timezone,
      type: row.type,
    };
  })()
    .then(() => next())
    .catch(next);
};

/** Requires at least the given role in the workspace resolved by `withWorkspace`. */
export function requireRole(minimum: MemberRole): RequestHandler {
  return (req, _res, next) => {
    const workspace = req.workspace;
    if (!workspace) {
      next(forbidden('workspaces.contextMissing'));
      return;
    }
    if (!roleAtLeast(workspace.role, minimum)) {
      next(forbidden('workspaces.roleRequired', { roleKey: `common.role.${minimum}` }));
      return;
    }
    next();
  };
}

/** Convenience aliases matching the permission model in the spec. */
export const requireViewer = requireRole('viewer');
export const requireEditor = requireRole('editor');
export const requireAdmin = requireRole('admin');
export const requireOwner = requireRole('owner');

export function workspaceContext(req: { workspace?: WorkspaceContext }): WorkspaceContext {
  if (!req.workspace) throw forbidden('workspaces.contextMissing');
  return req.workspace;
}
