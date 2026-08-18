import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { db, type Executor } from '../../db/client.js';
import { unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { deriveSubkey } from '../../lib/subkey.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  jti: string;
  /**
   * When this token was issued, in milliseconds — checked against the user's
   * `tokens_valid_from` to decide whether a revocation has overtaken it.
   *
   * A JWT's own `iat` counts whole seconds, which is too coarse to be the
   * answer here: within the second that a revocation lands, "issued before" and
   * "issued after" are indistinguishable, so either a stale token survives or
   * the replacement the user just signed in for is rejected on arrival. A
   * millisecond claim removes the ambiguity instead of trading one failure for
   * the other. Tokens minted before this claim existed fall back to `iat`.
   */
  issuedAtMs: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function signAccessToken(userId: string, email: string): { token: string; expiresIn: number } {
  const token = jwt.sign({ email, jti: randomUUID(), iatMs: Date.now() }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'finance-api',
    audience: 'finance-app',
  } as jwt.SignOptions);

  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  const expiresIn = decoded?.exp && decoded.iat ? decoded.exp - decoded.iat : 900;
  return { token, expiresIn };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'finance-api',
      audience: 'finance-app',
    }) as jwt.JwtPayload;

    if (!payload.sub) throw new Error('missing subject');
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      jti: String(payload.jti ?? ''),
      issuedAtMs: Number(payload.iatMs ?? Number(payload.iat ?? 0) * 1000),
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw unauthorized('auth.accessTokenExpired');
    }
    throw unauthorized('auth.invalidAccessToken');
  }
}

/**
 * Refresh tokens are opaque random strings, never JWTs: the server must be able
 * to revoke one instantly, which a self-contained token cannot offer. Only a
 * keyed hash is persisted, so a database leak does not yield usable tokens.
 *
 * Keyed with a subkey derived from `JWT_REFRESH_SECRET` (`lib/subkey.ts`)
 * rather than the raw secret — see M-11 in AUDIT_REPORT.md, and
 * `workspaces/invitations.ts`'s `hashToken` for the other purpose this same
 * root secret used to share a key with.
 */
const REFRESH_TOKEN_SUBKEY = deriveSubkey('refresh-token');

function hashRefreshToken(token: string): string {
  return createHmac('sha256', REFRESH_TOKEN_SUBKEY).update(token).digest('hex');
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}

export interface IssueRefreshOptions {
  userId: string;
  familyId?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  executor?: Executor;
}

export async function issueRefreshToken(options: IssueRefreshOptions): Promise<{ token: string; id: string }> {
  const executor = options.executor ?? db;
  const token = randomBytes(48).toString('base64url');

  const row = await executor
    .insertInto('refresh_tokens')
    .values({
      user_id: options.userId,
      family_id: options.familyId ?? randomUUID(),
      token_hash: hashRefreshToken(token),
      expires_at: refreshExpiry(),
      user_agent: options.userAgent ?? null,
      ip_address: options.ipAddress ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return { token, id: row.id };
}

export interface RotationResult {
  userId: string;
  token: string;
}

/**
 * Validates a refresh token and swaps it for a fresh one.
 *
 * Presenting an already-rotated token means it was captured and replayed, so
 * the entire family is revoked and every session from that login is dropped.
 */
export async function rotateRefreshToken(
  presented: string,
  context: { userAgent?: string | null; ipAddress?: string | null },
): Promise<RotationResult> {
  const presentedHash = hashRefreshToken(presented);

  /**
   * The transaction reports what happened rather than throwing. Throwing inside
   * it would roll the transaction back — including the family revocation on the
   * reuse path, which would leave the stolen token's replacement usable and make
   * the whole defence inert. Rejections are raised below, after the commit.
   */
  type Outcome =
    | { kind: 'unknown' }
    | { kind: 'expired' }
    | { kind: 'reuse'; userId: string; familyId: string }
    | { kind: 'rotated'; userId: string; token: string };

  const outcome = await db.transaction().execute<Outcome>(async (trx) => {
    const existing = await trx
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('token_hash', '=', presentedHash)
      .forUpdate()
      .executeTakeFirst();

    if (!existing) return { kind: 'unknown' };

    if (existing.revoked_at) {
      await trx
        .updateTable('refresh_tokens')
        .set({ revoked_at: new Date() })
        .where('family_id', '=', existing.family_id)
        .where('revoked_at', 'is', null)
        .execute();
      return { kind: 'reuse', userId: existing.user_id, familyId: existing.family_id };
    }

    if (existing.expires_at.getTime() <= Date.now()) return { kind: 'expired' };

    const next = await issueRefreshToken({
      userId: existing.user_id,
      familyId: existing.family_id,
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null,
      executor: trx,
    });

    await trx
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(), replaced_by_id: next.id })
      .where('id', '=', existing.id)
      .execute();

    return { kind: 'rotated', userId: existing.user_id, token: next.token };
  });

  switch (outcome.kind) {
    case 'unknown':
      throw unauthorized('auth.invalidRefreshToken');
    case 'expired':
      throw unauthorized('auth.refreshTokenExpired');
    case 'reuse':
      logger.warn(
        { userId: outcome.userId, familyId: outcome.familyId },
        'Refresh token reuse detected; token family revoked',
      );
      throw unauthorized('auth.refreshTokenReused');
    case 'rotated':
      return { userId: outcome.userId, token: outcome.token };
  }
}

export async function revokeRefreshToken(presented: string): Promise<void> {
  await db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('token_hash', '=', hashRefreshToken(presented))
    .where('revoked_at', 'is', null)
    .execute();
}

/**
 * Signs the user out everywhere (password change, "log out other devices",
 * account deletion).
 *
 * Both halves are needed and neither is enough alone: revoking the refresh
 * tokens ends the sessions' ability to renew, and moving `tokens_valid_from`
 * forward ends the access tokens already in circulation — which are otherwise
 * good for the rest of their lifetime, so that "sign out everywhere" quietly
 * meant "in about fifteen minutes".
 */
export async function revokeAllUserTokens(userId: string, executor: Executor = db): Promise<void> {
  await executor
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .execute();

  await executor
    .updateTable('users')
    .set({ tokens_valid_from: new Date() })
    .where('id', '=', userId)
    .execute();
}

export async function purgeExpiredTokens(): Promise<number> {
  const result = await db
    .deleteFrom('refresh_tokens')
    .where('expires_at', '<', new Date(Date.now() - 7 * 86_400_000))
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

/**
 * HMAC for password-reset and email-verification tokens.
 *
 * A separate key from `hashRefreshToken`'s `JWT_REFRESH_SECRET`, on purpose —
 * see `EMAIL_TOKEN_SECRET` in `config/env.ts`. Only the hash reaches the
 * database, so a leak of `users.password_reset_token_hash` or
 * `.email_verification_token_hash` cannot be replayed into either flow.
 */
export function hashEmailToken(token: string): string {
  return createHmac('sha256', env.EMAIL_TOKEN_SECRET).update(token).digest('hex');
}

/** Constant-time comparison for opaque tokens delivered by other channels. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export { hashRefreshToken };
