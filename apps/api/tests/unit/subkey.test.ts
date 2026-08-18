/**
 * `lib/subkey.ts` imports `config/env.ts`, which parses the environment at
 * import time — stubbed here the same way `tests/unit/openapi.test.ts` and
 * `tests/unit/db-client.test.ts` do, via `await import` so the assignments
 * below run before env.ts is ever evaluated.
 */
process.env.DATABASE_URL ??= 'postgres://subkey-test:subkey-test@localhost:5432/subkey_test_not_connected';
process.env.JWT_ACCESS_SECRET ??= 'subkey-test-placeholder-secret';
process.env.JWT_REFRESH_SECRET ??= 'subkey-test-placeholder-secret';
process.env.EMAIL_TOKEN_SECRET ??= 'subkey-test-placeholder-secret';

import { describe, expect, it } from 'vitest';

const { deriveSubkey } = await import('../../src/lib/subkey.js');

/**
 * M-11 in AUDIT_REPORT.md: `JWT_REFRESH_SECRET` signs both refresh tokens and
 * invitation tokens. These pin the property that actually matters — the two
 * derived keys share no bytes with each other or with the root secret — not
 * the specific bytes HKDF produces, which is an implementation detail of
 * Node's `crypto` module rather than something this codebase owns.
 */
describe('deriveSubkey', () => {
  it('is deterministic for the same purpose', () => {
    expect(deriveSubkey('refresh-token')).toEqual(deriveSubkey('refresh-token'));
  });

  it('derives a different key per purpose', () => {
    expect(deriveSubkey('refresh-token')).not.toEqual(deriveSubkey('invitation-token'));
  });

  it('never equals the root secret it was derived from', () => {
    const key = deriveSubkey('refresh-token');
    expect(key.toString('utf8')).not.toBe(process.env.JWT_REFRESH_SECRET);
    expect(key.toString('hex')).not.toBe(process.env.JWT_REFRESH_SECRET);
  });

  it('produces a full-length key regardless of the purpose label', () => {
    expect(deriveSubkey('refresh-token')).toHaveLength(32);
    expect(deriveSubkey('invitation-token')).toHaveLength(32);
  });
});
