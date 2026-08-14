import { sql, type Kysely } from 'kysely';

/**
 * CSV import, modelled as preview-then-commit.
 *
 * A batch is created by the preview and holds the parsed rows in `preview_rows`
 * while it waits for the user; committing turns those rows into transactions and
 * clears the payload. The preview writes nothing to the ledger, so a file that
 * fails on row 147 leaves no half-import behind — and because the batch row is
 * the preview, the id the user sees before committing is the same id they undo
 * with afterwards.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('import_batches')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('preview'))
    .addColumn('filename', 'text')
    // How the file was read: delimiter, column mapping, date format, sign
    // convention. Kept so the next import of the same bank can be one click.
    .addColumn('mapping', 'jsonb', (col) => col.notNull())
    // Lowercased header row, used to recognise the same bank's export again.
    .addColumn('header_signature', 'text')
    // The preview payload. Cleared on commit: it is scaffolding, not a record,
    // and a committed batch's rows are the transactions themselves.
    .addColumn('preview_rows', 'jsonb')
    .addColumn('row_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('imported_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    // A preview nobody commits is rubbish after a while; `expires_at` is what
    // makes it collectable without a separate bookkeeping table.
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('committed_at', 'timestamptz')
    .addColumn('reverted_at', 'timestamptz')
    .addCheckConstraint(
      'import_batches_status_check',
      sql`status IN ('preview','committed','reverted')`,
    )
    .execute();

  await db.schema
    .createIndex('import_batches_workspace_idx')
    .on('import_batches')
    .columns(['workspace_id', 'created_at'])
    .execute();

  // Mapping recall reads the newest committed batch for an account.
  await sql`
    CREATE INDEX import_batches_account_committed_idx
      ON import_batches (account_id, committed_at DESC)
      WHERE status = 'committed'
  `.execute(db);

  // Expired previews are swept by the maintenance job.
  await sql`
    CREATE INDEX import_batches_expiry_idx
      ON import_batches (expires_at) WHERE status = 'preview'
  `.execute(db);

  await db.schema
    .alterTable('transactions')
    .addColumn('import_batch_id', 'uuid', (col) => col.references('import_batches.id').onDelete('set null'))
    .execute();

  // Undo reads every row of one batch.
  await sql`
    CREATE INDEX transactions_import_batch_idx
      ON transactions (import_batch_id) WHERE import_batch_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS transactions_import_batch_idx`.execute(db);
  await db.schema.alterTable('transactions').dropColumn('import_batch_id').execute();
  await db.schema.dropTable('import_batches').ifExists().execute();
}
