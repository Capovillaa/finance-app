import { db } from '../../db/client.js';
import { conflict, invalidCredentials, notFound, unauthorized } from '../../lib/errors.js';
import { recordActivity } from '../activity/service.js';
// `users/service` reaches back into `auth/password` and `auth/tokens`, never
// into this file, so this import is one-way rather than a cycle.
import { cancelAccountDeletion } from '../users/service.js';
import { createWorkspace } from '../workspaces/service.js';
import { fakeVerify, hashPassword, verifyPassword } from './password.js';
import {
  issueRefreshToken,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './tokens.js';

export interface AuthContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthenticatedResult {
  user: {
    id: string;
    email: string;
    fullName: string;
    locale: string;
    timezone: string;
    baseCurrency: string;
    avatarUrl: string | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** Convenience for the client's first navigation after sign-up. */
  defaultWorkspaceId?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  locale?: string;
  timezone?: string;
  baseCurrency?: string;
  workspaceName?: string;
}

/**
 * Registration also provisions the user's personal workspace (Workflow 1 in the
 * spec), so the very first API call after sign-up already has somewhere to write.
 */
export async function register(input: RegisterInput, context: AuthContext): Promise<AuthenticatedResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (existing) throw conflict('auth.emailTaken');

  const passwordHash = await hashPassword(input.password);

  const user = await db
    .insertInto('users')
    .values({
      email,
      password_hash: passwordHash,
      full_name: input.fullName.trim(),
      locale: input.locale ?? 'pt-BR',
      timezone: input.timezone ?? 'America/Sao_Paulo',
      base_currency: (input.baseCurrency ?? 'BRL').toUpperCase(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const workspace = await createWorkspace({
    name: input.workspaceName?.trim() || `${firstName(user.full_name)}'s Finances`,
    type: 'personal',
    baseCurrency: user.base_currency,
    timezone: user.timezone,
    locale: user.locale,
    ownerId: user.id,
  });

  const tokens = await issueTokens(user.id, user.email, context);

  await recordActivity({
    actorUserId: user.id,
    action: 'auth.registered',
    entityType: 'user',
    entityId: user.id,
    summary: 'Account created',
    auditOnly: true,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  return {
    user: toPublicUser(user),
    ...tokens,
    defaultWorkspaceId: workspace.id,
  };
}

export async function login(
  input: { email: string; password: string },
  context: AuthContext,
): Promise<AuthenticatedResult> {
  const email = input.email.trim().toLowerCase();

  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  // Always spend the same work whether or not the account exists.
  if (!user || !user.password_hash) {
    await fakeVerify(input.password);
    throw invalidCredentials();
  }

  const valid = await verifyPassword(input.password, user.password_hash);
  if (!valid) throw invalidCredentials();
  if (user.status !== 'active') throw unauthorized('auth.accountSuspended');

  await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();

  // Signing in is how a scheduled erasure is called off. Proving you can still
  // authenticate is proof enough that you want the account, and it is the one
  // action a person who has changed their mind is certain to attempt — so there
  // is no second endpoint and no emailed cancellation token to lose.
  if (user.deletion_requested_at) await cancelAccountDeletion(user.id);

  const tokens = await issueTokens(user.id, user.email, context);

  await recordActivity({
    actorUserId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    summary: 'Signed in',
    auditOnly: true,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  const firstWorkspace = await db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select('workspaces.id as id')
    .where('workspace_members.user_id', '=', user.id)
    .where('workspaces.archived_at', 'is', null)
    .orderBy('workspaces.created_at', 'asc')
    .limit(1)
    .executeTakeFirst();

  return {
    user: toPublicUser(user),
    ...tokens,
    ...(firstWorkspace ? { defaultWorkspaceId: firstWorkspace.id } : {}),
  };
}

export async function refresh(
  presentedToken: string,
  context: AuthContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const rotated = await rotateRefreshToken(presentedToken, context);

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'status', 'deleted_at'])
    .where('id', '=', rotated.userId)
    .executeTakeFirst();

  if (!user || user.deleted_at || user.status !== 'active') {
    throw unauthorized('auth.accountInactive');
  }

  const access = signAccessToken(user.id, user.email);
  return { accessToken: access.token, refreshToken: rotated.token, expiresIn: access.expiresIn };
}

export async function logout(presentedToken: string | undefined, userId?: string): Promise<void> {
  if (presentedToken) await revokeRefreshToken(presentedToken);
  else if (userId) await revokeAllUserTokens(userId);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await db
    .selectFrom('users')
    .select(['id', 'password_hash'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user) throw notFound('resources.user');
  if (!user.password_hash) throw invalidCredentials('auth.noPasswordSet');

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) throw invalidCredentials('auth.wrongCurrentPassword');

  const hash = await hashPassword(newPassword);

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('users').set({ password_hash: hash }).where('id', '=', userId).execute();
    // A password change signs every other device out.
    await revokeAllUserTokens(userId, trx);
  });

  await recordActivity({
    actorUserId: userId,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: userId,
    summary: 'Password changed',
    auditOnly: true,
  });
}

async function issueTokens(
  userId: string,
  email: string,
  context: AuthContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const access = signAccessToken(userId, email);
  const refreshToken = await issueRefreshToken({
    userId,
    userAgent: context.userAgent ?? null,
    ipAddress: context.ipAddress ?? null,
  });
  return { accessToken: access.token, refreshToken: refreshToken.token, expiresIn: access.expiresIn };
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  locale: string;
  timezone: string;
  base_currency: string;
  avatar_url: string | null;
}

export function toPublicUser(user: UserRow): AuthenticatedResult['user'] {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    locale: user.locale,
    timezone: user.timezone,
    baseCurrency: user.base_currency,
    avatarUrl: user.avatar_url,
  };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? 'My';
}
