/**
 * M-4 in AUDIT_REPORT.md: without a `statement_timeout` and an
 * `idle_in_transaction_session_timeout`, a runaway or forgotten-in-a-
 * transaction query holds its connection — and, once the pool is exhausted,
 * everyone else's request — forever. `pg` sends both as Postgres session
 * parameters at connection time, so this only has to prove the pool is built
 * with them; it does not need a real connection (the pool is lazy — nothing
 * is dialled until a query runs) or a database to point at.
 *
 * `db/client.ts` imports `config/env.ts`, which parses the environment at
 * import time and refuses to load without these — CI's `check` job runs unit
 * tests with no Postgres and no secrets to point at, so they are stubbed here
 * the same way `tests/unit/openapi.test.ts` stubs them for the same reason.
 * `await import` rather than a static import, because a static one is
 * hoisted above the assignments below and this file would only pass on a
 * machine that happens to have a `.env`.
 */
process.env.DATABASE_URL ??= 'postgres://db-client-test:db-client-test@localhost:5432/db_client_test_not_connected';
process.env.JWT_ACCESS_SECRET ??= 'db-client-test-placeholder-secret';
process.env.JWT_REFRESH_SECRET ??= 'db-client-test-placeholder-secret';
process.env.EMAIL_TOKEN_SECRET ??= 'db-client-test-placeholder-secret';

import { describe, expect, it } from 'vitest';

const { env } = await import('../../src/config/env.js');
const { createPool } = await import('../../src/db/client.js');

describe('createPool', () => {
  it('carries the configured statement and idle-in-transaction timeouts', async () => {
    const pool = createPool('postgres://unit-test:unit-test@127.0.0.1:1/unit-test');
    try {
      expect(pool.options.statement_timeout).toBe(env.DATABASE_STATEMENT_TIMEOUT_MS);
      expect(pool.options.idle_in_transaction_session_timeout).toBe(
        env.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
      );
    } finally {
      await pool.end();
    }
  });
});
