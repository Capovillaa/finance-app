/**
 * `modules/auth/google.ts` imports `config/env.ts`, which parses the whole
 * environment at import time — stubbed here the way `tests/unit/subkey.test.ts`
 * and `tests/unit/openapi.test.ts` do, with `await import` below so these
 * assignments land before env.ts is ever evaluated. Nothing in this file opens
 * a connection to any of them.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgres://google-test:google-test@localhost:5432/google_test_not_connected';
process.env.JWT_ACCESS_SECRET ??= 'google-test-placeholder-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'google-test-placeholder-refresh-secret';
process.env.EMAIL_TOKEN_SECRET ??= 'google-test-placeholder-email-secret';
// The audience every token below is checked against, for the pure-unit lane
// (`vitest.unit.config.ts`), which sets none. Under the full config
// `test.env` has already supplied one and this assignment lands too late to
// matter — `config/env.ts` parses at import, and the setup file's own hoisted
// imports pull it in first. Which is why nothing below asserts a literal
// client ID: the assertions read `env.GOOGLE_CLIENT_ID`, so they hold under
// either config and on a machine whose `.env` names a real one.
process.env.GOOGLE_CLIENT_ID ??= 'unit-test-client-id.apps.googleusercontent.com';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OAuth2Client, TokenPayload } from 'google-auth-library';

const { isAppError } = await import('../../src/lib/errors.js');
const { env } = await import('../../src/config/env.js');
const { decideGoogleAccount, googleSignInConfigured, verifyGoogleIdToken } = await import(
  '../../src/modules/auth/google.js'
);

/**
 * The Google sign-in rules, with no database and no network.
 *
 * `verifyGoogleIdToken.verify` is the single seam into `google-auth-library`,
 * and every case here replaces it: reaching the real verifier would mean
 * fetching Google's certificates over the internet, which would make this suite
 * network-bound and untestable offline for a check whose whole content is
 * "whatever the library said, this is what we do with it".
 *
 * The link/create rules are exercised through `decideGoogleAccount`, which is a
 * pure function precisely so they can be read here rather than inferred from a
 * sequence of database fixtures. `tests/integration/auth-google.test.ts` runs
 * the same four cases end to end, through the route and against real rows.
 */

const realVerify = verifyGoogleIdToken.verify;

/** A verified ticket carrying `payload`, shaped the way the library returns one. */
function ticketFor(payload: Partial<TokenPayload>) {
  return { getPayload: () => payload as TokenPayload };
}

function stubVerifier(impl: (idToken: string, audience: string) => unknown): void {
  verifyGoogleIdToken.verify = ((_client: OAuth2Client, idToken: string, audience: string) =>
    Promise.resolve(impl(idToken, audience))) as typeof verifyGoogleIdToken.verify;
}

afterEach(() => {
  verifyGoogleIdToken.verify = realVerify;
  vi.restoreAllMocks();
});

