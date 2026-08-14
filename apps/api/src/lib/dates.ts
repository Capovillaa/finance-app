import { DATE_ONLY_PATTERN, isDateOnlyText } from '@finance/schemas';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Calendar dates are handled as `YYYY-MM-DD` strings end to end. Converting
 * them to JS `Date` objects invites timezone drift: a transaction entered on
 * the 1st in São Paulo must not become the 31st because the server runs in UTC.
 * All arithmetic here is pure calendar arithmetic on the string form.
 */
export type DateOnly = string;

const DATE_PATTERN = DATE_ONLY_PATTERN;

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Re-exported from `@finance/schemas` rather than reimplemented, so the check
 * this module makes and the one the request schemas make are the same check.
 */
export const isDateOnly = isDateOnlyText;

export function parseDate(value: DateOnly): DateParts {
  if (!DATE_PATTERN.test(value)) throw new Error(`Invalid date: ${value}`);
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

export function formatDate({ year, month, day }: DateParts): DateOnly {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Today's calendar date as observed in the given IANA timezone. */
export function today(timeZone = 'UTC', now: Date = new Date()): DateOnly {
  return formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
}

export function toUtcDate(value: DateOnly): Date {
  const { year, month, day } = parseDate(value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function fromUtcDate(date: Date): DateOnly {
  return formatDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addDays(value: DateOnly, amount: number): DateOnly {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromUtcDate(date);
}

/** Adds months, clamping the day to the end of the target month (Jan 31 + 1m = Feb 28/29). */
export function addMonths(value: DateOnly, amount: number): DateOnly {
  const { year, month, day } = parseDate(value);
  const zeroBased = year * 12 + (month - 1) + amount;
  const targetYear = Math.floor(zeroBased / 12);
  // JS `%` keeps the sign of the dividend, so normalise before converting back.
  const targetMonth = (((zeroBased % 12) + 12) % 12) + 1;
  return formatDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

export function addYears(value: DateOnly, amount: number): DateOnly {
  return addMonths(value, amount * 12);
}

export function differenceInDays(from: DateOnly, to: DateOnly): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

export function compareDates(a: DateOnly, b: DateOnly): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const minDate = (a: DateOnly, b: DateOnly): DateOnly => (a <= b ? a : b);
export const maxDate = (a: DateOnly, b: DateOnly): DateOnly => (a >= b ? a : b);

export function isBetween(value: DateOnly, start: DateOnly, end: DateOnly): boolean {
  return value >= start && value <= end;
}

/** ISO weekday, 0 = Sunday .. 6 = Saturday (matches Postgres `extract(dow)`). */
export function weekday(value: DateOnly): number {
  return toUtcDate(value).getUTCDay();
}

export function startOfMonth(value: DateOnly): DateOnly {
  const { year, month } = parseDate(value);
  return formatDate({ year, month, day: 1 });
}

export function endOfMonth(value: DateOnly): DateOnly {
  const { year, month } = parseDate(value);
  return formatDate({ year, month, day: daysInMonth(year, month) });
}

export function startOfQuarter(value: DateOnly): DateOnly {
  const { year, month } = parseDate(value);
  return formatDate({ year, month: Math.floor((month - 1) / 3) * 3 + 1, day: 1 });
}

export function endOfQuarter(value: DateOnly): DateOnly {
  return endOfMonth(addMonths(startOfQuarter(value), 2));
}

export function startOfYear(value: DateOnly): DateOnly {
  return formatDate({ year: parseDate(value).year, month: 1, day: 1 });
}

export function endOfYear(value: DateOnly): DateOnly {
  return formatDate({ year: parseDate(value).year, month: 12, day: 31 });
}

export type PeriodUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface DateRange {
  start: DateOnly;
  end: DateOnly;
}

/** The calendar range containing `anchor` for the given unit. */
export function periodRange(unit: PeriodUnit, anchor: DateOnly): DateRange {
  switch (unit) {
    case 'day':
      return { start: anchor, end: anchor };
    case 'week': {
      // Weeks start on Monday, matching Brazilian and ISO conventions.
      const dow = weekday(anchor);
      const offset = dow === 0 ? 6 : dow - 1;
      const start = addDays(anchor, -offset);
      return { start, end: addDays(start, 6) };
    }
    case 'month':
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case 'quarter':
      return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
    case 'year':
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
  }
}

/** Shifts a range back or forward by whole periods, for period-over-period comparisons. */
export function shiftPeriod(unit: PeriodUnit, range: DateRange, amount: number): DateRange {
  switch (unit) {
    case 'day':
      return { start: addDays(range.start, amount), end: addDays(range.end, amount) };
    case 'week':
      return { start: addDays(range.start, amount * 7), end: addDays(range.end, amount * 7) };
    case 'month':
      return periodRange('month', addMonths(range.start, amount));
    case 'quarter':
      return periodRange('quarter', addMonths(range.start, amount * 3));
    case 'year':
      return periodRange('year', addYears(range.start, amount));
  }
}

/** Enumerates period starts covering a range, used to build dense chart series. */
export function eachPeriodStart(unit: PeriodUnit, range: DateRange, limit = 500): DateOnly[] {
  const result: DateOnly[] = [];
  let cursor = periodRange(unit, range.start).start;
  while (cursor <= range.end && result.length < limit) {
    result.push(cursor);
    const next = periodRange(unit, cursor);
    cursor = addDays(next.end, 1);
  }
  return result;
}
