// Named import, not default: decimal.js merges a class with a same-named
// namespace, and under NodeNext resolution the default import resolves to the
// namespace rather than the constructor.
import { Decimal } from 'decimal.js';

// NUMERIC(19,4) in the database: 4 decimal places of storage, enough headroom
// for currency conversion intermediates without ever touching a float.
export const MONEY_SCALE = 4;
export const RATE_SCALE = 10;

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export type MoneyInput = string | number | Decimal;

export function toDecimal(value: MoneyInput): Decimal {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (!d.isFinite()) throw new Error(`Invalid monetary value: ${String(value)}`);
  return d;
}

/** Normalises any monetary value to the string form the database expects. */
export function money(value: MoneyInput): string {
  return toDecimal(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_EVEN).toFixed(MONEY_SCALE);
}

export function add(a: MoneyInput, b: MoneyInput): string {
  return money(toDecimal(a).plus(toDecimal(b)));
}

export function subtract(a: MoneyInput, b: MoneyInput): string {
  return money(toDecimal(a).minus(toDecimal(b)));
}

export function multiply(a: MoneyInput, factor: MoneyInput): string {
  return money(toDecimal(a).times(toDecimal(factor)));
}

export function negate(a: MoneyInput): string {
  return money(toDecimal(a).negated());
}

export function abs(a: MoneyInput): string {
  return money(toDecimal(a).abs());
}

export function sum(values: readonly MoneyInput[]): string {
  return money(values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0)));
}

export function compare(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  return toDecimal(a).comparedTo(toDecimal(b)) as -1 | 0 | 1;
}

export const isZero = (a: MoneyInput): boolean => toDecimal(a).isZero();
export const isNegative = (a: MoneyInput): boolean => toDecimal(a).isNegative() && !toDecimal(a).isZero();
export const isPositive = (a: MoneyInput): boolean => toDecimal(a).greaterThan(0);

/**
 * Percentage of `part` relative to `total`, rounded to two places.
 * Returns 0 when the total is zero so budget progress never yields NaN/Infinity.
 */
export function percentOf(part: MoneyInput, total: MoneyInput): number {
  const totalDec = toDecimal(total);
  if (totalDec.isZero()) return 0;
  return toDecimal(part).div(totalDec).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber();
}

/** Converts an amount between currencies at a given rate. */
export function convert(amount: MoneyInput, rate: MoneyInput): string {
  return money(toDecimal(amount).times(toDecimal(rate)));
}

export function rate(value: MoneyInput): string {
  return toDecimal(value).toDecimalPlaces(RATE_SCALE, Decimal.ROUND_HALF_EVEN).toFixed();
}

/**
 * Splits an amount into `count` shares that add back up to exactly the original,
 * distributing the rounding remainder one minor unit at a time. Used by expense
 * splitting, where the parts must reconcile to the cent.
 */
export function splitEvenly(amount: MoneyInput, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  const total = toDecimal(amount);
  const unit = new Decimal(10).pow(-MONEY_SCALE);
  const totalUnits = total.div(unit).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  const baseUnits = totalUnits.div(count).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  let remainder = totalUnits.minus(baseUnits.times(count));
  const step = remainder.isNegative() ? new Decimal(-1) : new Decimal(1);

  const shares: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let units = baseUnits;
    if (!remainder.isZero()) {
      units = units.plus(step);
      remainder = remainder.minus(step);
    }
    shares.push(money(units.times(unit)));
  }
  return shares;
}

/**
 * Splits by explicit weights (percentages or shares), again guaranteeing the
 * parts sum to the whole; any residue lands on the largest weight.
 */
export function splitByWeights(amount: MoneyInput, weights: readonly MoneyInput[]): string[] {
  if (weights.length === 0) throw new Error('weights must not be empty');
  const total = toDecimal(amount);
  const weightTotal = weights.reduce<Decimal>((acc, w) => acc.plus(toDecimal(w)), new Decimal(0));
  if (weightTotal.isZero()) throw new Error('weights must not sum to zero');

  const raw = weights.map((w) => total.times(toDecimal(w)).div(weightTotal));
  const rounded = raw.map((v) => v.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_DOWN));
  const allocated = rounded.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));
  let residue = total.minus(allocated).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_EVEN);

  const unit = new Decimal(10).pow(-MONEY_SCALE);
  const step = residue.isNegative() ? unit.negated() : unit;
  // Hand out the residue starting from the largest share, which is where a
  // one-cent difference is least visible.
  const order = rounded
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value.comparedTo(a.value))
    .map((entry) => entry.index);

  let cursor = 0;
  while (!residue.isZero() && cursor < order.length * 2) {
    const idx = order[cursor % order.length]!;
    rounded[idx] = rounded[idx]!.plus(step);
    residue = residue.minus(step);
    cursor += 1;
  }

  return rounded.map((v) => money(v));
}

export { Decimal };
