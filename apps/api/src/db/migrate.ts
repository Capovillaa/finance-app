import { Migrator, type Kysely, type MigrationProvider } from 'kysely';
import { createDb, createPool, db as defaultDb } from './client.js';
import { migrations } from './migrations/index.js';
import type { Database } from './types.js';

const provider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({ db, provider });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const { error, results } = await createMigrator(db).migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      console.log(`  ✓ ${result.migrationName}`);
    } else if (result.status === 'Error') {
      console.error(`  ✗ ${result.migrationName}`);
    }
  }

  if (error) throw error instanceof Error ? error : new Error(String(error));
}

/** Applies every migration to an arbitrary database URL (used by the tests). */
export async function migrateDatabaseUrl(url: string): Promise<void> {
  const pool = createPool(url);
  const db = createDb(pool);
  try {
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';
  const migrator = createMigrator(defaultDb);

  switch (command) {
    case 'up': {
      console.log('Running migrations...');
      await migrateToLatest(defaultDb);
      console.log('Database is up to date.');
      break;
    }
    case 'down': {
      const { error, results } = await migrator.migrateDown();
      for (const r of results ?? []) console.log(`  ${r.status === 'Success' ? '✓' : '✗'} ${r.migrationName}`);
      if (error) throw error;
      break;
    }
    case 'status': {
      const applied = await migrator.getMigrations();
      for (const mig of applied) {
        console.log(`  ${mig.executedAt ? '✓ applied ' : '· pending '} ${mig.name}`);
      }
      break;
    }
    default:
      console.error(`Unknown command "${command}". Use: up | down | status`);
      process.exitCode = 1;
  }
}

// Only run the CLI when executed directly, not when imported by tests.
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').includes('db/migrate');
if (invokedDirectly) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await defaultDb.destroy();
    });
}
