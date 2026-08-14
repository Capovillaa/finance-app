import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('workspaces')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull().defaultTo('personal'))
    .addColumn('owner_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('base_currency', 'char(3)', (col) => col.notNull().defaultTo('BRL').references('currencies.code'))
    .addColumn('timezone', 'text', (col) => col.notNull().defaultTo('America/Sao_Paulo'))
    .addColumn('settings', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('archived_at', 'timestamptz')
    .addCheckConstraint('workspaces_type_check', sql`type IN ('personal','shared')`)
    .addCheckConstraint('workspaces_name_not_blank', sql`length(btrim(name)) > 0`)
    .execute();

  await db.schema.createIndex('workspaces_owner_idx').on('workspaces').column('owner_id').execute();

  await db.schema
    .createTable('workspace_members')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('invited_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('joined_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('workspace_members_role_check', sql`role IN ('owner','admin','editor','viewer')`)
    .addUniqueConstraint('workspace_members_unique', ['workspace_id', 'user_id'])
    .execute();

  await db.schema.createIndex('workspace_members_user_idx').on('workspace_members').column('user_id').execute();

  // Exactly one owner per workspace, enforced by the database rather than by
  // application code that could race two concurrent ownership transfers.
  await sql`
    CREATE UNIQUE INDEX workspace_members_single_owner_idx
      ON workspace_members (workspace_id) WHERE role = 'owner'
  `.execute(db);

  await db.schema
    .createTable('workspace_invitations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('email', sql`citext`, (col) => col.notNull())
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('invited_by', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('accepted_at', 'timestamptz')
    .addColumn('accepted_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('workspace_invitations_role_check', sql`role IN ('admin','editor','viewer')`)
    .addCheckConstraint(
      'workspace_invitations_status_check',
      sql`status IN ('pending','accepted','revoked','expired')`,
    )
    .execute();

  // One live invitation per address per workspace; resending revokes the old one.
  await sql`
    CREATE UNIQUE INDEX workspace_invitations_pending_unique
      ON workspace_invitations (workspace_id, email) WHERE status = 'pending'
  `.execute(db);

  await db.schema
    .createIndex('workspace_invitations_email_idx')
    .on('workspace_invitations')
    .columns(['email', 'status'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('workspace_invitations').ifExists().execute();
  await db.schema.dropTable('workspace_members').ifExists().execute();
  await db.schema.dropTable('workspaces').ifExists().execute();
}
