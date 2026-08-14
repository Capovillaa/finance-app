import { describe, expect, it } from 'vitest';
import {
  classifyBudgetUsage,
  descriptionSimilarity,
  detectDeviation,
  detectDuplicates,
  detectLargeTransaction,
  type DuplicateCandidate,
  type MonthlyPoint,
} from '../../src/modules/alerts/detectors.js';

const series = (...totals: string[]): MonthlyPoint[] =>
  totals.map((total, index) => ({ month: `2026-${String(index + 1).padStart(2, '0')}`, total }));

describe('detectDeviation', () => {
  it('stays silent without enough history', () => {
    expect(detectDeviation(series('100', '110'), '900').isAnomaly).toBe(false);
  });

  it('flags a spend far above the trailing mean', () => {
    const result = detectDeviation(series('100', '110', '105', '95', '100'), '400', { sigma: 2 });
    expect(result.isAnomaly).toBe(true);
    expect(result.zScore).toBeGreaterThan(2);
    expect(Number(result.mean)).toBeCloseTo(102, 0);
  });

  it('leaves ordinary variation alone', () => {
    expect(detectDeviation(series('100', '120', '90', '110', '105'), '115', { sigma: 2 }).isAnomaly).toBe(false);
  });

  it('falls back to a relative test when history is perfectly flat', () => {
    // Zero standard deviation would make every z-score infinite.
    const flat = detectDeviation(series('100', '100', '100', '100'), '400');
    expect(flat.isAnomaly).toBe(true);
    expect(flat.standardDeviation).toBe('0.0000');

    const modest = detectDeviation(series('100', '100', '100', '100'), '150');
    expect(modest.isAnomaly).toBe(false);
  });

  it('excludes the current period from the baseline', () => {
    // If the spike were folded into the mean it would no longer look anomalous.
    const result = detectDeviation(series('50', '50', '50', '50', '50'), '500');
    expect(result.mean).toBe('50.0000');
  });
});

describe('detectLargeTransaction', () => {
  it('flags anything over the absolute floor', () => {
    const result = detectLargeTransaction('-1500.00', { minAmount: '1000.0000' });
    expect(result.isLarge).toBe(true);
    expect(result.reason).toBe('absolute_threshold');
  });

  it('flags a multiple of the typical spend even below the floor', () => {
    const result = detectLargeTransaction('-450.00', {
      minAmount: '1000.0000',
      multipleOfAverage: 3,
      averageAmount: '100.00',
    });
    expect(result.isLarge).toBe(true);
    expect(result.reason).toBe('multiple_of_average');
    expect(result.threshold).toBe('300.0000');
  });

  it('ignores everyday amounts', () => {
    expect(
      detectLargeTransaction('-80.00', { minAmount: '1000.0000', multipleOfAverage: 3, averageAmount: '100.00' })
        .isLarge,
    ).toBe(false);
  });

  it('is sign-agnostic', () => {
    expect(detectLargeTransaction('1500.00', { minAmount: '1000.0000' }).isLarge).toBe(true);
  });
});

describe('detectDuplicates', () => {
  const base: DuplicateCandidate = {
    id: 'a',
    accountId: 'acc-1',
    amount: '-59.90',
    occurredOn: '2026-03-10',
    description: 'Padaria Central',
  };

  it('flags identical charges on the same day', () => {
    const pairs = detectDuplicates([base, { ...base, id: 'b' }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.transactionId).toBe('b');
    expect(pairs[0]!.duplicateOfId).toBe('a');
    expect(pairs[0]!.confidence).toBeGreaterThan(0.9);
  });

  it('ignores different accounts', () => {
    expect(detectDuplicates([base, { ...base, id: 'b', accountId: 'acc-2' }])).toHaveLength(0);
  });

  it('ignores different amounts', () => {
    expect(detectDuplicates([base, { ...base, id: 'b', amount: '-59.91' }])).toHaveLength(0);
  });

  it('ignores charges outside the window', () => {
    expect(detectDuplicates([base, { ...base, id: 'b', occurredOn: '2026-03-20' }], { windowDays: 3 })).toHaveLength(0);
  });

  it('scores an unrelated description lower than an identical one', () => {
    const [pair] = detectDuplicates(
      [base, { ...base, id: 'b', description: 'Posto Ipiranga', occurredOn: '2026-03-12' }],
      { windowDays: 3, minConfidence: 0 },
    );
    expect(pair!.confidence).toBeLessThan(0.9);
  });
});

describe('descriptionSimilarity', () => {
  it('scores identical text as 1', () => {
    expect(descriptionSimilarity('Supermercado Extra', 'Supermercado Extra')).toBe(1);
  });

  it('ignores accents and case', () => {
    expect(descriptionSimilarity('Alimentação', 'alimentacao')).toBe(1);
  });

  it('scores unrelated text near zero', () => {
    expect(descriptionSimilarity('Netflix', 'Aluguel')).toBe(0);
  });
});

describe('classifyBudgetUsage', () => {
  it('classifies against the configured threshold', () => {
    expect(classifyBudgetUsage('500', '1000', 80).status).toBe('on_track');
    expect(classifyBudgetUsage('850', '1000', 80).status).toBe('warning');
    expect(classifyBudgetUsage('1001', '1000', 80).status).toBe('exceeded');
  });

  it('treats exactly at the limit as not yet exceeded', () => {
    expect(classifyBudgetUsage('1000', '1000', 80).status).toBe('warning');
  });
});
