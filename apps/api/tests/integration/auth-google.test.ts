import type { OAuth2Client, TokenPayload } from 'google-auth-library';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { verifyGoogleIdToken } from '../../src/modules/auth/google.js';
import { api, registerUser } from '../helpers.js';

/**
 * `POST /auth/google`, end to end and against real rows.
 *
 * Only one thing is faked: `verifyGoogleIdToken.verify`, the single call into
 * `google-auth-library`. Everything above it is the real thing — the route, the
 * rate limiter, the validation, the account decision, the workspace
 * provisioning, the refresh cookie. Faking below that line is not a shortcut:
 * a genuine ID token needs Google's own signing key, so the alternative is not
 * a better test, it is no test.
 *
 * `vitest.config.ts`'s `test.env` supplies the `GOOGLE_CLIENT_ID` these tokens
 * are audienced to — it has to be there rather than in a setup file, which runs
 * after its own hoisted imports have already had `config/env.ts` parse the
 * environment. `tests/unit/google-identity.test.ts` covers the verification and
 * the link/create rules on their own.
 */

const realVerify = verifyGoogleIdToken.verify;

interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Makes the next verification succeed with these claims, whatever string the
 * client sends as `credential`.
 */
function googleReturns(claims: GoogleClaims): void {
  // Through `unknown`: a real `LoginTicket` carries three more methods that
  // nothing on this path calls, and stubbing them would be inventing behaviour.
  verifyGoogleIdToken.verify = (() =>
    Promise.resolve({
      getPayload: () =>
        ({
          sub: claims.sub,
          email: claims.email,
          email_verified: claims.emailVerified ?? true,
          name: claims.name,
          picture: claims.picture,
        }) as TokenPayload,
    })) as unknown as typeof verifyGoogleIdToken.verify;
}

/** Makes verification fail the way the library does on a token it will not accept. */
function googleRejects(): void {
  verifyGoogleIdToken.verify = ((_client: OAuth2Client) =>
    Promise.reject(new Error('Invalid token signature'))) as typeof verifyGoogleIdToken.verify;
}

/** Any string the schema accepts; the stub above never looks at it. */
const CREDENTIAL = 'header.payload.signature-long-enough-to-pass-validation';

const post = (credential: string = CREDENTIAL) =>
  api().post('/api/v1/auth/google').send({ credential });

afterEach(() => {
  verifyGoogleIdToken.verify = realVerify;
});

