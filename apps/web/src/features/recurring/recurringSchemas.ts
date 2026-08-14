import { z } from 'zod';

/**
 * Client-side mirror of the recurring-transaction schemas in
 * `apps/api/src/modules/recurring/routes.ts`. The schedule shape (frequency,
 * weekday, day-of-month, interval) is only settable at creation — the PATCH
 * schema on the server does not accept it, so `RecurringFormDialog` disables
 * those fields when editing.
 */
export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
export type RecurringFrequencyValue = (typeof RECURRING_FREQUENCIES)[number];

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const FREQUENCY_LABEL_KEYS: Record<RecurringFrequencyValue, string> = {
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
  .refine((v) => /^\d{1,15}(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'validation.amountPositive');

const dayOfMonthSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 31), 'validation.dayOfMonth');

export const recurringFormSchema = z
  .object({
    name: z.string().min(1, 'validation.nameRequired').max(120),
    accountId: z.string().min(1, 'validation.accountRequired'),
    categoryId: z.string(),
    type: z.enum(['income', 'expense']),
    amount: amountInputSchema,
    description: z.string().min(1, 'validation.descriptionRequired').max(200),
    merchant: z.string().max(120).optional(),
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalCount: z.string().trim(),
    byWeekday: z.array(z.number().int().min(0).max(6)),
    dayOfMonth: dayOfMonthSchema,
    monthOfYear: z.string().trim(),
    startDate: z.string().min(1, 'validation.startDateRequired'),
    endDate: z.string().optional(),
    occurrenceLimit: z.string().trim(),
    autoPost: z.boolean(),
    leadTimeDays: z.string().trim().refine((v) => v === '' || /^\d{1,2}$/.test(v), 'validation.wholeDays'),
  })
  .refine((v) => v.frequency !== 'custom' || /^\d+$/.test(v.intervalCount), {
    message: 'validation.intervalRequired',
    path: ['intervalCount'],
  })
  .refine((v) => v.frequency !== 'weekly' || v.byWeekday.length > 0, {
    message: 'validation.weekdayRequired',
    path: ['byWeekday'],
  })
  .refine((v) => v.frequency !== 'yearly' || /^\d{1,2}$/.test(v.monthOfYear), {
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
