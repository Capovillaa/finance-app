process.env.NODE_ENV = 'test';

import { afterAll, beforeEach } from 'vitest';
import { sql } from 'kysely';
import { closeDatabase, db } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { sentInTests } from '../src/lib/email.js';

/**
 * Tables wiped between tests, ordered children before parents so the deletes
 * satisfy foreign keys without needing CASCADE.
 *
 * `currencies` is deliberately absent: it is reference data inserted by the
 * migrations, and the rest of the schema has foreign keys into it.
 */
const TABLES = [
  'activity_events',
  'notification_deliveries',
  'notifications',
  'alert_rules',
  'goal_contributions',
  'financial_goals',
  'budget_revisions',
  'budget_lines',
  'budgets',
  'transaction_tags',
  'transaction_comments',
  'transaction_splits',
  'transactions',
  'import_batches',
  'recurring_transactions',
  'account_reconciliations',
  'accounts',
  'tags',
  'categories',
  'workspace_invitations',
  'workspace_members',
  'workspaces',
  'push_devices',
  'refresh_tokens',
  'user_identities',
  'users',
  'exchange_rates',
];

/**
 * DELETE rather than TRUNCATE. TRUNCATE rewrites each relation's file and forces
 * an immediate fsync per table; across ~26 tables before every test that
 * dominated the suite's runtime on Docker Desktop. These tables hold a handful
 * of rows each, so DELETE is far cheaper — and running them in one transaction
 * means one commit instead of twenty-six.
 *
 * Wrapped in a DO block because the driver uses the extended query protocol,
 * which rejects multi-statement strings; the block is one statement and one
 * implicit transaction.
 */
const RESET_SQL = `DO $$ BEGIN
${TABLES.map((table) => `  DELETE FROM ${table};`).join('\n')}
END $$;`;

beforeEach(async () => {
  await sql.raw(RESET_SQL).execute(db);
  sentInTests.length = 0;
});

afterAll(async () => {
  await closeDatabase();
  await closeRedis();
});
