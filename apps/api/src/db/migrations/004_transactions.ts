import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('transactions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id').onDelete('restrict'))
    .addColumn('category_id', 'uuid', (col) => col.references('categories.id').onDelete('set null'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('cleared'))
    // Signed amount: negative is money leaving the account. Storing the sign
    // makes every aggregation a plain SUM instead of a CASE over `type`.
    .addColumn('amount', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('currency', 'char(3)', (col) => col.notNull().references('currencies.code'))
    .addColumn('base_amount', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('exchange_rate', 'numeric(20, 10)', (col) => col.notNull().defaultTo('1'))
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('merchant', 'text')
    .addColumn('notes', 'text')
    .addColumn('occurred_on', 'date', (col) => col.notNull())
    .addColumn('transfer_group_id', 'uuid')
    .addColumn('counter_account_id', 'uuid', (col) => col.references('accounts.id').onDelete('set null'))
    .addColumn('recurring_transaction_id', 'uuid')
    .addColumn('reconciliation_id', 'uuid', (col) =>
      col.references('account_reconciliations.id').onDelete('set null'),
    )
    .addColumn('is_reconciled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('external_id', 'text')
    .addColumn('paid_by_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamptz')
    .addCheckConstraint('transactions_type_check', sql`type IN ('income','expense','transfer')`)
    .addCheckConstraint('transactions_status_check', sql`status IN ('cleared','pending','scheduled','void')`)
    .addCheckConstraint('transactions_amount_nonzero', sql`amount <> 0`)
    // The sign and the type must agree, so a mislabelled row cannot corrupt
    // income/expense reporting.
    .addCheckConstraint(
      'transactions_sign_matches_type',
      sql`(type = 'income' AND amount > 0)
       OR (type = 'expense' AND amount < 0)
       OR (type = 'transfer')`,
    )
    .addCheckConstraint('transactions_base_sign', sql`sign(base_amount) = sign(amount)`)
    .addCheckConstraint('transactions_rate_positive', sql`exchange_rate > 0`)
    .addCheckConstraint('transactions_description_not_blank', sql`length(btrim(description)) > 0`)
    // A transfer leg always names the account on the other side.
    .addCheckConstraint(
      'transactions_transfer_shape',
      sql`(type <> 'transfer') OR (transfer_group_id IS NOT NULL AND counter_account_id IS NOT NULL)`,
    )
    .execute();

  // Full-text search over the free-text fields, kept in sync by Postgres.
  await sql`
    ALTER TABLE transactions
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector(
          'simple',
          coalesce(description, '') || ' ' || coalesce(merchant, '') || ' ' || coalesce(notes, '')
        )
      ) STORED
  `.execute(db);

  // The dominant access pattern: one workspace's ledger, newest first.
  await sql`
    CREATE INDEX transactions_workspace_date_idx
      ON transactions (workspace_id, occurred_on DESC, id DESC)
      WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX transactions_account_date_idx
      ON transactions (account_id, occurred_on DESC)
      WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX transactions_category_date_idx
      ON transactions (workspace_id, category_id, occurred_on DESC)
      WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX transactions_search_idx ON transactions USING gin (search_vector)
  `.execute(db);
  await sql`
    CREATE INDEX transactions_description_trgm_idx
      ON transactions USING gin (description gin_trgm_ops)
  `.execute(db);
  await sql`
    CREATE INDEX transactions_transfer_group_idx
      ON transactions (transfer_group_id) WHERE transfer_group_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX transactions_recurring_idx
      ON transactions (recurring_transaction_id) WHERE recurring_transaction_id IS NOT NULL
  `.execute(db);
  // Imports must be idempotent per workspace.
  await sql`
    CREATE UNIQUE INDEX transactions_external_id_unique
      ON transactions (workspace_id, external_id) WHERE external_id IS NOT NULL
  `.execute(db);
  // Duplicate detection scans "same account, same day, same amount".
  await sql`
    CREATE INDEX transactions_duplicate_scan_idx
      ON transactions (workspace_id, account_id, occurred_on, amount)
      WHERE deleted_at IS NULL
  `.execute(db);

  // --- account balance maintenance ----------------------------------------
  // Recomputing SUM(amount) per account on every read does not survive
  // millions of rows, so the balance is maintained transactionally instead.
  await sql`
    CREATE OR REPLACE FUNCTION transactions_apply_balance() RETURNS trigger AS $$
    DECLARE
      old_delta numeric(19,4) := 0;
      new_delta numeric(19,4) := 0;
    BEGIN
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.status = 'cleared' AND OLD.deleted_at IS NULL THEN
          old_delta := OLD.amount;
        END IF;
      END IF;

      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.status = 'cleared' AND NEW.deleted_at IS NULL THEN
          new_delta := NEW.amount;
        END IF;
      END IF;

      IF TG_OP = 'UPDATE' AND OLD.account_id <> NEW.account_id THEN
        IF old_delta <> 0 THEN
          UPDATE accounts SET current_balance = current_balance - old_delta WHERE id = OLD.account_id;
        END IF;
        IF new_delta <> 0 THEN
          UPDATE accounts SET current_balance = current_balance + new_delta WHERE id = NEW.account_id;
        END IF;
        RETURN NULL;
      END IF;

      IF new_delta - old_delta <> 0 THEN
        UPDATE accounts
          SET current_balance = current_balance + (new_delta - old_delta)
          WHERE id = COALESCE(NEW.account_id, OLD.account_id);
      END IF;

      RETURN NULL;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER transactions_balance_trg
      AFTER INSERT OR UPDATE OF amount, status, deleted_at, account_id OR DELETE ON transactions
      FOR EACH ROW EXECUTE FUNCTION transactions_apply_balance()
  `.execute(db);

  // Opening balance edits must move the running balance with them.
  await sql`
    CREATE OR REPLACE FUNCTION accounts_apply_initial_balance() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        NEW.current_balance := NEW.initial_balance;
      ELSIF NEW.initial_balance <> OLD.initial_balance THEN
        NEW.current_balance := NEW.current_balance + (NEW.initial_balance - OLD.initial_balance);
      END IF;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER accounts_initial_balance_trg
      BEFORE INSERT OR UPDATE OF initial_balance ON accounts
      FOR EACH ROW EXECUTE FUNCTION accounts_apply_initial_balance()
  `.execute(db);

  // --- splits, comments, tags ---------------------------------------------
  await db.schema
    .createTable('transaction_splits')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('transaction_id', 'uuid', (col) =>
      col.notNull().references('transactions.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('share_amount', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('share_percent', 'numeric(7, 4)')
    .addColumn('settled_at', 'timestamptz')
    .addColumn('note', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('transaction_splits_percent_check', sql`share_percent IS NULL OR share_percent > 0`)
    .addUniqueConstraint('transaction_splits_unique', ['transaction_id', 'user_id'])
    .execute();

  await db.schema
    .createIndex('transaction_splits_user_idx')
    .on('transaction_splits')
    .columns(['workspace_id', 'user_id'])
    .execute();

  await db.schema
    .createTable('transaction_comments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('transaction_id', 'uuid', (col) =>
      col.notNull().references('transactions.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamptz')
    .addCheckConstraint('transaction_comments_body_not_blank', sql`length(btrim(body)) > 0`)
    .execute();

  await db.schema
    .createIndex('transaction_comments_transaction_idx')
    .on('transaction_comments')
    .columns(['transaction_id', 'created_at'])
    .execute();

  await db.schema
    .createTable('transaction_tags')
    .addColumn('transaction_id', 'uuid', (col) =>
      col.notNull().references('transactions.id').onDelete('cascade'),
    )
    .addColumn('tag_id', 'uuid', (col) => col.notNull().references('tags.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('transaction_tags_pkey', ['transaction_id', 'tag_id'])
    .execute();

  await db.schema.createIndex('transaction_tags_tag_idx').on('transaction_tags').column('tag_id').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('transaction_tags').ifExists().execute();
  await db.schema.dropTable('transaction_comments').ifExists().execute();
  await db.schema.dropTable('transaction_splits').ifExists().execute();
  await sql`DROP TRIGGER IF EXISTS accounts_initial_balance_trg ON accounts`.execute(db);
  await sql`DROP FUNCTION IF EXISTS accounts_apply_initial_balance()`.execute(db);
  await sql`DROP TRIGGER IF EXISTS transactions_balance_trg ON transactions`.execute(db);
  await sql`DROP FUNCTION IF EXISTS transactions_apply_balance()`.execute(db);
  await db.schema.dropTable('transactions').ifExists().execute();
}
