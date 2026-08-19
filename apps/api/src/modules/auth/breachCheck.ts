import { createHash } from 'node:crypto';

/**
 * Checks a password against Have I Been Pwned's "Pwned Passwords" range API
 * (L-7 in AUDIT_REPORT.md): the composition rule alone — 10 characters,
 * letters and digits — lets `Password12` through, which is on every
 * credential-stuffing list there is.
 *
 * **k-anonymity is what makes this safe to call a third party for at all.**
 * The password is hashed with SHA-1 locally; only the first 5 hex characters
 * of that hash ever leave this process. The API answers with every suffix it
 * knows starting with that prefix — several hundred, on average — so it
 * cannot tell which one, if any, was the real password, only that this
 * process asked about one of several hundred candidates. Neither the
 * password nor its full hash crosses the network.
 *
 * Everything here is pure apart from a single `fetch`, and that call is
 * injectable, so the whole module is unit-testable with no network — the
 * same pattern `modules/currencies/providers.ts` uses, and for the same
 * reason: it deliberately imports neither `config/env` nor `db/client`.
 */

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<HttpResponseLike>;

export interface BreachCheckOptions {
  /** Overrides the default endpoint, for a proxy or a test double. */
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface BreachCheckResult {
  breached: boolean;
  /** How many times this exact password has been seen in a breach, per HIBP. */
  count: number;
}

const DEFAULT_API_URL = 'https://api.pwnedpasswords.com/range';
// On the interactive request path (register, change-password), not a
// background job — a slow third party should cost a request a few seconds,
// never make it hang. The caller fails open on any error this throws.
const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Resolves to whether the password appears in a known breach.
 *
 * Throws on any network, HTTP or parsing failure rather than returning
 * `{ breached: false }` — collapsing "definitely not breached" and "could not
 * check" into the same answer would make an outage of this API silently turn
 * the check off. The caller (`service.ts`) decides explicitly to fail open,
 * logging that it did, rather than that choice being invisible in here.
 */
export async function checkPasswordBreach(
  password: string,
  options: BreachCheckOptions = {},
): Promise<BreachCheckResult> {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const endpoint = (options.apiUrl?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch: FetchLike = options.fetchImpl ?? ((target, init) => globalThis.fetch(target, init));

  let response: HttpResponseLike;
  try {
    response = await doFetch(`${endpoint}/${prefix}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'text/plain' },
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : String(err);
    throw new Error(`pwned-passwords request failed: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(`pwned-passwords request returned HTTP ${response.status}`);
  }

  const body = await response.text();
  for (const line of body.split('\n')) {
    const [lineSuffix, countText] = line.trim().split(':');
    if (lineSuffix && lineSuffix.toUpperCase() === suffix) {
      return { breached: true, count: Number(countText) || 0 };
    }
  }

  return { breached: false, count: 0 };
}
