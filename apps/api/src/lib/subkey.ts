import { hkdfSync } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Derives a purpose-labelled subkey from `JWT_REFRESH_SECRET` via HKDF
 * (RFC 5869), rather than handing the raw secret to more than one HMAC.
 *
 * `JWT_REFRESH_SECRET` signs two unrelated things — refresh tokens
 * (`modules/auth/tokens.ts`) and workspace invitation tokens
 * (`modules/workspaces/invitations.ts`) — and using the same bytes for both
 * meant rotating the secret after a suspected leak in one context silently
 * invalidated the other, and a weakness discovered in one context applied
 * directly to the other. Deriving a distinct subkey per purpose closes both:
 * the two HMAC keys share no bytes even though they share one root secret,
 * so a leak of the derived refresh-token key does not yield the
 * invitation-token key or vice versa. See finding M-11 in AUDIT_REPORT.md.
 *
 * There is no separate salt, since HKDF's salt exists to combine several
 * *independent* sources of entropy into one key and there is only one input
 * here — the security this buys comes entirely from the `info` label
 * separating the outputs, not from the salt.
 *
 * This does not need its own env var the way `EMAIL_TOKEN_SECRET` did:
 * `EMAIL_TOKEN_SECRET` was a genuinely *third* purpose being proposed for
 * this same root secret, and adding a third HMAC use on top of an unfixed M-11
 * would have made the underlying problem worse rather than better. Deriving
 * subkeys for the two uses that already existed removes the sharing between
 * them instead.
 */
export function deriveSubkey(purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', env.JWT_REFRESH_SECRET, '', purpose, 32));
}