describe('POST /auth/google', () => {
  it('creates an account, its workspace and a verified address for a brand-new email', async () => {
    googleReturns({
      sub: '110000000000000000042',
      email: 'nova@example.com',
      name: 'Nova Pereira',
      picture: 'https://lh3.googleusercontent.com/a/nova',
    });

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('nova@example.com');
    expect(response.body.user.fullName).toBe('Nova Pereira');
    // Google has already verified the address, so there is no verification
    // email to open — which matters, because accepting a workspace invitation
    // is gated on exactly this field.
    expect(response.body.user.emailVerifiedAt).not.toBeNull();
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.defaultWorkspaceId).toBeTruthy();

    const user = await db
      .selectFrom('users')
      .select(['id', 'google_id', 'password_hash', 'avatar_url'])
      .where('email', '=', 'nova@example.com')
      .executeTakeFirstOrThrow();

    expect(user.google_id).toBe('110000000000000000042');
    // No password, and none needed: `password_hash` has been nullable since
    // migration 001 and `login` refuses a user without one.
    expect(user.password_hash).toBeNull();
    expect(user.avatar_url).toBe('https://lh3.googleusercontent.com/a/nova');

    // The same provisioning `register` does, not a bare account on an empty
    // screen: a personal workspace with the default category tree.
    const categories = await db
      .selectFrom('categories')
      .select('id')
      .where('workspace_id', '=', response.body.defaultWorkspaceId)
      .execute();
    expect(categories.length).toBeGreaterThan(30);
  });

  it('sets the refresh token as a cookie, exactly as /login does', async () => {
    googleReturns({ sub: 'sub-cookie', email: 'cookie@example.com' });

    const response = await post();

    // supertest types this header as a plain string; it is a list.
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((value) => value.startsWith('finance_refresh_token='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/i);
  });

  it('links onto an existing account when Google says the address is verified', async () => {
    const existing = await registerUser({ email: 'linkme@example.com' });

    googleReturns({ sub: 'sub-link', email: 'linkme@example.com', name: 'Ignored Name' });

    const response = await post();

    expect(response.status).toBe(200);
    // The *same* account, not a second one — this is the whole point.
    expect(response.body.user.id).toBe(existing.id);
    // Linking must not overwrite what the account already says about itself.
    expect(response.body.user.fullName).toBe(existing.fullName);

    const rows = await db
      .selectFrom('users')
      .select(['id', 'google_id', 'password_hash'])
      .where('email', '=', 'linkme@example.com')
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.google_id).toBe('sub-link');
    // The password still works afterwards; both doors now open the same account.
    expect(rows[0]!.password_hash).not.toBeNull();

    const stillWorks = await api()
      .post('/api/v1/auth/login')
      .send({ email: existing.email, password: existing.password });
    expect(stillWorks.status).toBe(200);
  });

  /**
   * The security case, and the reason `decideGoogleAccount` exists as its own
   * function. `email_verified: false` means Google is passing the address
   * through without vouching for it; linking on it would hand the ledger to
   * whoever could type the address into such a Google account.
   */
  it('refuses to reach an existing account with an unverified Google address', async () => {
    const victim = await registerUser({ email: 'victim@example.com' });

    googleReturns({ sub: 'sub-attacker', email: 'victim@example.com', emailVerified: false });

    const response = await post();

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');

    const row = await db
      .selectFrom('users')
      .select(['id', 'google_id'])
      .where('id', '=', victim.id)
      .executeTakeFirstOrThrow();
    expect(row.google_id).toBeNull();

    // And no second account was created behind the refusal either.
    const rows = await db.selectFrom('users').select('id').where('email', '=', 'victim@example.com').execute();
    expect(rows).toHaveLength(1);
  });

  it('signs the same person back in on a repeat visit, without creating anything', async () => {
    googleReturns({ sub: 'sub-repeat', email: 'repeat@example.com', name: 'Repeat Visitor' });

    const first = await post();
    expect(first.status).toBe(200);

    const second = await post();

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    // A fresh session each time, not the previous one handed back.
    expect(second.body.refreshToken).not.toBe(first.body.refreshToken);

    const rows = await db.selectFrom('users').select('id').where('google_id', '=', 'sub-repeat').execute();
    expect(rows).toHaveLength(1);

    const workspaces = await db
      .selectFrom('workspace_members')
      .select('workspace_id')
      .where('user_id', '=', first.body.user.id)
      .execute();
    expect(workspaces).toHaveLength(1);
  });

  /**
   * The `sub` is the identifier Google promises is stable; the address on a
   * Google account is not. Following the address instead would silently give
   * the same person a second account the day they change it.
   */
  it('follows the Google id when the account has since changed its address', async () => {
    googleReturns({ sub: 'sub-moved', email: 'before@example.com' });
    const first = await post();

    googleReturns({ sub: 'sub-moved', email: 'after@example.com' });
    const second = await post();

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);

    const rows = await db.selectFrom('users').select('id').where('google_id', '=', 'sub-moved').execute();
    expect(rows).toHaveLength(1);
  });

  it('rejects a token the verifier will not accept, saying nothing about why', async () => {
    googleRejects();

    const response = await post();

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
    // The library's own sentence names the check that failed. It stays in the
    // log; a caller gets this codebase's wording and nothing else.
    expect(JSON.stringify(response.body)).not.toContain('signature');
    expect(await db.selectFrom('users').select('id').execute()).toHaveLength(0);
  });

  it('will not accept a suspended account, even with a valid Google token', async () => {
    googleReturns({ sub: 'sub-suspended', email: 'suspended@example.com' });
    const created = await post();

    await db
      .updateTable('users')
      .set({ status: 'suspended' })
      .where('id', '=', created.body.user.id)
      .execute();

    const response = await post();

    expect(response.status).toBe(401);
  });

  /**
   * Every sign-in path owes `cancelAccountDeletion` a call — signing in is the
   * whole undo mechanism for a scheduled erasure, and a door that skips it lets
   * a pending deletion run after the user has demonstrably come back.
   */
  it('calls off a pending account erasure, the same way a password sign-in does', async () => {
    googleReturns({ sub: 'sub-returning', email: 'returning@example.com' });
    const created = await post();

    await db
      .updateTable('users')
      .set({ deletion_requested_at: new Date() })
      .where('id', '=', created.body.user.id)
      .execute();

    const response = await post();

    expect(response.status).toBe(200);
    const row = await db
      .selectFrom('users')
      .select('deletion_requested_at')
      .where('id', '=', created.body.user.id)
      .executeTakeFirstOrThrow();
    expect(row.deletion_requested_at).toBeNull();
  });

  it('rejects a body without a usable credential before any verification happens', async () => {
    googleRejects();

    await expect(api().post('/api/v1/auth/google').send({}).then((r) => r.status)).resolves.toBe(422);
    await expect(post('short').then((r) => r.status)).resolves.toBe(422);
  });

  it('never returns the Google id or a password hash', async () => {
    googleReturns({ sub: '110000000000000000042', email: 'quiet@example.com' });

    const response = await post();

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('110000000000000000042');
    expect(body).not.toContain('$2a$');
  });
});
