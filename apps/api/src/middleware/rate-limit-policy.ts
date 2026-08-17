/**
 * The decisions a rate limiter makes, separated from the machinery it makes them
 * with. Nothing in this file imports `config/env`, `lib/redis` or Express, which
 * is what lets every rule below be unit-tested with no infrastructure at all —
 * the same rule `modules/currencies/providers.ts` follows, and for the same
 * reason: the hard part is the policy, not the plumbing.
 */

/**
 * What Express should be told about proxies in front of it.
 *
 * This is a security setting, not a deployment detail. `trust proxy` makes
 * Express read `req.ip` out of `X-Forwarded-For`, which is a header the client
 * sends — so trusting it when nothing is actually in front means any caller can
 * mint a fresh rate-limit bucket on every request just by changing a string.
 * The default is therefore "trust nothing", and a deployment that really does
 * sit behind a proxy says so.
 */
export type TrustProxySetting = boolean | number | string;

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim() ?? '';
  const lowered = value.toLowerCase();

  if (value === '' || lowered === 'false' || value === '0') return false;
  if (lowered === 'true') return true;
  // A hop count: `1` means "the nearest proxy is ours, believe one hop".
  if (/^\d+$/.test(value)) return Number(value);
  // Anything else is handed to Express verbatim: `loopback`, `uniquelocal`, or a
  // comma-separated list of trusted addresses and subnets.
  return value;
}

/**
 * The budget the per-process fallback limiter gets when the shared store is
 * unreachable.
 *
 * A fallback is right — a Redis blip must not turn into a total outage — but the
 * naive version hands *every* replica the whole budget, so a three-instance
 * deployment quietly starts allowing three times what it advertises at exactly
 * the moment it is least healthy. Dividing by the declared instance count keeps
 * the aggregate roughly honest; one point is the floor, because a limiter that
 * allows nothing is an outage of its own.
 */
export function insurancePoints(points: number, instances: number): number {
  return Math.max(1, Math.floor(points / Math.max(1, instances)));
}

/** Extracts a bearer token, or null if the header is absent or not a bearer. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

/**
 * The identity a request should be charged to, or null if it has none.
 *
 * The verifier is injected so this file stays free of the auth module (and
 * therefore of the database it imports). An invalid or expired token yields no
 * identity on purpose: if a forged token produced a bucket, an attacker could
 * mint a fresh budget per request by sending fresh garbage, which is the very
 * hole the whole limiter exists to close.
 */
export function bearerSubject(
  token: string | null,
  verify: (token: string) => { sub: string },
): string | null {
  if (!token) return null;
  try {
    return verify(token).sub || null;
  } catch {
    return null;
  }
}

export const ipKey = (ip: string | null | undefined): string => `ip:${ip?.trim() || 'unknown'}`;

export const userKey = (userId: string): string => `user:${userId}`;

/**
 * The bucket a credential attempt is charged to *as an account*, which is
 * deliberately independent of where it came from.
 *
 * Keying credential attempts on `ip:email` — one string combining both — looks
 * like limiting on two dimensions and is the opposite: every new IP is a new
 * key, so an attacker with a list of addresses gets the full budget again for
 * each one against the same account. The account has to be its own bucket for
 * the rotation to cost the attacker anything.
 */
export function accountKey(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalised = email.trim().toLowerCase();
  return normalised ? `account:${normalised}` : null;
}
