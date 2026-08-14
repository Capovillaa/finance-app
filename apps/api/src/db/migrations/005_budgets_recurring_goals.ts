import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // --- recurring transactions ---------------------------------------------
  await db.schema
    .createTable('recurring_transactions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('category_id', 'uuid', (col) => col.references('categories.id').onDelete('set null'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('amount', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('currency', 'char(3)', (col) => col.notNull().references('currencies.code'))
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('merchant', 'text')
    .addColumn('notes', 'text')
    .addColumn('frequency', 'text', (col) => col.notNull())
    .addColumn('interval_count', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('by_weekday', sql`smallint[]`)
    .addColumn('day_of_month', 'smallint')
    .addColumn('month_of_year', 'smallint')
    .addColumn('start_date', 'date', (col) => col.notNull())
    .addColumn('end_date', 'date')
    .addColumn('occurrence_limit', 'integer')
    .addColumn('occurrences_created', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('next_occurrence_on', 'date')
    .addColumn('last_generated_on', 'date')
    .addColumn('auto_post', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('lead_time_days', 'integer', (col) => col.notNull().defaultTo(3))
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('recurring_type_check', sql`type IN ('income','expense')`)
    .addCheckConstraint(
      'recurring_frequency_check',
      sql`frequency IN ('daily','weekly','monthly','yearly','custom')`,
    )
    .addCheckConstraint('recurring_interval_check', sql`interval_count BETWEEN 1 AND 365`)
    .addCheckConstraint('recurring_amount_nonzero', sql`amount <> 0`)
    .addCheckConstraint(
      'recurring_sign_matches_type',
      sql`(type = 'income' AND amount > 0) OR (type = 'expense' AND amount < 0)`,
    )
    .addCheckConstraint('recurring_day_of_month_check', sql`day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31`)
    .addCheckConstraint(
      'recurring_month_of_year_check',
      sql`month_of_year IS NULL OR month_of_year BETWEEN 1 AND 12`,
    )
    .addCheckConstraint('recurring_end_after_start', sql`end_date IS NULL OR end_date >= start_date`)
    .addCheckConstraint('recurring_lead_time_check', sql`lead_time_days BETWEEN 0 AND 90`)
    .execute();

  // The materialisation job asks "which schedules are due?" across all workspaces.
  await sql`
    CREATE INDEX recurring_due_idx
      ON recurring_transactions (next_occurrence_on)
      WHERE is_active = true
  `.execute(db);
  await db.schema
    .createIndex('recurring_workspace_idx')
    .on('recurring_transactions')
    .column('workspace_id')
    .execute();

  await sql`
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_recurring_fk
      FOREIGN KEY (recurring_transaction_id)
      REFERENCES recurring_transactions (id) ON DELETE SET NULL
  `.execute(db);

  // --- budgets -------------------------------------------------------------
  await db.schema
    .createTable('budgets')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('period', 'text', (col) => col.notNull())
    .addColumn('start_date', 'date', (col) => col.notNull())
    .addColumn('end_date', 'date', (col) => col.notNull())
    .addColumn('currency', 'char(3)', (col) => col.notNull().references('currencies.code'))
    .addColumn('rollover', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('budgets_period_check', sql`period IN ('monthly','quarterly','yearly','custom')`)
    .addCheckConstraint('budgets_range_check', sql`end_date >= start_date`)
    .addCheckConstraint('budgets_name_not_blank', sql`length(btrim(name)) > 0`)
    .execute();

  await db.schema
    .createIndex('budgets_workspace_range_idx')
    .on('budgets')
    .columns(['workspace_id', 'start_date', 'end_date'])
    .execute();

  await db.schema
    .createTable('budget_lines')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('budget_id', 'uuid', (col) => col.notNull().references('budgets.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('category_id', 'uuid', (col) => col.notNull().references('categories.id').onDelete('cascade'))
    .addColumn('limit_amount', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('include_subcategories', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('alert_threshold_percent', 'smallint', (col) => col.notNull().defaultTo(80))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('budget_lines_limit_positive', sql`limit_amount > 0`)
    .addCheckConstraint(
      'budget_lines_threshold_check',
      sql`alert_threshold_percent BETWEEN 1 AND 100`,
    )
    .addUniqueConstraint('budget_lines_unique', ['budget_id', 'category_id'])
    .execute();

  await db.schema
    .createIndex('budget_lines_category_idx')
    .on('budget_lines')
    .columns(['workspace_id', 'category_id'])
    .execute();

  // Audit trail for mid-period rebudgeting.
  await db.schema
    .createTable('budget_revisions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('budget_line_id', 'uuid', (col) =>
      col.notNull().references('budget_lines.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('previous_limit', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('new_limit', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('effective_from', 'date', (col) => col.notNull())
    .addColumn('reason', 'text')
    .addColumn('changed_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('budget_revisions_line_idx')
    .on('budget_revisions')
    .columns(['budget_line_id', 'created_at'])
    .execute();

  // --- goals ---------------------------------------------------------------
  await db.schema
    .createTable('financial_goals')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'text', (col) => col.notNull().defaultTo('other'))
    .addColumn('target_amount', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('current_amount', 'numeric(19, 4)', (col) => col.notNull().defaultTo('0'))
    .addColumn('currency', 'char(3)', (col) => col.notNull().references('currencies.code'))
    .addColumn('target_date', 'date')
    .addColumn('account_id', 'uuid', (col) => col.references('accounts.id').onDelete('set null'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('priority', 'smallint', (col) => col.notNull().defaultTo(3))
    .addColumn('color', 'text')
    .addColumn('achieved_at', 'timestamptz')
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('goals_target_positive', sql`target_amount > 0`)
    .addCheckConstraint('goals_status_check', sql`status IN ('active','achieved','paused','cancelled')`)
    .addCheckConstraint(
      'goals_category_check',
      sql`category IN ('emergency_fund','vacation','car','house','education','retirement','investment','other')`,
    )
    .addCheckConstraint('goals_priority_check', sql`priority BETWEEN 1 AND 5`)
    .addCheckConstraint('goals_name_not_blank', sql`length(btrim(name)) > 0`)
    .execute();

  await db.schema
    .createIndex('financial_goals_workspace_idx')
    .on('financial_goals')
    .columns(['workspace_id', 'status'])
    .execute();

  await db.schema
    .createTable('goal_contributions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('goal_id', 'uuid', (col) => col.notNull().references('financial_goals.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('amount', 'numeric(19, 4)', (col) => col.notNull())
    .addColumn('occurred_on', 'date', (col) => col.notNull())
    .addColumn('transaction_id', 'uuid', (col) => col.references('transactions.id').onDelete('set null'))
    .addColumn('note', 'text')
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('goal_contributions_amount_nonzero', sql`amount <> 0`)
    .execute();

  await db.schema
    .createIndex('goal_contributions_goal_idx')
    .on('goal_contributions')
    .columns(['goal_id', 'occurred_on'])
    .execute();

  // current_amount is a running total kept in step with its contributions so
  // progress reads never have to aggregate.
  await sql`
    CREATE OR REPLACE FUNCTION goal_contributions_apply() RETURNS trigger AS $$
    DECLARE
      delta numeric(19,4) := 0;
      target uuid;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        delta := NEW.amount;
        target := NEW.goal_id;
      ELSIF TG_OP = 'DELETE' THEN
        delta := -OLD.amount;
        target := OLD.goal_id;
      ELSE
        IF OLD.goal_id <> NEW.goal_id THEN
          UPDATE financial_goals SET current_amount = current_amount - OLD.amount WHERE id = OLD.goal_id;
          UPDATE financial_goals SET current_amount = current_amount + NEW.amount WHERE id = NEW.goal_id;
          RETURN NULL;
        END IF;
        delta := NEW.amount - OLD.amount;
        target := NEW.goal_id;
      END IF;

      IF delta <> 0 THEN
        UPDATE financial_goals SET current_amount = current_amount + delta WHERE id = target;
      END IF;
      RETURN NULL;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER goal_contributions_apply_trg
      AFTER INSERT OR UPDATE OF amount, goal_id OR DELETE ON goal_contributions
      FOR EACH ROW EXECUTE FUNCTION goal_contributions_apply()
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS goal_contributions_apply_trg ON goal_contributions`.execute(db);
  await sql`DROP FUNCTION IF EXISTS goal_contributions_apply()`.execute(db);
  await db.schema.dropTable('goal_contributions').ifExists().execute();
  await db.schema.dropTable('financial_goals').ifExists().execute();
  await db.schema.dropTable('budget_revisions').ifExists().execute();
  await db.schema.dropTable('budget_lines').ifExists().execute();
  await db.schema.dropTable('budgets').ifExists().execute();
  await sql`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_recurring_fk`.execute(db);
  await db.schema.dropTable('recurring_transactions').ifExists().execute();
}
