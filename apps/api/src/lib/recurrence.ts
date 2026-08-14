import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  daysInMonth,
  formatDate,
  parseDate,
  weekday,
  type DateOnly,
} from './dates.js';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface RecurrenceRule {
  frequency: Frequency;
  /** Repeat every N units of `frequency`. */
  intervalCount: number;
  startDate: DateOnly;
  endDate?: DateOnly | null;
  /** Weekly only: 0 = Sunday .. 6 = Saturday. Defaults to the start date's weekday. */
  byWeekday?: number[] | null;
  /** Monthly/yearly: 1-31, or 31 to always mean "last day of month". */
  dayOfMonth?: number | null;
  /** Yearly only: 1-12. */
  monthOfYear?: number | null;
  /** Stop after this many occurrences in total. */
  occurrenceLimit?: number | null;
  /** Occurrences already generated, counted against `occurrenceLimit`. */
  occurrencesCreated?: number;
}

/**
 * `custom` reuses the daily engine with an arbitrary interval, e.g. "every 45
 * days" — the case a fixed weekly/monthly rule cannot express.
 */
function normalizeInterval(rule: RecurrenceRule): number {
  const n = Math.trunc(rule.intervalCount);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clampToMonth(year: number, month: number, day: number): DateOnly {
  return formatDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

/**
 * The first occurrence at or after `from`, or null when the rule has run out.
 * Deliberately pure and side-effect free so the scheduler can be tested without
 * a database.
 */
export function nextOccurrence(rule: RecurrenceRule, from: DateOnly): DateOnly | null {
  const interval = normalizeInterval(rule);
  const limitReached =
    rule.occurrenceLimit != null && (rule.occurrencesCreated ?? 0) >= rule.occurrenceLimit;
  if (limitReached) return null;

  const cursorStart = compareDates(from, rule.startDate) < 0 ? rule.startDate : from;
  let candidate: DateOnly | null;

  switch (rule.frequency) {
    case 'daily':
    case 'custom':
      candidate = nextByDayInterval(rule.startDate, interval, cursorStart);
      break;
    case 'weekly':
      candidate = nextWeekly(rule, interval, cursorStart);
      break;
    case 'monthly':
      candidate = nextMonthly(rule, interval, cursorStart);
      break;
    case 'yearly':
      candidate = nextYearly(rule, interval, cursorStart);
      break;
  }

  if (candidate === null) return null;
  if (rule.endDate && compareDates(candidate, rule.endDate) > 0) return null;
  return candidate;
}

function nextByDayInterval(start: DateOnly, interval: number, from: DateOnly): DateOnly {
  const elapsed = Math.max(0, daysBetween(start, from));
  const steps = Math.ceil(elapsed / interval);
  return addDays(start, steps * interval);
}

function daysBetween(from: DateOnly, to: DateOnly): number {
  const a = parseDate(from);
  const b = parseDate(to);
  const aTime = Date.UTC(a.year, a.month - 1, a.day);
  const bTime = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((bTime - aTime) / 86_400_000);
}

function nextWeekly(rule: RecurrenceRule, interval: number, from: DateOnly): DateOnly {
  const days =
    rule.byWeekday && rule.byWeekday.length > 0
      ? [...new Set(rule.byWeekday.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
      : [weekday(rule.startDate)];
  if (days.length === 0) days.push(weekday(rule.startDate));

  // Week anchor = the Sunday on or before the start date, so "every 2 weeks"
  // counts whole weeks rather than rolling 14-day windows.
  const anchor = addDays(rule.startDate, -weekday(rule.startDate));
  let cursor = compareDates(from, rule.startDate) < 0 ? rule.startDate : from;

  // At most `interval` weeks of scanning is needed to land on an active week.
  for (let guard = 0; guard < 7 * (interval + 1) + 7; guard += 1) {
    const weeksFromAnchor = Math.floor(daysBetween(anchor, cursor) / 7);
    if (weeksFromAnchor % interval === 0 && days.includes(weekday(cursor))) return cursor;
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function nextMonthly(rule: RecurrenceRule, interval: number, from: DateOnly): DateOnly {
  const start = parseDate(rule.startDate);
  const targetDay = rule.dayOfMonth ?? start.day;

  let monthIndex = 0;
  // Walk forward month by month from the start; each step is O(1) and the loop
  // exits on the first candidate on or after `from`.
  for (let guard = 0; guard < 1200; guard += 1) {
    const base = addMonths(formatDate({ year: start.year, month: start.month, day: 1 }), monthIndex);
    const { year, month } = parseDate(base);
    const candidate = clampToMonth(year, month, targetDay);
    if (compareDates(candidate, rule.startDate) >= 0 && compareDates(candidate, from) >= 0) {
      return candidate;
    }
    monthIndex += interval;
  }
  return addMonths(from, interval);
}

function nextYearly(rule: RecurrenceRule, interval: number, from: DateOnly): DateOnly {
  const start = parseDate(rule.startDate);
  const month = rule.monthOfYear ?? start.month;
  const day = rule.dayOfMonth ?? start.day;

  let yearOffset = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const year = start.year + yearOffset;
    const candidate = clampToMonth(year, month, day);
    if (compareDates(candidate, rule.startDate) >= 0 && compareDates(candidate, from) >= 0) {
      return candidate;
    }
    yearOffset += interval;
  }
  return addYears(from, interval);
}

/**
 * Every occurrence in `[from, through]`, capped by `maxCount`. Used by the
 * materialisation job to create upcoming transactions in one pass.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: DateOnly,
  through: DateOnly,
  maxCount = 500,
): DateOnly[] {
  const result: DateOnly[] = [];
  let cursor = from;
  let created = rule.occurrencesCreated ?? 0;

  while (result.length < maxCount) {
    const next = nextOccurrence({ ...rule, occurrencesCreated: created }, cursor);
    if (next === null || compareDates(next, through) > 0) break;
    result.push(next);
    created += 1;
    cursor = addDays(next, 1);
  }

  return result;
}

/** Human-readable summary for UI and notification copy. */
export function describeRecurrence(rule: RecurrenceRule): string {
  const n = normalizeInterval(rule);
  const every = n === 1 ? '' : ` every ${n}`;
  switch (rule.frequency) {
    case 'daily':
      return n === 1 ? 'Daily' : `Every ${n} days`;
    case 'weekly': {
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const days = (rule.byWeekday?.length ? rule.byWeekday : [weekday(rule.startDate)])
        .map((d) => names[d] ?? '')
        .filter(Boolean)
        .join(', ');
      return n === 1 ? `Weekly on ${days}` : `Every ${n} weeks on ${days}`;
    }
    case 'monthly': {
      const day = rule.dayOfMonth ?? parseDate(rule.startDate).day;
      const label = day >= 31 ? 'the last day' : `day ${day}`;
      return n === 1 ? `Monthly on ${label}` : `Every ${n} months on ${label}`;
    }
    case 'yearly': {
      const { month, day } = {
        month: rule.monthOfYear ?? parseDate(rule.startDate).month,
        day: rule.dayOfMonth ?? parseDate(rule.startDate).day,
      };
      return `${n === 1 ? 'Yearly' : `Every ${n} years`} on ${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    case 'custom':
      return `Every${every || ' 1'} days`;
  }
}
