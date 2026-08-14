import { sql, type Kysely } from 'kysely';

/**
 * Attaches the shared `set_updated_at()` trigger to every table that carries an
 * `updated_at` column, so no module has to remember to touch it by hand.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$
    DECLARE
      t record;
    BEGIN
      FOR t IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables tb
          ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
        WHERE c.table_schema = current_schema()
          AND c.column_name = 'updated_at'
          AND tb.table_type = 'BASE TABLE'
      LOOP
        EXECUTE format(
          'DROP TRIGGER IF EXISTS %I ON %I', t.table_name || '_set_updated_at', t.table_name
        );
        EXECUTE format(
          'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
          t.table_name || '_set_updated_at', t.table_name
        );
      END LOOP;
    END
    $$
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$
    DECLARE
      t record;
    BEGIN
      FOR t IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema() AND c.column_name = 'updated_at'
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t.table_name || '_set_updated_at', t.table_name);
      END LOOP;
    END
    $$
  `.execute(db);
}