describe('verifyGoogleIdToken', () => {
  it('reports the claims of a token the library accepted', async () => {
    stubVerifier(() =>
      ticketFor({
        sub: '110000000000000000001',
        email: 'Ana@Example.COM',
        email_verified: true,
        name: '  Ana Souza  ',
        picture: 'https://lh3.googleusercontent.com/a/ana',
      }),
    );

    const identity = await verifyGoogleIdToken('an.id.token');

    expect(identity).toEqual({
      googleId: '110000000000000000001',
      // Lowercased on the way in, because `users.email` is `citext` and every
      // other path in this codebase normalises before comparing.
      email: 'ana@example.com',
      emailVerified: true,
      fullName: 'Ana Souza',
      pictureUrl: 'https://lh3.googleusercontent.com/a/ana',
    });
  });

  it('checks the token against this deployment’s own client ID', async () => {
    const audiences: string[] = [];
    stubVerifier((_idToken, audience) => {
      audiences.push(audience);
      return ticketFor({ sub: 'sub-1', email: 'a@example.com', email_verified: true });
    });

    await verifyGoogleIdToken('an.id.token');

    // The audience is the entire reason a token minted for some other
    // application cannot be replayed at this one.
    expect(audiences).toEqual([env.GOOGLE_CLIENT_ID]);
    expect(env.GOOGLE_CLIENT_ID).toBeTruthy();
  });

  it('rejects a token the library refuses, without saying which check failed', async () => {
    verifyGoogleIdToken.verify = (() =>
      Promise.reject(new Error('Wrong recipient, payload audience != requiredAudience'))) as typeof verifyGoogleIdToken.verify;

    const error = await verifyGoogleIdToken('forged.id.token').catch((err: unknown) => err);

    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'unauthorized', messageKey: 'auth.googleTokenInvalid' });
    // The library's own sentence names the check that failed, which is only
    // useful to whoever is probing the endpoint. It must not reach the client.
    expect((error as { messageKey: string }).messageKey).not.toContain('audience');
  });

  it('rejects a well-signed token that is missing the claims this app needs', async () => {
    stubVerifier(() => ticketFor({ sub: 'sub-1' }));

    await expect(verifyGoogleIdToken('an.id.token')).rejects.toMatchObject({
      messageKey: 'auth.googleTokenInvalid',
    });

    stubVerifier(() => ticketFor({ email: 'a@example.com', email_verified: true }));

    await expect(verifyGoogleIdToken('an.id.token')).rejects.toMatchObject({
      messageKey: 'auth.googleTokenInvalid',
    });
  });

  it('treats a name granted without the profile scope as absent rather than empty', async () => {
    stubVerifier(() => ticketFor({ sub: 'sub-1', email: 'a@example.com', email_verified: true }));

    const identity = await verifyGoogleIdToken('an.id.token');

    expect(identity.fullName).toBeNull();
    expect(identity.pictureUrl).toBeNull();
  });

  it('treats a missing email_verified claim as unverified, never as verified', async () => {
    stubVerifier(() => ticketFor({ sub: 'sub-1', email: 'a@example.com' }));

    const identity = await verifyGoogleIdToken('an.id.token');

    expect(identity.emailVerified).toBe(false);
  });

  it('knows the deployment is configured, since these tests set a client ID', () => {
    expect(googleSignInConfigured()).toBe(true);
  });

  /**
   * The promise that makes this feature optional: a deployment with no client
   * ID keeps working, password-only, and this endpoint simply refuses.
   *
   * `env` is written to directly rather than re-imported with a cleared
   * `process.env`, because `config/env.ts` runs dotenv at import — so a
   * re-import would read whatever the developer's own `.env` happens to say
   * and the assertion would depend on the machine it ran on. The value is put
   * back immediately.
   */
  it('refuses outright when the deployment has no client ID at all', async () => {
    const mutable = env as unknown as { GOOGLE_CLIENT_ID: string | undefined };
    const configured = mutable.GOOGLE_CLIENT_ID;
    mutable.GOOGLE_CLIENT_ID = undefined;

    let reachedTheVerifier = false;
    stubVerifier(() => {
      reachedTheVerifier = true;
      return ticketFor({ sub: 'sub-1', email: 'a@example.com', email_verified: true });
    });

    try {
      expect(googleSignInConfigured()).toBe(false);
      await expect(verifyGoogleIdToken('an.id.token')).rejects.toMatchObject({
        code: 'unauthorized',
        messageKey: 'auth.googleNotConfigured',
      });
      // Refused before any work is done, rather than after failing to match an
      // audience of `undefined` against something.
      expect(reachedTheVerifier).toBe(false);
    } finally {
      mutable.GOOGLE_CLIENT_ID = configured;
    }
  });
});

describe('decideGoogleAccount', () => {
  const verified = { emailVerified: true };
  const unverified = { emailVerified: false };

  it('signs in an account that already carries this Google id', () => {
    expect(
      decideGoogleAccount(verified, { byGoogleId: { id: 'user-1' }, byEmail: { id: 'user-1' } }),
    ).toEqual({ kind: 'sign-in', userId: 'user-1' });
  });

  /**
   * A Google account's address can change. The `sub` cannot, so it wins — the
   * alternative is a second local account for the same person, silently.
   */
  it('prefers the Google id over the address when they disagree', () => {
    expect(
      decideGoogleAccount(verified, { byGoogleId: { id: 'user-1' }, byEmail: { id: 'user-2' } }),
    ).toEqual({ kind: 'sign-in', userId: 'user-1' });
  });

  it('links a verified Google address onto the existing account holding it', () => {
    expect(decideGoogleAccount(verified, { byEmail: { id: 'user-2' } })).toEqual({
      kind: 'link',
      userId: 'user-2',
    });
  });

  /**
   * The security case. `email_verified: false` means Google is passing an
   * address through without vouching for it, which some Workspace and
   * federated configurations do — so linking on it would hand whoever can type
   * the victim's address into such an account the victim's entire ledger.
   */
  it('refuses to link an unverified Google address onto an existing account', () => {
    expect(decideGoogleAccount(unverified, { byEmail: { id: 'user-2' } })).toEqual({
      kind: 'refuse-unverified-email',
    });
  });

  it('creates an account when neither identifier is known', () => {
    expect(decideGoogleAccount(verified, {})).toEqual({ kind: 'create' });
  });

  /**
   * Only the *link* branch is gated on verification. An unknown address cannot
   * take anything over, so refusing here would block a legitimate first sign-in
   * for no gain — the account it creates is the one Google's token describes.
   */
  it('still creates an account for an unverified address nobody else holds', () => {
    expect(decideGoogleAccount(unverified, {})).toEqual({ kind: 'create' });
  });

  it('never re-checks verification once the Google id is known', () => {
    expect(decideGoogleAccount(unverified, { byGoogleId: { id: 'user-1' } })).toEqual({
      kind: 'sign-in',
      userId: 'user-1',
    });
  });
});
