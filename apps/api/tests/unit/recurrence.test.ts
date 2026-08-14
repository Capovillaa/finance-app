import { describe, expect, it } from 'vitest';
import {
  describeRecurrence,
  nextOccurrence,
  occurrencesBetween,
  type RecurrenceRule,
} from '../../src/lib/recurrence.js';

const rule = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'monthly',
  intervalCount: 1,
  startDate: '2026-01-10',
  ...overrides,
});

describe('nextOccurrence', () => {
  it('returns the start date when asked from before it', () => {
    expect(nextOccurrence(rule(), '2025-12-01')).toBe('2026-01-10');
  });

  it('advances monthly schedules', () => {
    expect(nextOccurrence(rule(), '2026-01-11')).toBe('2026-02-10');
    expect(nextOccurrence(rule(), '2026-02-10')).toBe('2026-02-10');
  });

  it('clamps a day-31 monthly bill to short months', () => {
    const monthEnd = rule({ startDate: '2026-01-31', dayOfMonth: 31 });
    expect(nextOccurrence(monthEnd, '2026-02-01')).toBe('2026-02-28');
    expect(nextOccurrence(monthEnd, '2026-03-01')).toBe('2026-03-31');
    expect(nextOccurrence(monthEnd, '2026-04-01')).toBe('2026-04-30');
  });

  it('honours a multi-month interval', () => {
    const quarterly = rule({ intervalCount: 3, startDate: '2026-01-15' });
    expect(nextOccurrence(quarterly, '2026-01-16')).toBe('2026-04-15');
    expect(nextOccurrence(quarterly, '2026-05-01')).toBe('2026-07-15');
  });

  it('handles weekly schedules with several weekdays', () => {
    // 2026-01-05 is a Monday; fire on Mondays and Fridays.
    const weekly = rule({ frequency: 'weekly', startDate: '2026-01-05', byWeekday: [1, 5] });
    expect(nextOccurrence(weekly, '2026-01-05')).toBe('2026-01-05');
    expect(nextOccurrence(weekly, '2026-01-06')).toBe('2026-01-09');
    expect(nextOccurrence(weekly, '2026-01-10')).toBe('2026-01-12');
  });

  it('skips weeks for a fortnightly schedule', () => {
    const fortnightly = rule({ frequency: 'weekly', intervalCount: 2, startDate: '2026-01-05' });
    expect(nextOccurrence(fortnightly, '2026-01-06')).toBe('2026-01-19');
  });

  it('supports daily and arbitrary custom intervals', () => {
    expect(nextOccurrence(rule({ frequency: 'daily', startDate: '2026-01-01' }), '2026-01-05')).toBe('2026-01-05');
    const every45 = rule({ frequency: 'custom', intervalCount: 45, startDate: '2026-01-01' });
    expect(nextOccurrence(every45, '2026-01-02')).toBe('2026-02-15');
  });

  it('handles yearly schedules', () => {
    const yearly = rule({ frequency: 'yearly', startDate: '2026-03-20' });
    expect(nextOccurrence(yearly, '2026-03-21')).toBe('2027-03-20');
  });

  it('stops at the end date', () => {
    const ending = rule({ endDate: '2026-02-28' });
    expect(nextOccurrence(ending, '2026-02-11')).toBeNull();
  });

  it('stops once the occurrence limit is reached', () => {
    const limited = rule({ occurrenceLimit: 3, occurrencesCreated: 3 });
    expect(nextOccurrence(limited, '2026-01-01')).toBeNull();
  });
});

describe('occurrencesBetween', () => {
  it('lists every occurrence in a window', () => {
    const dates = occurrencesBetween(rule(), '2026-01-01', '2026-04-30');
    expect(dates).toEqual(['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10']);
  });

  it('respects the occurrence limit across the window', () => {
    const limited = rule({ occurrenceLimit: 2, occurrencesCreated: 0 });
    expect(occurrencesBetween(limited, '2026-01-01', '2026-12-31')).toEqual(['2026-01-10', '2026-02-10']);
  });

  it('honours the max count cap', () => {
    const daily = rule({ frequency: 'daily', startDate: '2026-01-01' });
    expect(occurrencesBetween(daily, '2026-01-01', '2026-12-31', 5)).toHaveLength(5);
  });

  it('returns nothing when the window precedes the start date', () => {
    expect(occurrencesBetween(rule(), '2025-01-01', '2025-12-31')).toEqual([]);
  });
});

describe('describeRecurrence', () => {
  it('produces human-readable summaries', () => {
    expect(describeRecurrence(rule())).toBe('Monthly on day 10');
    expect(describeRecurrence(rule({ frequency: 'daily', intervalCount: 3 }))).toBe('Every 3 days');
    expect(describeRecurrence(rule({ frequency: 'monthly', dayOfMonth: 31 }))).toBe('Monthly on the last day');
  });
});
