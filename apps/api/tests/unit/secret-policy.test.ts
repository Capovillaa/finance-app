import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  checkProductionSecret,
  checkProductionSecrets,
  formatSecretIssues,
  GENERATE_SECRET_COMMAND,
  MIN_PRODUCTION_SECRET_LENGTH,
} from '../../src/config/secret-policy.js';

/**
 * The rule that keeps a public placeholder from signing a real access token,
 * tested without an environment to stub — `secret-policy.ts` imports nothing for
 * exactly that reason. What matters here is both halves: that a published or
 * padded value is refused, and that a genuinely generated one is not, because a
 * check with a false positive is a check somebody deletes.
 */

const generated = () => randomBytes(48).toString('base64url');

const messagesFor = (value: string) =>
  checkProductionSecret('JWT_ACCESS_SECRET', value).map((issue) => issue.message);

describe('checkProductionSecret', () => {
  it('accepts what the documented generator produces, over and over', () => {
    // The patterns below run against values that are legitimately random, so
    // this is the half that matters most: a check with a false positive is a
    // check somebody turns off at the worst possible moment.
    for (let i = 0; i < 200; i += 1) {
      expect(checkProductionSecret('JWT_ACCESS_SECRET', generated())).toEqual([]);
    }
  });

  it('accepts 32 bytes of hex, the other shape people reach for', () => {
    expect(checkProductionSecret('JWT_ACCESS_SECRET', randomBytes(32).toString('hex'))).toEqual([]);
  });

  it('refuses every secret this repository has ever published', () => {
    // These are the exact bytes in .env.example, the CI workflow and the OpenAPI
    // generator. Anyone can read them, so they can never sign anything real.
    const published = [
      'dev-access-secret-change-me-0000000000000000',
      'dev-refresh-secret-change-me-000000000000',
      'dev-only-insecure-access-secret-change-me',
      'dev-only-insecure-refresh-secret-change-me',
      'ci-access-secret-not-a-real-key-000000',
      'ci-refresh-secret-not-a-real-key-00000',
      'openapi-generation-placeholder-secret',
    ];

    for (const secret of published) {
      expect(messagesFor(secret).join(' ')).toMatch(/published|placeholder/);
    }
  });

  it('refuses a published value whatever the casing or surrounding whitespace', () => {
    expect(messagesFor('  DEV-ACCESS-SECRET-CHANGE-ME-0000000000000000  ')).toContain(
      'is one of the placeholder values published in this repository, so it is public knowledge',
    );
  });

  it('refuses a long value that is still obviously a placeholder', () => {
    for (const secret of [
      'please-change-me-before-deploying-anywhere-real',
      'insert-your-production-secret-here-000000000',
      'TODO-generate-a-proper-secret-for-production',
      'this-is-not-a-real-key-just-something-long',
    ]) {
      expect(messagesFor(secret)).toContain('looks like a placeholder rather than a generated secret');
    }
  });

  it('refuses a value that is long enough and empty of entropy', () => {
    const padded = `${'a'.repeat(80)}`;
    expect(messagesFor(padded).join(' ')).toMatch(/distinct characters/);
  });

  it('refuses a short value even when it is random', () => {
    const short = randomBytes(12).toString('base64url').slice(0, 20);
    expect(messagesFor(short).join(' ')).toMatch(
      new RegExp(`at least ${MIN_PRODUCTION_SECRET_LENGTH} characters`),
    );
  });

  it('names the variable it was given and never the value', () => {
    const secret = 'change-me-change-me-change-me-change-me';
    const issues = checkProductionSecret('JWT_REFRESH_SECRET', secret);

    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.variable).toBe('JWT_REFRESH_SECRET');
      expect(issue.message).not.toContain(secret);
    }
  });
});

describe('checkProductionSecrets', () => {
  it('passes a pair of independently generated secrets', () => {
    expect(
      checkProductionSecrets({
        JWT_ACCESS_SECRET: generated(),
        JWT_REFRESH_SECRET: generated(),
      }),
    ).toEqual([]);
  });

  it('refuses one secret used for both roles', () => {
    const shared = generated();

    expect(
      checkProductionSecrets({ JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }),
    ).toEqual([
      {
        variable: 'JWT_ACCESS_SECRET',
        message: 'must not be the same value as JWT_REFRESH_SECRET',
      },
    ]);
  });

  it('reports every failing variable, not just the first', () => {
    const issues = checkProductionSecrets({
      JWT_ACCESS_SECRET: 'dev-access-secret-change-me-0000000000000000',
      JWT_REFRESH_SECRET: 'short',
    });

    expect(new Set(issues.map((issue) => issue.variable))).toEqual(
      new Set(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']),
    );
  });
});

describe('formatSecretIssues', () => {
  it('tells the operator what to run, without echoing anything secret', () => {
    const secret = 'ci-access-secret-not-a-real-key-000000';
    const message = formatSecretIssues(checkProductionSecrets({ JWT_ACCESS_SECRET: secret }));

    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).toContain(GENERATE_SECRET_COMMAND);
    expect(message).not.toContain(secret);
  });
});
