import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import { env } from '../config/env.js';
import type { Database } from './types.js';

const { Pool, types } = pg;

// --- node-postgres type parsing -------------------------------------------
// DATE (1082): keep the wire format `YYYY-MM-DD`. The default parser builds a
// JS Date at local midnight, which silently shifts a transaction into the
// previous day for anyone west of UTC.
types.setTypeParser(1082, (value: string) => value);
// INT8 (20): counts and sums of rows, never money. Safe below 2^53.
types.setTypeParser(20, (value: string) => Number(value));
// NUMERIC (1700) intentionally keeps the default string parser: money must not
// pass through IEEE-754 floats.

export function createPool(connectionString = env.DATABASE_URL): pg.Pool {
  return new Pool({
    connectionString,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: `finance-api-${env.NODE_ENV}`,
  });
}

export function createDb(pool: pg.Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    log: env.LOG_LEVEL === 'trace' ? ['query', 'error'] : ['error'],
  });
}

export const pool = createPool();
export const db = createDb(pool);

export type DB = Kysely<Database>;
/** Accepts either the root connection or an open transaction. */
export type Executor = DB | Transaction<Database>;

export async function pingDatabase(): Promise<void> {
  await sql`select 1`.execute(db);
}

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
