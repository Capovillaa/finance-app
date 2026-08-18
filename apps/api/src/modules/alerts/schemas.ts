import { LIMITS, MONEY_PATTERN, UNSIGNED_MONEY_PATTERN } from '@finance/schemas';
import { z } from 'zod/v4';
import type { AlertRuleType } from '../../db/types.js';

/**
 * M-3 in AUDIT_REPORT.md: `config` used to be an open `z.record(z.string(),
 * z.unknown())`, so a value that drives a lookback window, a `Decimal` parse
 * or an array walk on the shared worker — the one BullMQ process evaluating
 * every workspace's alert rules — had no ceiling at all. A `lookbackDays` of
 * a million or a thousand-entry `milestones` array costs the same process
 * every other workspace's scan shares.
 *
 * Each alert type gets its own bounded object, keyed on `type` the same way
 * the client's `alertMeta.ts` already groups its fields — this schema was
 * checked against that file's field list so the two cannot disagree about
 * what a type accepts. `engine.ts`'s `num()`/`str()` helpers stay as they
 * are: a defensive fallback for a row written before this shipped, not a
 * second gate this schema is meant to replace.
 */

/**
 * A money-shaped config value, accepted the way `engine.ts`'s own `str()`
 * helper reads it: a number (what `AlertRuleFormDialog` sends today) or a
 * decimal string (what a direct API caller sends — `tests/integration/
 * recurring-alerts.test.ts` already does, and this schema has to keep
 * accepting it). The bound matches `LIMITS.money` — the same ceiling the
 * `NUMERIC(19,4)` ledger column itself enforces — rather than a number picked
 * for this file alone.
 */
const MONEY_BOUND = 10 ** LIMITS.money.integerDigits - 1;

function moneyLike(allowNegative: boolean): z.ZodType<number | string> {
  const numberBranch = allowNegative
    ? z.number().finite().min(-MONEY_BOUND).max(MONEY_BOUND)
    : z.number().finite().min(0).max(MONEY_BOUND);
  const stringBranch = z
    .string()
    .refine((value) => (allowNegative ? MONEY_PATTERN : UNSIGNED_MONEY_PATTERN).test(value));
  return z.union([numberBranch, stringBranch]);
}

// A signed amount (an overdraft-style low-balance threshold may be negative)
// and an unsigned magnitude (a "large transaction" or "unusual spending"
// floor, which is never sensibly negative).
const money = moneyLike(true);
const unsignedMoney = moneyLike(false);

const thresholdPercent = z.number().finite().min(1).max(100);
const multipleOfAverage = z.number().finite().min(1).max(1000);
const lookbackDays = z.number().finite().int().min(1).max(365);
const sigma = z.number().finite().min(0.1).max(10);
const lookbackMonths = z.number().finite().int().min(1).max(60);
const minMonths = z.number().finite().int().min(1).max(60);
const windowDays = z.number().finite().int().min(0).max(365);
const daysBefore = z.number().finite().int().min(0).max(90);
const milestones = z.array(z.number().finite().min(1).max(1000)).min(1).max(20);

const ALERT_CONFIG_SCHEMAS = {
  budget_threshold: z.object({ thresholdPercent: thresholdPercent.optional() }).strict(),
  budget_exceeded: z.object({}).strict(),
  large_transaction: z
    .object({
      minAmount: unsignedMoney.optional(),
      multipleOfAverage: multipleOfAverage.optional(),
      lookbackDays: lookbackDays.optional(),
    })
    .strict(),
  unusual_spending: z
    .object({
      sigma: sigma.optional(),
      lookbackMonths: lookbackMonths.optional(),
      minMonths: minMonths.optional(),
      minAmount: unsignedMoney.optional(),
    })
    .strict(),
  duplicate_transaction: z.object({ windowDays: windowDays.optional() }).strict(),
  bill_due: z.object({ daysBefore: daysBefore.optional() }).strict(),
  goal_milestone: z.object({ milestones: milestones.optional() }).strict(),
  low_balance: z.object({ minBalance: money.optional() }).strict(),
} as const satisfies Record<AlertRuleType, z.ZodType>;

/**
 * Validates a rule's `config` against the bounds for its own `type`, called
 * from a `superRefine` on the route body — a plain `z.object` cannot key a
 * nested schema off a sibling field's value. Returns the issues to attach
 * rather than throwing, so the caller controls how they are pathed into the
 * outer body.
 */
export function checkAlertConfig(type: AlertRuleType, config: unknown): z.ZodIssue[] {
  const schema = ALERT_CONFIG_SCHEMAS[type];
  const result = schema.safeParse(config);
  return result.success ? [] : result.error.issues;
}
