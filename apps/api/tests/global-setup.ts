process.env.NODE_ENV = 'test';

import pg from 'pg';

/**
 * Creates the test database if it does not exist yet, then applies every
 * migration. Runs once for the whole suite; individual test files only truncate.
 */
export default async function setup(): Promise<void> {
  const { env } = await import('../src/config/env.js');
  const testUrl = env.DATABASE_URL;

  const target = new URL(testUrl);
  const databaseName = target.pathname.replace(/^\//, '');

  if (!databaseName.includes('test')) {
    throw new Error(
      `Refusing to run tests against "${databaseName}": the test database name must contain "test". ` +
        'Set TEST_DATABASE_URL in your .env.',
    );
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const quoted = `"${databaseName.replace(/"/g, '""')}"`;
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (exists.rowCount === 0) {
      // Identifier cannot be parameterised; the name is validated above.
      await admin.query(`CREATE DATABASE ${quoted}`);
    }
    // Test data is disposable, so there is nothing to protect by waiting on
    // fsync at every commit. This is the single biggest win for suite runtime.
    await admin.query(`ALTER DATABASE ${quoted} SET synchronous_commit = off`);
  } finally {
    await admin.end();
  }

  const { migrateDatabaseUrl } = await import('../src/db/migrate.js');
  await migrateDatabaseUrl(testUrl);
}
