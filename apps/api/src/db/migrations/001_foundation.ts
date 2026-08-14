import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS "citext"`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS "btree_gist"`.execute(db);

  // Time-ordered UUIDs (RFC 9562 v7). Random v4 keys fragment the B-tree on
  // high-volume tables like transactions; v7 keeps inserts on the right edge
  // while staying a plain uuid column.
  await sql`
    CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
    BEGIN
      RETURN encode(
        set_bit(
          set_bit(
            overlay(
              uuid_send(gen_random_uuid())
              PLACING substring(
                int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
                FROM 3
              )
              FROM 1 FOR 6
            ),
            52, 1
          ),
          53, 1
        ),
        'hex'
      )::uuid;
    END
    $$ LANGUAGE plpgsql VOLATILE
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);

  // --- users ---------------------------------------------------------------
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('email', sql`citext`, (col) => col.notNull())
    .addColumn('password_hash', 'text')
    .addColumn('full_name', 'text', (col) => col.notNull())
    .addColumn('avatar_url', 'text')
    .addColumn('locale', 'text', (col) => col.notNull().defaultTo('pt-BR'))
    .addColumn('timezone', 'text', (col) => col.notNull().defaultTo('America/Sao_Paulo'))
    .addColumn('base_currency', 'char(3)', (col) => col.notNull().defaultTo('BRL'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('email_verified_at', 'timestamptz')
    .addColumn('last_login_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamptz')
    .addCheckConstraint('users_status_check', sql`status IN ('active','suspended','deleted')`)
    .execute();

  // Soft-deleted accounts release their address so the person can sign up again.
  await sql`
    CREATE UNIQUE INDEX users_email_unique ON users (email) WHERE deleted_at IS NULL
  `.execute(db);

  await db.schema
    .createTable('user_identities')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('provider_user_id', 'text', (col) => col.notNull())
    .addColumn('email', sql`citext`)
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('user_identities_provider_check', sql`provider IN ('google','apple','microsoft')`)
    .addUniqueConstraint('user_identities_provider_unique', ['provider', 'provider_user_id'])
    .execute();

  await db.schema.createIndex('user_identities_user_idx').on('user_identities').column('user_id').execute();

  await db.schema
    .createTable('refresh_tokens')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    // All tokens rotated from one login share a family: reuse of a rotated
    // token revokes the whole family (refresh-token replay defence).
    .addColumn('family_id', 'uuid', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('replaced_by_id', 'uuid')
    .addColumn('user_agent', 'text')
    .addColumn('ip_address', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('refresh_tokens_user_idx')
    .on('refresh_tokens')
    .columns(['user_id', 'expires_at'])
    .execute();
  await db.schema.createIndex('refresh_tokens_family_idx').on('refresh_tokens').column('family_id').execute();

  await db.schema
    .createTable('push_devices')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('platform', 'text', (col) => col.notNull())
    .addColumn('token', 'text', (col) => col.notNull().unique())
    .addColumn('last_seen_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('push_devices_platform_check', sql`platform IN ('ios','android','web')`)
    .execute();

  await db.schema.createIndex('push_devices_user_idx').on('push_devices').column('user_id').execute();

  // --- currency ------------------------------------------------------------
  await db.schema
    .createTable('currencies')
    .addColumn('code', 'char(3)', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('symbol', 'text', (col) => col.notNull())
    .addColumn('decimal_digits', 'smallint', (col) => col.notNull().defaultTo(2))
    .execute();

  await db
    .insertInto('currencies')
    .values([
      { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimal_digits: 2 },
      { code: 'USD', name: 'US Dollar', symbol: '$', decimal_digits: 2 },
      { code: 'EUR', name: 'Euro', symbol: '€', decimal_digits: 2 },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimal_digits: 2 },
      { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimal_digits: 2 },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimal_digits: 0 },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimal_digits: 2 },
      { code: 'CAD', name: 'Canadian Dollar', symbol: '$', decimal_digits: 2 },
    ])
    .execute();

  await db.schema
    .createTable('exchange_rates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('base_code', 'char(3)', (col) => col.notNull().references('currencies.code'))
    .addColumn('quote_code', 'char(3)', (col) => col.notNull().references('currencies.code'))
    .addColumn('rate', 'numeric(20, 10)', (col) => col.notNull())
    .addColumn('as_of', 'date', (col) => col.notNull())
    .addColumn('source', 'text', (col) => col.notNull().defaultTo('static'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('exchange_rates_rate_positive', sql`rate > 0`)
    .addUniqueConstraint('exchange_rates_unique', ['base_code', 'quote_code', 'as_of'])
    .execute();

  // Rate lookups always ask for "the newest rate at or before date X".
  await sql`
    CREATE INDEX exchange_rates_lookup_idx
      ON exchange_rates (base_code, quote_code, as_of DESC)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('exchange_rates').ifExists().execute();
  await db.schema.dropTable('currencies').ifExists().execute();
  await db.schema.dropTable('push_devices').ifExists().execute();
  await db.schema.dropTable('refresh_tokens').ifExists().execute();
  await db.schema.dropTable('user_identities').ifExists().execute();
  await db.schema.dropTable('users').ifExists().execute();
  await sql`DROP FUNCTION IF EXISTS set_updated_at()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS uuid_generate_v7()`.execute(db);
}
