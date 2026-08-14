import { Decimal, abs, compare, percentOf } from '../../lib/money.js';
import type { DateOnly } from '../../lib/dates.js';

/**
 * Pure detection logic, deliberately free of database access so each rule can be
 * unit-tested against hand-written series.
 */

export interface MonthlyPoint {
  month: string; // YYYY-MM
  total: string; // positive magnitude
}

export interface DeviationResult {
  isAnomaly: boolean;
  mean: string;
  standardDeviation: string;
  zScore: number;
  /** How far above the mean, as a percentage. */
  percentAboveMean: number;
}

/**
 * Flags a period whose spend sits more than `sigma` standard deviations above
 * the trailing mean.
 *
 * Population standard deviation over the *history excluding* the period under
 * test: including it would drag the mean toward the outlier and mask exactly the
 * spike we are looking for. With fewer than `minSamples` history points the
 * distribution is meaningless and nothing is reported.
 */
export function detectDeviation(
  history: readonly MonthlyPoint[],
  current: string,
  options: { sigma?: number; minSamples?: number } = {},
): DeviationResult {
  const sigma = options.sigma ?? 2;
  const minSamples = options.minSamples ?? 3;

  const values = history.map((p) => new Decimal(abs(p.total)));
  const none: DeviationResult = {
    isAnomaly: false,
    mean: '0.0000',
    standardDeviation: '0.0000',
    zScore: 0,
    percentAboveMean: 0,
  };

  if (values.length < minSamples) return none;

  const mean = values.reduce((acc, v) => acc.plus(v), new Decimal(0)).div(values.length);
  const variance = values
    .reduce((acc, v) => acc.plus(v.minus(mean).pow(2)), new Decimal(0))
    .div(values.length);
  const stdDev = variance.sqrt();

  const currentValue = new Decimal(abs(current));

  // A perfectly flat history has zero deviation; fall back to a relative test so
  // "always exactly R$100, suddenly R$400" is still caught.
  if (stdDev.isZero()) {
    const isAnomaly = mean.greaterThan(0) && currentValue.greaterThan(mean.times(2));
    return {
      isAnomaly,
      mean: mean.toFixed(4),
      standardDeviation: '0.0000',
      zScore: isAnomaly ? Number.POSITIVE_INFINITY : 0,
      percentAboveMean: mean.isZero() ? 0 : percentOf(currentValue.minus(mean).toFixed(4), mean.toFixed(4)),
    };
  }

  const zScore = currentValue.minus(mean).div(stdDev).toDecimalPlaces(3).toNumber();

  return {
    isAnomaly: zScore >= sigma,
    mean: mean.toFixed(4),
    standardDeviation: stdDev.toFixed(4),
    zScore,
    percentAboveMean: mean.isZero() ? 0 : percentOf(currentValue.minus(mean).toFixed(4), mean.toFixed(4)),
  };
}

export interface LargeTransactionOptions {
  /** Absolute floor below which nothing is ever flagged. */
  minAmount?: string;
  /** Also flag anything this many times the user's typical transaction. */
  multipleOfAverage?: number;
  averageAmount?: string;
}

export interface LargeTransactionResult {
  isLarge: boolean;
  reason: 'absolute_threshold' | 'multiple_of_average' | null;
  threshold: string | null;
}

/**
 * Two-sided test: a fixed floor catches genuinely big numbers, while the
 * multiple-of-average arm adapts to how much this workspace usually spends.
 */
export function detectLargeTransaction(
  amount: string,
  options: LargeTransactionOptions = {},
): LargeTransactionResult {
  const magnitude = abs(amount);

  if (options.minAmount && compare(magnitude, options.minAmount) >= 0) {
    return { isLarge: true, reason: 'absolute_threshold', threshold: options.minAmount };
  }

  if (options.multipleOfAverage && options.averageAmount) {
    const average = new Decimal(abs(options.averageAmount));
    if (average.greaterThan(0)) {
      const threshold = average.times(options.multipleOfAverage);
      if (new Decimal(magnitude).greaterThanOrEqualTo(threshold)) {
        return {
          isLarge: true,
          reason: 'multiple_of_average',
          threshold: threshold.toDecimalPlaces(4).toFixed(4),
        };
      }
    }
  }

  return { isLarge: false, reason: null, threshold: null };
}

export interface DuplicateCandidate {
  id: string;
  accountId: string;
  amount: string;
  occurredOn: DateOnly;
  description: string;
  merchant?: string | null;
}

export interface DuplicatePair {
  transactionId: string;
  duplicateOfId: string;
  confidence: number;
  /** Days between the two occurrences, so callers can render their own translated reason. */
  dayGap: number;
  reason: string;
}

/**
 * Finds probable double entries: same account, near-identical amount, close in
 * time, with a similar description. Confidence is scored rather than boolean so
 * the UI can present strong matches differently from weak ones — an honest
 * "paid the same shop twice today" must stay possible.
 */
export function detectDuplicates(
  candidates: readonly DuplicateCandidate[],
  options: { windowDays?: number; minConfidence?: number } = {},
): DuplicatePair[] {
  const windowDays = options.windowDays ?? 3;
  const minConfidence = options.minConfidence ?? 0.7;
  const results: DuplicatePair[] = [];

  const sorted = [...candidates].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;

      if (a.accountId !== b.accountId) continue;

      const dayGap = Math.abs(daysBetween(a.occurredOn, b.occurredOn));
      if (dayGap > windowDays) break; // sorted by date: nothing later can match

      if (compare(abs(a.amount), abs(b.amount)) !== 0) continue;

      const similarity = descriptionSimilarity(
        `${a.description} ${a.merchant ?? ''}`,
        `${b.description} ${b.merchant ?? ''}`,
      );

      // Same amount and same account already implies a lot; recency and text
      // similarity refine it.
      const recencyScore = 1 - dayGap / (windowDays + 1);
      const confidence = Number((0.5 + 0.3 * similarity + 0.2 * recencyScore).toFixed(3));

      if (confidence >= minConfidence) {
        results.push({
          transactionId: b.id,
          duplicateOfId: a.id,
          confidence,
          dayGap,
          reason:
            dayGap === 0
              ? 'Same account, same amount, same day'
              : `Same account and amount, ${dayGap} day(s) apart`,
        });
      }
    }
  }

  return results;
}

function daysBetween(a: DateOnly, b: DateOnly): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Token-overlap (Jaccard) similarity — cheap, order-insensitive, good enough here. */
export function descriptionSimilarity(a: string, b: string): number {
  const tokenize = (value: string): Set<string> =>
    new Set(
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 1),
    );

  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;

  return Number((intersection / (setA.size + setB.size - intersection)).toFixed(3));
}

export interface BudgetBreach {
  status: 'on_track' | 'warning' | 'exceeded';
  percentUsed: number;
}

/** Classifies a budget line against its own alert threshold. */
export function classifyBudgetUsage(
  spent: string,
  limit: string,
  thresholdPercent: number,
): BudgetBreach {
  const percentUsed = percentOf(spent, limit);
  if (compare(spent, limit) > 0) return { status: 'exceeded', percentUsed };
  if (percentUsed >= thresholdPercent) return { status: 'warning', percentUsed };
  return { status: 'on_track', percentUsed };
}
