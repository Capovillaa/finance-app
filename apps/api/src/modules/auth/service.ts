import { randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { accountExistsEmail, passwordResetEmail, sendEmail, verificationEmail } from '../../lib/email.js';
import { invalidCredentials, isAppError, notFound, unauthorized, unprocessable, validationFailed } from '../../lib/errors.js';
import { resolveLocale } from '../../lib/i18n.js';
import { logger } from '../../lib/logger.js';
import { recordActivity } from '../activity/service.js';
// `users/service` reaches back into `auth/password` and `auth/tokens`, never
// into this file, so this import is one-way rather than a cycle.
import { cancelAccountDeletion } from '../users/service.js';
import { createWorkspace } from '../workspaces/service.js';
import { checkPasswordBreach } from './breachCheck.js';
import { decideGoogleAccount, verifyGoogleIdToken, type GoogleIdentity } from './google.js';
import { fakeVerify, hashPassword, verifyPassword } from './password.js';
import {
  hashEmailToken,
  issueRefreshToken,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './tokens.js';

/** How long an emailed link stays usable. Both are deliberately short-lived. */
const EMAIL_VERIFICATION_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;

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
    emailVerifiedAt: Date | null;
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
 * Rejects a password already known to be breached (L-7 in AUDIT_REPORT.md),
 * on every path that sets one: register, change-password and reset-password.
 *
 * Fails open on anything other than a confirmed breach — a network failure,
 * a timeout, an HTTP error from the third party — because this check must
 * never be the reason a legitimate account cannot be created or a legitimate
 * password cannot be changed. The failure is logged rather than swallowed
 * silently, since a persistent failure here is worth someone noticing.
 *
 * A no-op under `NODE_ENV=test`, the same way `sendEmail` never opens a real
 * SMTP connection there. This call sits on the path `registerUser()` takes
 * for nearly every integration test in the suite; a real round trip to a
 * third party on each one would turn a sub-minute suite into a network-bound
 * one and make it flaky wherever that network is unavailable, for a check
 * `tests/unit/breach-check.test.ts` already exercises against a fake fetch.
 */
async function rejectBreachedPassword(password: string, fieldPath: string): Promise<void> {
  if (env.isTest) return;
  try {
    const result = await checkPasswordBreach(password);
    if (result.breached) {
      throw validationFailed('common.validationFailed', undefined, [
        { path: fieldPath, message: 'validation.passwordBreached' },
      ]);
    }
  } catch (err) {
    if (isAppError(err)) throw err;
    logger.warn({ err }, 'Password breach check failed; allowing the password through');
  }
}

/**
 * Registration also provisions the user's personal workspace (Workflow 1 in the
 * spec), so the very first API call after sign-up already has somewhere to write.
 *
 * Resolves the same way whether or not the address already has an account —
 * see M-9 in AUDIT_REPORT.md. This used to throw a 409 on a known email,
 * which is a complete enumeration oracle (`authRateLimit`'s per-account
 * bucket does not help, since every probe names a different candidate
 * address); the route now answers 201 either way, and this function decides
 * privately which branch to take, the same shape `requestPasswordReset`
 * already uses for the identical reason. Registration no longer returns
 * tokens as a consequence — a response indistinguishable from "an account
 * already existed" cannot also carry a signed-in session for the caller — so
 * the client signs in with a follow-up `/auth/login` call instead, which
 * succeeds silently for a genuine new account and fails exactly like any
 * other wrong-password attempt when the address belonged to someone else.
 */
export async function register(input: RegisterInput, context: AuthContext): Promise<void> {
  const email = input.email.trim().toLowerCase();

  const existing = await db
    .selectFrom('users')
    .select(['id', 'email', 'full_name', 'locale'])
    .where('email', '=', email)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (existing) {
    await sendEmail(
      accountExistsEmail({
        to: existing.email,
        fullName: existing.full_name,
        loginUrl: `${env.WEB_BASE_URL}/login`,
        locale: resolveLocale(existing.locale),
      }),
    );
    return;
  }

  await rejectBreachedPassword(input.password, 'password');
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

  await createWorkspace({
    name: input.workspaceName?.trim() || `${firstName(user.full_name)}'s Finances`,
    type: 'personal',
    baseCurrency: user.base_currency,
    timezone: user.timezone,
    locale: user.locale,
    ownerId: user.id,
  });

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

  // Best-effort, like the invitation email: `sendEmail` logs and swallows its
  // own failures rather than throwing, so an unreachable SMTP host must not
  // fail the registration that triggered it.
  await issueEmailVerification(user);
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

  return completeSignIn(user, context, { action: 'auth.login', summary: 'Signed in' });
}

/**
 * Everything a sign-in does once the credential — a password, or a verified
 * Google ID token — has been accepted.
 *
 * Shared rather than duplicated because the list is longer than it looks and
 * every item is load-bearing: a suspended account must not get a session, a
 * pending erasure must be called off (see below), and the tokens must come out
 * of the one `issueTokens` path so a refresh-token family is opened the same
 * way whichever door the user came through. `loginWithGoogle` calling its own
 * `signAccessToken` would work on the day it was written and drift afterwards.
 *
 * The status check lives here rather than beside each credential check, but
 * still *after* it: "this account is suspended" is only ever said to someone
 * who has already proved they own it.
 */
async function completeSignIn(
  user: SignInUserRow,
  context: AuthContext,
  event: { action: string; summary: string },
): Promise<AuthenticatedResult> {
  if (user.status !== 'active') throw unauthorized('auth.accountSuspended');

  await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();

  // Signing in is how a scheduled erasure is called off. Proving you can still
  // authenticate is proof enough that you want the account, and it is the one
  // action a person who has changed their mind is certain to attempt — so there
  // is no second endpoint and no emailed cancellation token to lose. Every
  // sign-in path owes this call, Google's included.
  if (user.deletion_requested_at) await cancelAccountDeletion(user.id);

  const tokens = await issueTokens(user.id, user.email, context);

  await recordActivity({
    actorUserId: user.id,
    action: event.action,
    entityType: 'user',
    entityId: user.id,
    summary: event.summary,
    auditOnly: true,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  const defaultWorkspaceId = await firstWorkspaceId(user.id);

  return {
    user: toPublicUser(user),
    ...tokens,
    ...(defaultWorkspaceId ? { defaultWorkspaceId } : {}),
  };
}

/**
 * Signs in — or signs up — with a Google ID token from the browser's "Sign in
 * with Google" button.
 *
 * The token is the credential and it is checked first, in `google.ts`: nothing
 * below runs against an unverified claim. What is left is the account
 * question, and `decideGoogleAccount` answers it as a pure function so the
 * rules can be read (and tested) without a database in the way.
 *
 * Three things about the created account are worth stating outright:
 *
 * - **No password hash.** The column has been nullable since migration `001`,
 *   `login` refuses a user without one, and `changePassword` says
 *   `auth.noPasswordSet` — so a Google-only account is already a shape the rest
 *   of the code understands. Such a user reaches a password by way of
 *   `/auth/forgot-password`, which sets one on any account with an address.
 * - **The address is verified on arrival**, because Google has verified it and
 *   the `create` branch is only reached when it says so. That matters beyond
 *   tidiness: accepting a workspace invitation is gated on
 *   `email_verified_at`, and a verification email nobody needs to open is a
 *   dead end rather than a formality.
 * - **It goes through `createWorkspace`, the same call `register` makes**, so a
 *   Google sign-up lands on a workspace with the default category tree and
 *   alert rules rather than on an empty screen.
 *
 * Rate limiting is `authRateLimit`, like `/login`. Only its per-address bucket
 * charges here — the per-account bucket keys on `req.body.email` and this body
 * carries no address, only an opaque token — which is the right outcome
 * regardless: there is no password to guess, so the per-account bound has
 * nothing to bound. Forging the token means forging Google's signature.
 */
export async function loginWithGoogle(credential: string, context: AuthContext): Promise<AuthenticatedResult> {
  const identity = await verifyGoogleIdToken(credential);

  const [byGoogleId, byEmail] = await Promise.all([
    db
      .selectFrom('users')
      .selectAll()
      .where('google_id', '=', identity.googleId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst(),
    db
      .selectFrom('users')
      .selectAll()
      // `citext`, so this matches whatever case Google sent; the address was
      // lowercased on the way out of verification anyway.
      .where('email', '=', identity.email)
      .where('deleted_at', 'is', null)
      .executeTakeFirst(),
  ]);

  const decision = decideGoogleAccount(identity, { byGoogleId, byEmail });

  switch (decision.kind) {
    case 'refuse-unverified-email': {
      // Worth a log line: this is either a misconfigured Google Workspace or
      // somebody trying to reach an account they do not own, and neither is
      // visible anywhere else. The token itself is never logged — it is a live
      // credential for as long as it is valid.
      logger.warn(
        { googleId: identity.googleId, userId: byEmail?.id },
        'Refused a Google sign-in: the address is already registered and Google did not verify it',
      );
      throw unauthorized('auth.googleEmailNotVerified');
    }

    case 'sign-in':
      return completeSignIn(byGoogleId!, context, GOOGLE_SIGN_IN_EVENT);

    case 'link': {
      // The unique partial index on `google_id` is what makes this safe under a
      // race: two simultaneous first-time sign-ins for the same address cannot
      // both succeed, and the loser gets a conflict rather than a second
      // account pointing at the same Google identity.
      const linked = await db
        .updateTable('users')
        .set({ google_id: identity.googleId })
        .where('id', '=', decision.userId)
        .returningAll()
        .executeTakeFirstOrThrow();

      await recordActivity({
        actorUserId: linked.id,
        action: 'auth.google_linked',
        entityType: 'user',
        entityId: linked.id,
        summary: 'Google account linked',
        auditOnly: true,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      });

      return completeSignIn(linked, context, GOOGLE_SIGN_IN_EVENT);
    }

    case 'create': {
      const created = await createGoogleUser(identity, context);
      return completeSignIn(created, context, GOOGLE_SIGN_IN_EVENT);
    }
  }
}

const GOOGLE_SIGN_IN_EVENT = { action: 'auth.login_google', summary: 'Signed in with Google' } as const;

/**
 * The `create` branch of `loginWithGoogle`, kept separate because it is the
 * half that mirrors `register` — same workspace provisioning, same audit line —
 * and reads better beside it than inlined in a `switch`.
 *
 * `locale`, `timezone` and `base_currency` are left to the column defaults
 * (pt-BR / America/Sao_Paulo / BRL). Google's ID token does carry a `locale`
 * claim, but it is the language of the *Google account*, which is a different
 * question from the language this app was being read in; the client sends the
 * latter on `/auth/register` and has nowhere to put it here. Guessing wrong
 * would also fix the language of every server-rendered sentence afterwards,
 * since `requireAuth` prefers the stored locale over `Accept-Language`.
 */
async function createGoogleUser(identity: GoogleIdentity, context: AuthContext): Promise<SignInUserRow> {
  const user = await db
    .insertInto('users')
    .values({
      email: identity.email,
      // Deliberately null: this account has no password and does not need one.
      password_hash: null,
      // `name` is only present when the profile scope was granted. The local
      // part of the address is a poor name and a much better fallback than an
      // empty one, which `full_name` is NOT NULL to prevent.
      full_name: identity.fullName ?? identity.email.split('@')[0]!,
      avatar_url: identity.pictureUrl,
      google_id: identity.googleId,
      // Google has already verified the address — see `decideGoogleAccount`,
      // which only reaches `create` when it says so.
      email_verified_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await createWorkspace({
    name: `${firstName(user.full_name)}'s Finances`,
    type: 'personal',
    baseCurrency: user.base_currency,
    timezone: user.timezone,
    locale: user.locale,
    ownerId: user.id,
  });

  await recordActivity({
    actorUserId: user.id,
    action: 'auth.registered_google',
    entityType: 'user',
    entityId: user.id,
    summary: 'Account created with Google',
    auditOnly: true,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  return user;
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

  await rejectBreachedPassword(newPassword, 'newPassword');
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

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

interface VerifiableUser {
  id: string;
  email: string;
  full_name: string;
  locale: string;
}

/** Generates a fresh verification token, stores its hash, and emails the link. */
async function issueEmailVerification(user: VerifiableUser): Promise<void> {
  const token = randomBytes(32).toString('base64url');

  await db
    .updateTable('users')
    .set({
      email_verification_token_hash: hashEmailToken(token),
      email_verification_expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 3_600_000),
    })
    .where('id', '=', user.id)
    .execute();

  const verifyUrl = `${env.WEB_BASE_URL}/verify-email?token=${token}`;

  await sendEmail(
    verificationEmail({
      to: user.email,
      fullName: user.full_name,
      verifyUrl,
      expiresInHours: EMAIL_VERIFICATION_TTL_HOURS,
      locale: resolveLocale(user.locale),
    }),
  );
}

/**
 * Re-sends the verification email for the signed-in account.
 *
 * A no-op when the address is already verified, rather than an error: asking
 * again must not spam the inbox, and the client hides the "resend" control
 * once verified anyway, so this path is a defensive no-op rather than a case
 * worth its own message.
 */
export async function resendVerification(userId: string): Promise<void> {
  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'full_name', 'locale', 'email_verified_at'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user) throw notFound('resources.user');
  if (user.email_verified_at) return;

  await issueEmailVerification(user);
}

/**
 * Confirms an emailed verification link.
 *
 * Unauthenticated on purpose: the token itself is the proof of control over
 * the inbox, and the link may be opened with no session at all — a different
 * device, or a webmail client's own preview pane.
 */
export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashEmailToken(token);

  const user = await db
    .selectFrom('users')
    .select(['id', 'email_verification_expires_at'])
    .where('email_verification_token_hash', '=', tokenHash)
    .executeTakeFirst();

  if (!user) throw unprocessable('auth.verificationTokenInvalid');
  if (!user.email_verification_expires_at || user.email_verification_expires_at.getTime() <= Date.now()) {
    throw unprocessable('auth.verificationTokenExpired');
  }

  await db
    .updateTable('users')
    .set({
      email_verified_at: new Date(),
      email_verification_token_hash: null,
      email_verification_expires_at: null,
    })
    .where('id', '=', user.id)
    .execute();

  await recordActivity({
    actorUserId: user.id,
    action: 'auth.email_verified',
    entityType: 'user',
    entityId: user.id,
    summary: 'Email address verified',
    auditOnly: true,
  });
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Requests a password-reset email.
 *
 * Always resolves, whether or not the address has an account — the route
 * answers 204 unconditionally regardless, which is what keeps this from being
 * an oracle for which addresses are registered.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalised = email.trim().toLowerCase();

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'full_name', 'locale'])
    .where('email', '=', normalised)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!user) return;

  const token = randomBytes(32).toString('base64url');

  await db
    .updateTable('users')
    .set({
      password_reset_token_hash: hashEmailToken(token),
      password_reset_expires_at: new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 3_600_000),
    })
    .where('id', '=', user.id)
    .execute();

  const resetUrl = `${env.WEB_BASE_URL}/reset-password?token=${token}`;

  await sendEmail(
    passwordResetEmail({
      to: user.email,
      fullName: user.full_name,
      resetUrl,
      expiresInHours: PASSWORD_RESET_TTL_HOURS,
      locale: resolveLocale(user.locale),
    }),
  );
}

/**
 * Consumes a password-reset token and signs the caller straight back in — the
 * same shape `login` returns, so the client can treat a successful reset
 * exactly like a fresh sign-in.
 *
 * Every other session is revoked in the same transaction as the password
 * change, for the same reason `changePassword` does it: a reset is exactly the
 * moment a previous, possibly-compromised session should not survive.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  context: AuthContext,
): Promise<AuthenticatedResult> {
  const tokenHash = hashEmailToken(token);

  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('password_reset_token_hash', '=', tokenHash)
    .executeTakeFirst();

  if (!user) throw unprocessable('auth.resetTokenInvalid');
  if (!user.password_reset_expires_at || user.password_reset_expires_at.getTime() <= Date.now()) {
    throw unprocessable('auth.resetTokenExpired');
  }

  await rejectBreachedPassword(newPassword, 'newPassword');
  const hash = await hashPassword(newPassword);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('users')
      .set({ password_hash: hash, password_reset_token_hash: null, password_reset_expires_at: null })
      .where('id', '=', user.id)
      .execute();
    await revokeAllUserTokens(user.id, trx);
  });

  // Same reasoning as `login`: proving control of the account — here, of the
  // inbox behind the reset link — is what calls off a pending erasure.
  if (user.deletion_requested_at) await cancelAccountDeletion(user.id);

  await recordActivity({
    actorUserId: user.id,
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: user.id,
    summary: 'Password reset',
    auditOnly: true,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  const tokens = await issueTokens(user.id, user.email, context);
  const defaultWorkspaceId = await firstWorkspaceId(user.id);

  return {
    user: toPublicUser(user),
    ...tokens,
    ...(defaultWorkspaceId ? { defaultWorkspaceId } : {}),
  };
}

/** The oldest active workspace a user belongs to, for the client's first navigation. */
async function firstWorkspaceId(userId: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select('workspaces.id as id')
    .where('workspace_members.user_id', '=', userId)
    .where('workspaces.archived_at', 'is', null)
    .orderBy('workspaces.created_at', 'asc')
    .limit(1)
    .executeTakeFirst();
  return row?.id;
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
  email_verified_at?: Date | null;
}

/**
 * What `completeSignIn` reads on top of the public fields: whether the account
 * is still allowed a session, and whether an erasure is waiting to be called
 * off. Every caller hands it a `selectAll()` row, so this is a narrowing rather
 * than a shape anything has to build.
 */
interface SignInUserRow extends UserRow {
  status: 'active' | 'suspended' | 'deleted';
  deletion_requested_at: Date | null;
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
    emailVerifiedAt: user.email_verified_at ?? null,
  };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? 'My';
}
