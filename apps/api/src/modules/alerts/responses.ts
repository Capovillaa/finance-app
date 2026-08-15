import { z } from 'zod/v4';
import { component, integer, jsonObject, timestamp, uuid } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * `config` is deliberately unconstrained: each of the eight rule types reads a
 * different set of keys out of it (`thresholdPercent` for a budget rule,
 * `minAmount` for a large transaction, `zScore` for the anomaly detector), and
 * flattening eight shapes into one schema would describe none of them. The
 * per-type keys are documented in `docs/api.md`.
 */

export const alertRuleTypeSchema = z.enum([
  'budget_threshold',
  'budget_exceeded',
  'large_transaction',
  'unusual_spending',
  'duplicate_transaction',
  'bill_due',
  'goal_milestone',
  'low_balance',
]);

export const alertRuleSchema = component(
  'AlertRule',
  z.object({
    id: uuid,
    type: alertRuleTypeSchema,
    isEnabled: z.boolean(),
    config: jsonObject.describe('Rule-specific settings; the keys depend on `type`. See `docs/api.md`.'),
    channels: z.array(z.enum(['in_app', 'email', 'push'])),
    scopeCategoryId: uuid.nullable().describe('Narrows the rule to one category; null means the whole workspace.'),
    scopeAccountId: uuid.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
);

export const alertRuleListResponse = z.object({ rules: z.array(alertRuleSchema) });

export const alertRuleResponse = z.object({ rule: alertRuleSchema });

export const alertEvaluationResponse = z
  .object({
    workspaceId: uuid,
    notificationsCreated: integer,
    byType: z.record(z.string(), integer).describe('Keyed by alert rule type.'),
  })
  .describe(
    'One scan across the enabled rules. A rule that throws is logged and skipped rather than ' +
      'stopping the rest, so a partial count is a real outcome.',
  );
