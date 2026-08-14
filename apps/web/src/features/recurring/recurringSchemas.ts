import {
  LIMITS,
  RECURRING_FREQUENCIES,
  TRANSACTION_TYPES,
  isPositiveMoneyText,
  isWholeNumberInRange,
  type RecurringFrequency,
} from '@finance/schemas';
import { z } from 'zod';

/**
 * The recurring-schedule create/edit form.
 *
 * Frequencies and every bound come from `@finance/schemas`, shared with
 * `apps/api/src/modules/recurring/routes.ts`. This is the form that made the
 * case for the package: the three numeric fields below were the ones whose
 * client-side rules had drifted from the server's — an unbounded interval
 * against a 1–365 cap, a lead time of up to 99 days against a 90-day cap, and
 * an occurrence limit with no rule at all against a 1–1000 cap. Each of those
 * accepted input the API then refused, and the third silently sent `NaN`, which
 * JSON encodes as `null` — so a typo in that box quietly meant "no limit".
 *
 * The schedule shape (frequency, weekday, day-of-month, interval) is only
 * settable at creation: the server's PATCH schema does not accept it, so
 * `RecurringFormDialog` disables those fields when editing.
 */
export { RECURRING_FREQUENCIES, type RecurringFrequency as RecurringFrequencyValue };

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const FREQUENCY_LABEL_KEYS: Record<RecurringFrequency, string> = {
  daily: 'recurring.frequency.daily',
  weekly: 'recurring.frequency.weekly',
  monthly: 'recurring.frequency.monthly',
  yearly: 'recurring.frequency.yearly',
  custom: 'recurring.frequency.custom',
};

/**
 * Weekday names, from the platform rather than the catalogue.
 *
 * `Intl` already knows every language's short weekday names, and knows that
 * some of them are not three letters. Translating them by hand would be
 * duplicating a table the browser ships — and getting it wrong for the
 * languages nobody on the team reads. Index 0 is Sunday, matching the server's
 * `by_weekday` encoding.
 */
export function weekdayLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-07 was a Sunday, so the week runs 7..13 with no month boundary.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 7 + index))),
  );
}

const amountInputSchema = z
  .string()
  .trim()
  .min(1, 'validation.amountRequired')
  .refine(isPositiveMoneyText, 'validation.amountPositive');

/** Empty, or a whole number the server would also accept. */
function optionalRange(bounds: { readonly min: number; readonly max: number }, message: string) {
  return z
    .string()
    .trim()
    .refine((v) => v === '' || isWholeNumberInRange(v, bounds.min, bounds.max), message);
}

export const recurringFormSchema = z
  .object({
    name: z.string().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max),
    accountId: z.string().min(1, 'validation.accountRequired'),
    categoryId: z.string(),
    type: z.enum(TRANSACTION_TYPES),
    amount: amountInputSchema,
    description: z
      .string()
      .min(LIMITS.description.min, 'validation.descriptionRequired')
      .max(LIMITS.description.max),
    merchant: z.string().max(LIMITS.merchant.max).optional(),
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalCount: optionalRange(LIMITS.recurringInterval, 'validation.intervalRange'),
    byWeekday: z
      .array(z.number().int().min(LIMITS.weekday.min).max(LIMITS.weekday.max))
      .max(LIMITS.weekdaysPerRule.max),
    dayOfMonth: optionalRange(LIMITS.dayOfMonth, 'validation.dayOfMonth'),
    monthOfYear: optionalRange(LIMITS.monthOfYear, 'validation.monthRequired'),
    startDate: z.string().min(1, 'validation.startDateRequired'),
    endDate: z.string().optional(),
    occurrenceLimit: optionalRange(LIMITS.occurrenceLimit, 'validation.occurrenceLimitRange'),
    autoPost: z.boolean(),
    leadTimeDays: optionalRange(LIMITS.leadTimeDays, 'validation.leadTimeRange'),
  })
  // The three rules below are about which fields a given frequency *requires*;
  // `optionalRange` above has already settled whether each one is well formed.
  .refine((v) => v.frequency !== 'custom' || v.intervalCount.trim() !== '', {
    message: 'validation.intervalRequired',
    path: ['intervalCount'],
  })
  .refine((v) => v.frequency !== 'weekly' || v.byWeekday.length > 0, {
    message: 'validation.weekdayRequired',
    path: ['byWeekday'],
  })
  .refine((v) => v.frequency !== 'yearly' || v.monthOfYear.trim() !== '', {
    message: 'validation.monthRequired',
    path: ['monthOfYear'],
  });

export type RecurringFormValues = z.infer<typeof recurringFormSchema>;

export function defaultRecurringFormValues(accountId: string, todayIso: string): RecurringFormValues {
  return {
    name: '',
    accountId,
    categoryId: '',
    type: 'expense',
    amount: '',
    description: '',
    merchant: '',
    frequency: 'monthly',
    intervalCount: '',
    byWeekday: [],
    dayOfMonth: '',
    monthOfYear: '',
    startDate: todayIso,
    endDate: '',
    occurrenceLimit: '',
    autoPost: false,
    leadTimeDays: '3',
  };
}
