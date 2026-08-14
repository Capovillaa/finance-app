import i18n from '../i18n';
import type { DateOnly, Money } from '../api/types';

/**
 * The locale every formatter here defaults to.
 *
 * This used to be `navigator.language`, which meant the language picker (and
 * the `locale` already stored on the profile) changed the words on screen while
 * dates and money kept following the browser — a Brazilian machine showing an
 * English interface still printed `25 de ago.`. Reading it from i18next instead
 * makes one setting govern both. It is read on each call rather than captured
 * once, so a language change needs no re-registration; the components re-render
 * because `App` subscribes to i18next.
 */
export function appLocale(): string {
  return i18n.language || 'en';
}

/**
 * Money formatting.
 *
 * Amounts arrive as decimal strings with four places and are passed to
 * `Intl.NumberFormat` *as strings*. That is deliberate: the Intl "v3" string
 * input path formats the decimal exactly, whereas routing through `Number`
 * first would round large balances at the 15th significant digit — the very
 * failure mode `NUMERIC(19,4)` and `decimal.js` exist to prevent on the server.
 * The `Number` path below is only a fallback for engines without string input.
 */
export function formatMoney(
  amount: Money | null | undefined,
  currency: string,
  locale = appLocale(),
  options: Intl.NumberFormatOptions = {},
): string {
  if (amount === null || amount === undefined || amount === '') return '—';

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...options,
  });

  try {
    return formatter.format(amount as unknown as number);
  } catch {
    return formatter.format(Number(amount));
  }
}

/** Compact form for chart axes and tiles: `R$ 12.4k` rather than `R$ 12,432.18`. */
export function formatMoneyCompact(
  amount: Money | null | undefined,
  currency: string,
  locale = appLocale(),
): string {
  if (amount === null || amount === undefined || amount === '') return '—';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(amount));
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(fractionDigits)}%`;
}

/** Same, with an explicit sign, for change indicators. */
export function formatSignedPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

/**
 * Formats a `YYYY-MM-DD` calendar date without going through `new Date(string)`,
 * which would parse it as UTC midnight and then render the previous day for
 * anyone west of Greenwich.
 */
export function formatDate(
  date: DateOnly | null | undefined,
  locale = appLocale(),
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!date) return '—';

  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;

  return new Intl.DateTimeFormat(locale, options).format(new Date(year, month - 1, day));
}

/** Short label for lists: `12 Mar`, dropping the year. */
export function formatDateShort(date: DateOnly | null | undefined, locale = appLocale()): string {
  return formatDate(date, locale, { day: '2-digit', month: 'short' });
}

/** Relative wording for notification timestamps: `4 hours ago`. */
export function formatRelative(timestamp: string | null | undefined, locale = appLocale()): string {
  if (!timestamp) return '—';

  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return '—';

  const deltaSeconds = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }

  return formatter.format(deltaSeconds, 'second');
}

/** Today as `YYYY-MM-DD` in the viewer's own timezone, for date inputs. */
export function todayIso(): DateOnly {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** True when a decimal string is negative, without parsing it to a float. */
export function isNegative(amount: Money): boolean {
  return amount.trimStart().startsWith('-');
}

/**
 * Magnitude of a decimal string.
 *
 * Dropping the sign as text rather than through `Math.abs(Number(...))` keeps
 * every digit — the same reason `formatMoney` hands the raw string to `Intl`.
 * Spending totals arrive negative (expenses are stored signed), and a report
 * that prints them alongside a "% of spending" column reads better unsigned.
 */
export function absMoney(amount: Money): Money {
  const trimmed = amount.trimStart();
  return trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
}
