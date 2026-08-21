import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';

/**
 * "Sign in with Google", the client-side half of it.
 *
 * The browser runs Google Identity Services, which hands it a signed **ID
 * token** — a JWT, issued by Google, audienced to our own client ID — and the
 * client POSTs that string to `/auth/google`. There is no authorization code,
 * no token exchange and therefore no client *secret*: the only Google value
 * this deployment holds is `GOOGLE_CLIENT_ID`, which is public by construction
 * because the browser has to send it to Google to get the token at all. See
 * `docs/decisions.md`, "Sign in with Google verifies an ID token in place".
 *
 * What that buys is also what it costs: the token arrives from the client, so
 * *everything* in it is a claim until the signature says otherwise. Nothing in
 * this file reads a field before `verifyIdToken` has checked the signature
 * against Google's published keys, the audience against our client ID, the
 * issuer against Google's own, and the expiry.
 *
 * The link/create decision is deliberately a separate, pure function
 * (`decideGoogleAccount`) rather than a branch inside the service: it is the
 * part with a security consequence — an unverified Google address must never
 * reach an existing account — and it is worth being able to test without a
 * database. `tests/unit/google-identity.test.ts` does exactly that.
 */

/** The claims this app uses, after verification. Nothing unverified reaches it. */
export interface GoogleIdentity {
  /** Google's `sub`: stable for one Google account, and never an email address. */
  googleId: string;
  /** Lowercased, because `users.email` is `citext` and everything else normalises. */
  email: string;
  /** Google's own `email_verified`. False is a refusal, not a detail — see below. */
  emailVerified: boolean;
  /** `name`, when the user granted the profile scope. */
  fullName: string | null;
  /** `picture`. Stored as `users.avatar_url` on a newly created account only. */
  pictureUrl: string | null;
}

/**
 * Whether this deployment has been given a client ID at all.
 *
 * Google sign-in is optional end to end: the server refuses the endpoint
 * without one, and the client does not render the button without its own
 * `VITE_GOOGLE_CLIENT_ID`. A deployment that wants password sign-in and
 * nothing else sets neither and is unaffected.
 */
export function googleSignInConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID);
}

/**
 * One client for the process, built on first use.
 *
 * It is not just a wrapper around a `jwt.verify`: it fetches and *caches*
 * Google's signing certificates, keyed off the `Cache-Control` on Google's own
 * response. A fresh client per request would re-fetch them on every sign-in.
 */
let client: OAuth2Client | undefined;

function verifier(): OAuth2Client {
  client ??= new OAuth2Client();
  return client;
}

/**
 * Checks an ID token and returns the claims it actually proves.
 *
 * Throws `auth.googleNotConfigured` when this deployment has no client ID — a
 * 401 rather than a 500, because from the caller's side the endpoint simply
 * does not accept credentials here.
 *
 * Every other failure — a forged signature, a token minted for a *different*
 * application's client ID, an expired one, one missing the claims this app
 * needs — is the same `auth.googleTokenInvalid`. They are not distinguished on
 * purpose: the difference is only ever useful to someone probing the endpoint.
 */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentity> {
  const audience = env.GOOGLE_CLIENT_ID;
  if (!audience) throw unauthorized('auth.googleNotConfigured');

  let payload;
  try {
    // Checks the signature against Google's published keys, `aud` against our
    // client ID, `iss` against Google's, and `exp`. A token that fails any of
    // them throws rather than returning something to inspect.
    const ticket = await verifyGoogleIdToken.verify(verifier(), credential, audience);
    payload = ticket.getPayload();
  } catch {
    throw unauthorized('auth.googleTokenInvalid');
  }

  // `sub` and `email` are the two claims this app cannot do without: one
  // identifies the account for good, the other is what an existing account is
  // matched on. A token carrying neither is not usable, however well signed.
  if (!payload?.sub || !payload.email) throw unauthorized('auth.googleTokenInvalid');

  return {
    googleId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: payload.email_verified === true,
    fullName: payload.name?.trim() || null,
    pictureUrl: payload.picture ?? null,
  };
}

/**
 * The one call into `google-auth-library`, hung off the function above so a
 * test can replace it without a module mock reaching every other import.
 *
 * `verifyIdToken` is the library's only network-touching path here, and it is
 * network-touching only until the certificate cache is warm — which is exactly
 * why a test must not be allowed to reach it.
 */
verifyGoogleIdToken.verify = (oauthClient: OAuth2Client, idToken: string, audience: string) =>
  oauthClient.verifyIdToken({ idToken, audience });

/** The row shapes `decideGoogleAccount` needs. Nothing else is read. */
export interface GoogleAccountMatches {
  /** The account already carrying this `sub`, if there is one. */
  byGoogleId?: { id: string } | undefined;
  /** The account holding this email address, if there is one. */
  byEmail?: { id: string } | undefined;
}

export type GoogleAccountDecision =
  /** Known Google account: this is an ordinary sign-in. */
  | { kind: 'sign-in'; userId: string }
  /** Known address, no Google link yet: adopt this `sub` onto it and sign in. */
  | { kind: 'link'; userId: string }
  /** Nobody here by either identifier: make an account. */
  | { kind: 'create' }
  /** The address is taken and Google will not vouch for it. Refuse. */
  | { kind: 'refuse-unverified-email' };

/**
 * What a verified Google identity means for the accounts we already hold.
 *
 * The order matters, and the middle branch is the one with teeth.
 *
 * 1. **A matching `sub` wins outright.** It is the identifier Google promises
 *    is stable; the address on a Google account can change, and if it does,
 *    this is what keeps the person in the same account rather than making them
 *    a second one.
 *
 * 2. **A matching address links, but only if Google says it is verified.**
 *    Linking on an address alone is how "sign in with a provider" turns into
 *    account takeover: `email_verified: false` means Google is passing the
 *    address through without vouching for it — which is ordinary in some
 *    Workspace and federated configurations — so anyone able to *type* the
 *    victim's address into such an account would otherwise be handed the
 *    victim's ledger. Refused, and deliberately refused rather than falling
 *    through to "create", since creating would collide with
 *    `users_email_unique` anyway and report a database conflict instead of the
 *    real reason.
 *
 *    An address that already carries a *different* `sub` still links here. That
 *    is not a weaker case than the ordinary one: the premise of the whole
 *    branch is that a verified Google address proves control of that address,
 *    and a re-created Google account (a deleted-and-restored Workspace user
 *    gets a new `sub` on the same address) is exactly what it is for.
 *
 * 3. **Otherwise it is a new person**, and `loginWithGoogle` creates the
 *    account with no password hash and the address already verified.
 */
export function decideGoogleAccount(
  identity: Pick<GoogleIdentity, 'emailVerified'>,
  matches: GoogleAccountMatches,
): GoogleAccountDecision {
  if (matches.byGoogleId) return { kind: 'sign-in', userId: matches.byGoogleId.id };
  if (matches.byEmail) {
    if (!identity.emailVerified) return { kind: 'refuse-unverified-email' };
    return { kind: 'link', userId: matches.byEmail.id };
  }
  return { kind: 'create' };
}
