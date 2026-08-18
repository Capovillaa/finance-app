import { describe, expect, it } from 'vitest';
import { checkAlertConfig } from '../../src/modules/alerts/schemas.js';

/**
 * M-3 in AUDIT_REPORT.md: `config` used to accept anything at all. This
 * schema is pure — no `config/env`, no database — so it runs in the unit
 * lane with no stubbing, the same reasoning as `rate-limit-policy.ts` and
 * `production-policy.ts`.
 */
describe('checkAlertConfig', () => {
  it('accepts an empty config for every type', () => {
    const types = [
      'budget_threshold',
      'budget_exceeded',
      'large_transaction',
      'unusual_spending',
      'duplicate_transaction',
      'bill_due',
      'goal_milestone',
      'low_balance',
    ] as const;
    for (const type of types) {
      expect(checkAlertConfig(type, {})).toHaveLength(0);
    }
  });

  it('accepts a within-bounds config for each type that has fields', () => {
    expect(checkAlertConfig('budget_threshold', { thresholdPercent: 80 })).toHaveLength(0);
    expect(
      checkAlertConfig('large_transaction', { minAmount: 1000, multipleOfAverage: 3, lookbackDays: 90 }),
    ).toHaveLength(0);
    expect(
      checkAlertConfig('unusual_spending', { sigma: 2.5, lookbackMonths: 6, minMonths: 3, minAmount: 100 }),
    ).toHaveLength(0);
    expect(checkAlertConfig('duplicate_transaction', { windowDays: 3 })).toHaveLength(0);
    expect(checkAlertConfig('bill_due', { daysBefore: 3 })).toHaveLength(0);
    expect(checkAlertConfig('goal_milestone', { milestones: [25, 50, 75, 100] })).toHaveLength(0);
    expect(checkAlertConfig('low_balance', { minBalance: 100 })).toHaveLength(0);
    expect(checkAlertConfig('low_balance', { minBalance: -500 })).toHaveLength(0);
  });

  it('rejects a lookback window large enough to cost the shared worker', () => {
    expect(checkAlertConfig('large_transaction', { lookbackDays: 1_000_000 })).not.toHaveLength(0);
    expect(checkAlertConfig('unusual_spending', { lookbackMonths: 1_000_000 })).not.toHaveLength(0);
    expect(checkAlertConfig('duplicate_transaction', { windowDays: -1 })).not.toHaveLength(0);
    expect(checkAlertConfig('bill_due', { daysBefore: 1_000_000 })).not.toHaveLength(0);
  });

  it('rejects a milestones array with no ceiling', () => {
    expect(checkAlertConfig('goal_milestone', { milestones: Array(500).fill(1) })).not.toHaveLength(0);
    expect(checkAlertConfig('goal_milestone', { milestones: [] })).not.toHaveLength(0);
    expect(checkAlertConfig('goal_milestone', { milestones: [10_000] })).not.toHaveLength(0);
  });

  it('rejects a money value outside what Decimal can round-trip through String()', () => {
    expect(checkAlertConfig('low_balance', { minBalance: 1e21 })).not.toHaveLength(0);
    expect(checkAlertConfig('large_transaction', { minAmount: -1 })).not.toHaveLength(0);
  });

  it('accepts a money value sent as a decimal string, the way a direct API caller does', () => {
    expect(checkAlertConfig('large_transaction', { minAmount: '50.0000' })).toHaveLength(0);
    expect(checkAlertConfig('low_balance', { minBalance: '-500.0000' })).toHaveLength(0);
  });

  it('rejects a malformed money string and an unsigned field given a negative one', () => {
    expect(checkAlertConfig('large_transaction', { minAmount: 'not a number' })).not.toHaveLength(0);
    expect(checkAlertConfig('large_transaction', { minAmount: '-50.0000' })).not.toHaveLength(0);
  });

  it('rejects a config key that belongs to a different alert type', () => {
    // `.strict()` is what makes this fail rather than silently ignoring a
    // field the client sent for the wrong type.
    expect(checkAlertConfig('bill_due', { thresholdPercent: 80 })).not.toHaveLength(0);
  });

  it('rejects a threshold outside 1-100', () => {
    expect(checkAlertConfig('budget_threshold', { thresholdPercent: 0 })).not.toHaveLength(0);
    expect(checkAlertConfig('budget_threshold', { thresholdPercent: 101 })).not.toHaveLength(0);
  });
});
