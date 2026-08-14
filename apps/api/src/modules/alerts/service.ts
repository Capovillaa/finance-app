import { db } from '../../db/client.js';
import type { AlertRuleType, NotificationChannel } from '../../db/types.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { recordActivity } from '../activity/service.js';
import { DEFAULT_ALERT_RULES } from './defaults.js';

export interface AlertRuleRecord {
  id: string;
  type: AlertRuleType;
  isEnabled: boolean;
  config: Record<string, unknown>;
  channels: NotificationChannel[];
  scopeCategoryId: string | null;
  scopeAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listAlertRules(workspaceId: string): Promise<AlertRuleRecord[]> {
  const rows = await db
    .selectFrom('alert_rules')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .orderBy('type', 'asc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    isEnabled: row.is_enabled,
    config: (row.config ?? {}) as Record<string, unknown>,
    channels: row.channels,
    scopeCategoryId: row.scope_category_id,
    scopeAccountId: row.scope_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export interface UpsertAlertRuleInput {
  workspaceId: string;
  type: AlertRuleType;
  isEnabled?: boolean;
  config?: Record<string, unknown>;
  channels?: NotificationChannel[];
  scopeCategoryId?: string | null;
  scopeAccountId?: string | null;
  actorId: string;
}

export async function upsertAlertRule(input: UpsertAlertRuleInput): Promise<AlertRuleRecord> {
  if (input.scopeCategoryId) {
    const category = await db
      .selectFrom('categories')
      .select('id')
      .where('workspace_id', '=', input.workspaceId)
      .where('id', '=', input.scopeCategoryId)
      .executeTakeFirst();
    if (!category) throw unprocessable('alertRules.scopeCategoryInvalid');
  }
  if (input.scopeAccountId) {
    const account = await db
      .selectFrom('accounts')
      .select('id')
      .where('workspace_id', '=', input.workspaceId)
      .where('id', '=', input.scopeAccountId)
      .executeTakeFirst();
    if (!account) throw unprocessable('alertRules.scopeAccountInvalid');
  }

  const fallback = DEFAULT_ALERT_RULES.find((rule) => rule.type === input.type);

  const values = {
    is_enabled: input.isEnabled ?? true,
    config: JSON.stringify(input.config ?? fallback?.config ?? {}),
    channels: input.channels ?? fallback?.channels ?? ['in_app'],
  };

  /**
   * Matched explicitly rather than with `ON CONFLICT DO UPDATE`: the uniqueness
   * rule is an expression index over `COALESCE(scope_*, <sentinel>)`, which
   * Postgres cannot infer a conflict target from. The transaction plus that
   * index still make the operation safe under concurrency.
   */
  const row = await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('alert_rules')
      .select('id')
      .where('workspace_id', '=', input.workspaceId)
      .where('type', '=', input.type)
      .where((eb) =>
        eb.and([
          eb('scope_category_id', 'is', input.scopeCategoryId ?? null),
          eb('scope_account_id', 'is', input.scopeAccountId ?? null),
        ]),
      )
      .forUpdate()
      .executeTakeFirst();

    if (existing) {
      return trx
        .updateTable('alert_rules')
        .set(values)
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    return trx
      .insertInto('alert_rules')
      .values({
        workspace_id: input.workspaceId,
        type: input.type,
        scope_category_id: input.scopeCategoryId ?? null,
        scope_account_id: input.scopeAccountId ?? null,
        created_by: input.actorId,
        ...values,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.actorId,
    action: 'alert_rule.upserted',
    entityType: 'alert_rule',
    entityId: row.id,
    summary: `Configured the ${input.type} alert`,
    changes: { config: input.config, channels: input.channels, isEnabled: input.isEnabled },
  });

  return {
    id: row.id,
    type: row.type,
    isEnabled: row.is_enabled,
    config: (row.config ?? {}) as Record<string, unknown>,
    channels: row.channels,
    scopeCategoryId: row.scope_category_id,
    scopeAccountId: row.scope_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteAlertRule(workspaceId: string, ruleId: string): Promise<void> {
  const result = await db
    .deleteFrom('alert_rules')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', ruleId)
    .executeTakeFirst();
  if (Number(result.numDeletedRows ?? 0) === 0) throw notFound('resources.alertRule');
}
