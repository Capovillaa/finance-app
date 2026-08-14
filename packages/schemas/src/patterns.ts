import { LIMITS } from './limits.js';

/**
 * The shapes both sides test input against, as plain predicates.
 *
 * The API validates a JSON body, where an amount may already be a number and an
 * absent field is `undefined`. The web client validates a form, where every
 * field is a string and an absent one is `''`. Those are genuinely different
 * parsers, so each side builds its own Zod schema — but they must agree on what
 * a valid amount, date or password *looks like*, and that agreement lives here.
 */

/**
 * Built from `LIMITS.money` rather than written out, so the regex and the
 * `NUMERIC(19,4)` column it guards cannot drift apart. A leading sign is
 * allowed: a stored transaction amount is signed, and an account may open with
 * a negative balance.
 */
export const MONEY_PATTERN = new RegExp(
  `^-?\\d{1,${LIMITS.money.integerDigits}}(\\.\\d{1,${LIMITS.money.decimals}})?$`,
);

/** The same shape with no sign, for a field that carries a magnitude. */
export const UNSIGNED_MONEY_PATTERN = new RegExp(
  `^\\d{1,${LIMITS.money.integerDigits}}(\\.\\d{1,${LIMITS.money.decimals}})?$`,
);

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A whole number with no sign, for a count typed into a text field. */
export const WHOLE_NUMBER_PATTERN = /^\d+$/;

export function isMoneyText(value: string): boolean {
  return MONEY_PATTERN.test(value);
}

/**
 * A magnitude greater than zero. The pattern alone would accept `0` and `0.00`,
 * which are the shape of an amount but not an amount anyone meant to enter.
 */
export function isPositiveMoneyText(value: string): boolean {
  return UNSIGNED_MONEY_PATTERN.test(value) && Number(value) > 0;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A real calendar date in `YYYY-MM-DD`. The pattern is not enough on its own —
 * `2025-02-30` matches it and does not exist.
 */
export function isDateOnlyText(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** The one composition rule a password has to satisfy, beyond its length. */
export function hasLettersAndDigits(value: string): boolean {
  return /[a-zA-Z]/.test(value) && /\d/.test(value);
}

/** A whole number inside a closed range, read from text. Empty is not a number. */
export function isWholeNumberInRange(value: string, min: number, max: number): boolean {
  if (!WHOLE_NUMBER_PATTERN.test(value)) return false;
  const parsed = Number(value);
  return parsed >= min && parsed <= max;
}
