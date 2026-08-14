import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // --- accounts ------------------------------------------------------------
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('currency', 'char(3)', (col) => col.notNull().references('currencies.code'))
    .addColumn('institution', 'text')
    .addColumn('initial_balance', 'numeric(19, 4)', (col) => col.notNull().defaultTo('0'))
    .addColumn('current_balance', 'numeric(19, 4)', (col) => col.notNull().defaultTo('0'))
    .addColumn('credit_limit', 'numeric(19, 4)')
    .addColumn('statement_day', 'smallint')
    .addColumn('due_day', 'smallint')
    .addColumn('color', 'text')
    .addColumn('icon', 'text')
    .addColumn('is_archived', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'accounts_type_check',
      sql`type IN ('checking','savings','credit_card','investment','cash','loan')`,
    )
    .addCheckConstraint('accounts_name_not_blank', sql`length(btrim(name)) > 0`)
    .addCheckConstraint('accounts_statement_day_check', sql`statement_day IS NULL OR statement_day BETWEEN 1 AND 31`)
    .addCheckConstraint('accounts_due_day_check', sql`due_day IS NULL OR due_day BETWEEN 1 AND 31`)
    .addCheckConstraint('accounts_credit_limit_check', sql`credit_limit IS NULL OR credit_limit >= 0`)
    .execute();

  await sql`
    CREATE UNIQUE INDEX accounts_workspace_name_unique
      ON accounts (workspace_id, lower(name))
  `.execute(db);

  await sql`
    CREATE INDEX accounts_workspace_idx
      ON accounts (workspace_id) WHERE is_archived = false
  `.execute(db);

  await db.schema
    .createTable('account_reconciliations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('statement_date', 'date', (col) => col.notNull())
    .addColumn('statement_balance', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('computed_balance', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('difference', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('open'))
    .addColumn('notes', 'text')
    .addColumn('reconciled_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('account_reconciliations_status_check', sql`status IN ('open','completed')`)
    .addUniqueConstraint('account_reconciliations_unique', ['account_id', 'statement_date'])
    .execute();

  await db.schema
    .createIndex('account_reconciliations_account_idx')
    .on('account_reconciliations')
    .columns(['account_id', 'statement_date'])
    .execute();

  // --- categories ----------------------------------------------------------
  await db.schema
    .createTable('categories')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('parent_id', 'uuid', (col) => col.references('categories.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('kind', 'text', (col) => col.notNull().defaultTo('expense'))
    .addColumn('depth', 'smallint', (col) => col.notNull().defaultTo(0))
    .addColumn('color', 'text')
    .addColumn('icon', 'text')
    .addColumn('is_system', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('is_archived', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('categories_kind_check', sql`kind IN ('income','expense','transfer')`)
    // Three levels: Food > Groceries > Supermarket.
    .addCheckConstraint('categories_depth_check', sql`depth BETWEEN 0 AND 2`)
    .addCheckConstraint('categories_root_depth_check', sql`(parent_id IS NULL) = (depth = 0)`)
    .addCheckConstraint('categories_name_not_blank', sql`length(btrim(name)) > 0`)
    .execute();

  // Sibling names must be unique. Two partial indexes because NULL parent_id
  // would otherwise defeat a single unique constraint.
  await sql`
    CREATE UNIQUE INDEX categories_root_name_unique
      ON categories (workspace_id, lower(name)) WHERE parent_id IS NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX categories_child_name_unique
      ON categories (parent_id, lower(name)) WHERE parent_id IS NOT NULL
  `.execute(db);

  await db.schema.createIndex('categories_workspace_idx').on('categories').column('workspace_id').execute();
  await db.schema.createIndex('categories_parent_idx').on('categories').column('parent_id').execute();

  // depth must equal parent.depth + 1, and a child cannot live in another
  // workspace than its parent. Both are cheap to get wrong from application code.
  await sql`
    CREATE OR REPLACE FUNCTION categories_enforce_hierarchy() RETURNS trigger AS $$
    DECLARE
      parent_depth smallint;
      parent_workspace uuid;
    BEGIN
      IF NEW.parent_id IS NULL THEN
        NEW.depth := 0;
        RETURN NEW;
      END IF;

      IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'category cannot be its own parent';
      END IF;

      SELECT depth, workspace_id INTO parent_depth, parent_workspace
      FROM categories WHERE id = NEW.parent_id;

      IF parent_depth IS NULL THEN
        RAISE EXCEPTION 'parent category % not found', NEW.parent_id;
      END IF;

      IF parent_workspace <> NEW.workspace_id THEN
        RAISE EXCEPTION 'parent category belongs to a different workspace';
      END IF;

      IF parent_depth >= 2 THEN
        RAISE EXCEPTION 'category hierarchy is limited to three levels';
      END IF;

      NEW.depth := parent_depth + 1;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER categories_hierarchy_trg
      BEFORE INSERT OR UPDATE OF parent_id ON categories
      FOR EACH ROW EXECUTE FUNCTION categories_enforce_hierarchy()
  `.execute(db);

  // --- tags ----------------------------------------------------------------
  await db.schema
    .createTable('tags')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('color', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('tags_name_not_blank', sql`length(btrim(name)) > 0`)
    .execute();

  await sql`
    CREATE UNIQUE INDEX tags_workspace_name_unique ON tags (workspace_id, lower(name))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('tags').ifExists().execute();
  await sql`DROP TRIGGER IF EXISTS categories_hierarchy_trg ON categories`.execute(db);
  await sql`DROP FUNCTION IF EXISTS categories_enforce_hierarchy()`.execute(db);
  await db.schema.dropTable('categories').ifExists().execute();
  await db.schema.dropTable('account_reconciliations').ifExists().execute();
  await db.schema.dropTable('accounts').ifExists().execute();
}
