import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  differenceInDays,
  eachPeriodStart,
  endOfMonth,
  endOfQuarter,
  isDateOnly,
  periodRange,
  shiftPeriod,
  startOfQuarter,
  today,
  weekday,
} from '../../src/lib/dates.js';

describe('date arithmetic', () => {
  it('validates calendar dates, not just the shape', () => {
    expect(isDateOnly('2026-02-28')).toBe(true);
    expect(isDateOnly('2024-02-29')).toBe(true); // leap year
    expect(isDateOnly('2025-02-29')).toBe(false);
    expect(isDateOnly('2026-13-01')).toBe(false);
    expect(isDateOnly('26-01-01')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('clamps the day when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('handles negative month offsets that cross a year', () => {
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('computes day differences symmetrically', () => {
    expect(differenceInDays('2026-01-01', '2026-01-31')).toBe(30);
    expect(differenceInDays('2026-01-31', '2026-01-01')).toBe(-30);
  });

  it('resolves calendar periods', () => {
    expect(periodRange('month', '2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(startOfQuarter('2026-05-20')).toBe('2026-04-01');
    expect(endOfQuarter('2026-05-20')).toBe('2026-06-30');
    expect(endOfMonth('2026-12-05')).toBe('2026-12-31');
  });

  it('starts weeks on Monday', () => {
    // 2026-08-10 is a Monday.
    expect(periodRange('week', '2026-08-12')).toEqual({ start: '2026-08-10', end: '2026-08-16' });
    // Sunday belongs to the week that began the previous Monday.
    expect(periodRange('week', '2026-08-16')).toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('shifts periods for period-over-period comparisons', () => {
    const february = periodRange('month', '2026-02-15');
    expect(shiftPeriod('month', february, -1)).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('enumerates dense period starts', () => {
    const starts = eachPeriodStart('month', { start: '2026-01-15', end: '2026-04-02' });
    expect(starts).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('reads today in the requested timezone', () => {
    // 2026-01-01T02:00Z is still 2025-12-31 in São Paulo (UTC-3).
    const instant = new Date('2026-01-01T02:00:00Z');
    expect(today('UTC', instant)).toBe('2026-01-01');
    expect(today('America/Sao_Paulo', instant)).toBe('2025-12-31');
  });

  it('reports weekdays with Sunday as 0', () => {
    expect(weekday('2026-08-09')).toBe(0);
    expect(weekday('2026-08-10')).toBe(1);
  });
});
