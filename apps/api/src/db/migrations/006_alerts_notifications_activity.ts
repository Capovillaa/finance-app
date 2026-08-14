import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('alert_rules')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('is_enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    // Per-type knobs (threshold amount, deviation sigma, lookback months, ...).
    .addColumn('config', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('channels', sql`text[]`, (col) => col.notNull().defaultTo(sql`ARRAY['in_app']::text[]`))
    .addColumn('scope_category_id', 'uuid', (col) => col.references('categories.id').onDelete('cascade'))
    .addColumn('scope_account_id', 'uuid', (col) => col.references('accounts.id').onDelete('cascade'))
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'alert_rules_type_check',
      sql`type IN ('budget_threshold','budget_exceeded','large_transaction','unusual_spending',
                   'duplicate_transaction','bill_due','goal_milestone','low_balance')`,
    )
    .addCheckConstraint(
      'alert_rules_channels_check',
      sql`channels <@ ARRAY['in_app','email','push']::text[] AND array_length(channels, 1) >= 1`,
    )
    .execute();

  // One rule per type per scope keeps evaluation deterministic.
  await sql`
    CREATE UNIQUE INDEX alert_rules_scope_unique
      ON alert_rules (
        workspace_id,
        type,
        COALESCE(scope_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(scope_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
  `.execute(db);

  await db.schema
    .createTable('notifications')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) => col.references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('severity', 'text', (col) => col.notNull().defaultTo('info'))
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('message', 'text', (col) => col.notNull())
    .addColumn('data', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('dedupe_key', 'text')
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('notifications_severity_check', sql`severity IN ('info','warning','critical')`)
    .execute();

  // Alert scans are periodic and idempotent: the same finding must not create a
  // second notification for the same user.
  await sql`
    CREATE UNIQUE INDEX notifications_dedupe_unique
      ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX notifications_inbox_idx
      ON notifications (user_id, created_at DESC)
  `.execute(db);
  await sql`
    CREATE INDEX notifications_unread_idx
      ON notifications (user_id, created_at DESC) WHERE read_at IS NULL
  `.execute(db);

  await db.schema
    .createTable('notification_deliveries')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('notification_id', 'uuid', (col) =>
      col.notNull().references('notifications.id').onDelete('cascade'),
    )
    .addColumn('channel', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('error', 'text')
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_attempt_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('notification_deliveries_channel_check', sql`channel IN ('in_app','email','push')`)
    .addCheckConstraint(
      'notification_deliveries_status_check',
      sql`status IN ('pending','sent','failed','skipped')`,
    )
    .addUniqueConstraint('notification_deliveries_unique', ['notification_id', 'channel'])
    .execute();

  // Activity feed and audit log share one append-only table; `is_audit_only`
  // hides infrastructure noise (logins, token refreshes) from the team feed.
  await db.schema
    .createTable('activity_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v7()`))
    .addColumn('workspace_id', 'uuid', (col) => col.references('workspaces.id').onDelete('cascade'))
    .addColumn('actor_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('entity_type', 'text', (col) => col.notNull())
    .addColumn('entity_id', 'uuid')
    .addColumn('summary', 'text', (col) => col.notNull())
    .addColumn('changes', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('is_audit_only', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('ip_address', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE INDEX activity_events_feed_idx
      ON activity_events (workspace_id, created_at DESC) WHERE is_audit_only = false
  `.execute(db);
  await sql`
    CREATE INDEX activity_events_entity_idx
      ON activity_events (entity_type, entity_id, created_at DESC)
  `.execute(db);
  await sql`
    CREATE INDEX activity_events_actor_idx
      ON activity_events (actor_user_id, created_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('activity_events').ifExists().execute();
  await db.schema.dropTable('notification_deliveries').ifExists().execute();
  await db.schema.dropTable('notifications').ifExists().execute();
  await db.schema.dropTable('alert_rules').ifExists().execute();
}
