import { describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { createPool } from '../../src/db/client.js';

/**
 * M-4 in AUDIT_REPORT.md: without a `statement_timeout` and an
 * `idle_in_transaction_session_timeout`, a runaway or forgotten-in-a-
 * transaction query holds its connection — and, once the pool is exhausted,
 * everyone else's request — forever. `pg` sends both as Postgres session
 * parameters at connection time, so this only has to prove the pool is built
 * with them; it does not need a real connection (the pool is lazy — nothing
 * is dialled until a query runs) or a database to point at.
 */
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
