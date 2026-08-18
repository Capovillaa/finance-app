import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  accountKey,
  bearerSubject,
  bearerToken,
  insurancePoints,
  ipKey,
  parseTrustProxy,
  userKey,
} from '../../src/middleware/rate-limit-policy.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * The rate limiter's policy, tested without Redis, Express or an environment.
 * That is the whole reason `rate-limit-policy.ts` imports nothing — the rules
 * below are the part that can be wrong in a way a running system will not
 * obviously show you.
 */

describe('parseTrustProxy', () => {
  it('trusts nothing by default, and for every spelling of off', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('   ')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('FALSE')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
  });

  it('reads a hop count as a number, which is what Express wants', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('passes a named or listed trust setting through untouched', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('10.0.0.0/8, 192.168.0.0/16')).toBe('10.0.0.0/8, 192.168.0.0/16');
  });

  it('accepts an explicit true, since some deployments really do mean it', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });
});

describe('insurancePoints', () => {
  it('divides the budget by the number of instances sharing the store', () => {
    // The failure this exists to prevent: three instances each granting the
    // full 300 while Redis is down means 900 are actually allowed.
    expect(insurancePoints(300, 3)).toBe(100);
    expect(insurancePoints(300, 1)).toBe(300);
  });

  it('never falls below one point, because a limiter that allows nothing is an outage', () => {
    expect(insurancePoints(2, 10)).toBe(1);
    expect(insurancePoints(1, 1)).toBe(1);
  });

  it('treats a nonsensical instance count as one', () => {
    expect(insurancePoints(300, 0)).toBe(300);
    expect(insurancePoints(300, -4)).toBe(300);
  });
});

describe('bearerToken', () => {
  it('reads a bearer token, case-insensitively on the scheme', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc')).toBe('abc');
  });

  it('rejects anything that is not a bearer header', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer    ')).toBeNull();
  });
});

describe('bearerSubject', () => {
  const verify = (token: string): { sub: string } => {
    if (token !== 'good') throw new Error('invalid token');
    return { sub: 'user-1' };
  };

  it('yields the subject of a token that verifies', () => {
    expect(bearerSubject('good', verify)).toBe('user-1');
  });

  it('yields no identity for a token that does not verify', () => {
    // This is the important one. If a forged token produced a bucket, an
    // attacker would mint a fresh budget per request by sending fresh garbage —
    // the exact hole the limiter exists to close. Such a request must fall back
    // to being charged to its address.
    expect(bearerSubject('forged', verify)).toBeNull();
    expect(bearerSubject(null, verify)).toBeNull();
  });
});

describe('credential buckets', () => {
  it('keys an account independently of where the attempt came from', () => {
    // The bug this replaces: a single `ip:email` key meant a new address was a
    // new bucket, so rotating addresses handed the attacker the full budget
    // again for the same account — while the code claimed the opposite.
    expect(accountKey('victim@example.com')).toBe(accountKey('victim@example.com'));
    expect(ipKey('203.0.113.9')).not.toBe(ipKey('198.51.100.4'));
  });

  it('normalises an account the way the login path does, then hashes it', () => {
    // L-4 in AUDIT_REPORT.md: a raw address in the key was one `KEYS
    // account:*` or one rate-limiter log line away from leaking who had
    // attempted to sign in. The key must still be a pure function of the
    // normalised address — same email, same key — or the budget it names
    // stops meaning anything.
    expect(accountKey('  Victim@Example.COM ')).toBe(`account:${hash('victim@example.com')}`);
    expect(accountKey('Victim@Example.COM')).not.toContain('Victim');
  });

  it('has no account bucket when the request carries no usable email', () => {
    // `/auth/change-password` has no email in its body, and a malformed login
    // body must not become a bucket named after an object.
    expect(accountKey(undefined)).toBeNull();
    expect(accountKey('')).toBeNull();
    expect(accountKey('   ')).toBeNull();
    expect(accountKey({ toString: () => 'nope' })).toBeNull();
    expect(accountKey(['a@b.com'])).toBeNull();
  });

  it('keeps the address, user and account namespaces apart', () => {
    // One shared limiter would otherwise let a user id collide with an address.
    expect(ipKey('abc')).not.toBe(userKey('abc'));
    expect(userKey('abc')).not.toBe(accountKey('abc'));
  });

  it('charges an unknown address to one shared bucket rather than to none', () => {
    expect(ipKey(undefined)).toBe('ip:unknown');
    expect(ipKey(null)).toBe('ip:unknown');
    expect(ipKey('  ')).toBe('ip:unknown');
  });
});
