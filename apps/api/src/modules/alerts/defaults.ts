import { db, type Executor } from '../../db/client.js';
import type { AlertRuleType, NotificationChannel } from '../../db/types.js';

export interface AlertRuleDefault {
  type: AlertRuleType;
  channels: NotificationChannel[];
  config: Record<string, unknown>;
}

/**
 * Sensible out-of-the-box alerting. Every value here is editable per workspace;
 * these are only the starting points so a new user gets useful alerts on day one.
 */
export const DEFAULT_ALERT_RULES: AlertRuleDefault[] = [
  {
    type: 'budget_threshold',
    channels: ['in_app'],
    // Warn while there is still time to react, not only once the limit is gone.
    config: { thresholdPercent: 80 },
  },
  {
    type: 'budget_exceeded',
    channels: ['in_app', 'email'],
    config: {},
  },
  {
    type: 'large_transaction',
    channels: ['in_app'],
    // Absolute floor plus a relative multiple of the user's typical spend, so
    // the rule adapts to very different income levels.
    config: { minAmount: '1000.0000', multipleOfAverage: 3 },
  },
  {
    type: 'unusual_spending',
    channels: ['in_app'],
    // Flag a category once its spend sits this many standard deviations above
    // its own trailing mean.
    config: { sigma: 2, lookbackMonths: 6, minMonths: 3, minAmount: '100.0000' },
  },
  {
    type: 'duplicate_transaction',
    channels: ['in_app'],
    config: { windowDays: 3, requireSameAmount: true },
  },
  {
    type: 'bill_due',
    channels: ['in_app', 'email'],
    config: { daysBefore: 3 },
  },
  {
    type: 'goal_milestone',
    channels: ['in_app'],
    config: { milestones: [25, 50, 75, 100] },
  },
  {
    type: 'low_balance',
    channels: ['in_app'],
    config: { minBalance: '100.0000' },
  },
];

export async function seedDefaultAlertRules(
  workspaceId: string,
  createdBy: string | null,
  executor: Executor = db,
): Promise<number> {
  const result = await executor
    .insertInto('alert_rules')
    .values(
      DEFAULT_ALERT_RULES.map((rule) => ({
        workspace_id: workspaceId,
        type: rule.type,
        channels: rule.channels,
        config: JSON.stringify(rule.config),
        created_by: createdBy,
      })),
    )
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst();

  return Number(result.numInsertedOrUpdatedRows ?? DEFAULT_ALERT_RULES.length);
}
