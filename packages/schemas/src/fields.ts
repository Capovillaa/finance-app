import { z } from 'zod';
import { CURRENCY_CODE_LENGTH, LIMITS } from './limits.js';
import { hasLettersAndDigits, isDateOnlyText, isMoneyText } from './patterns.js';

/**
 * The API's request fields, as Zod schemas.
 *
 * These describe a **JSON body**: an amount may arrive as a string or a number,
 * an absent field is `undefined`, and an id is a real UUID. A form field is a
 * different animal — always a string, absent means `''`, and an id is whatever
 * the `<Select>` last held — so the web client composes its own schemas from
 * `limits.ts` and `patterns.ts` rather than reusing the objects below. What the
 * two share is every bound and every shape, which is where they used to drift.
 *
 * Nothing here transforms. `moneyField` deliberately stops at "this is a valid
 * decimal string": normalising it into the canonical `NUMERIC(19,4)` form needs
 * `decimal.js`, and pulling that into a package the browser bundles would add a
 * money library to the client for the sake of a value the client never stores.
 * The API applies its own `.transform(money)` on top — see
 * `apps/api/src/modules/shared/schemas.ts`.
 */

export const uuidField = z.string().uuid('validation.uuidInvalid');

export const dateField = z.string().refine(isDateOnlyText, 'validation.dateInvalid');

/** ISO 4217. Case is normalised by the caller, which knows whether it stores or displays. */
export const currencyField = z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode');

export const emailField = z.string().email('validation.emailInvalid').max(LIMITS.email.max);

export const passwordField = z
  .string()
  .min(LIMITS.password.min, 'validation.passwordLength')
  .max(LIMITS.password.max)
  .refine(hasLettersAndDigits, 'validation.passwordComplexity');

/**
 * A decimal amount, signed. Accepts a number so a client that JSON-encodes
 * `12.5` is not rejected for being literal-minded, but everything downstream
 * deals in strings — a `number` anywhere in the money path defeats the point of
 * `NUMERIC(19,4)`.
 */
export const moneyField = z
  .union([z.string(), z.number()])
  .refine((value) => isMoneyText(String(value).trim()), 'validation.decimalAmount');

/** The same, rejecting zero and negatives. */
export const positiveMoneyField = moneyField.refine(
  (value) => Number(value) > 0,
  'validation.amountPositive',
);

export const nameField = z.string().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max);

export const descriptionField = z
  .string()
  .min(LIMITS.description.min, 'validation.descriptionRequired')
  .max(LIMITS.description.max);

export const longDescriptionField = z.string().max(LIMITS.longDescription.max);
export const notesField = z.string().max(LIMITS.notes.max);
export const merchantField = z.string().max(LIMITS.merchant.max);
export const institutionField = z.string().max(LIMITS.institution.max);
export const colorField = z.string().max(LIMITS.color.max);
export const iconField = z.string().max(LIMITS.icon.max);
export const reasonField = z.string().max(LIMITS.reason.max);
export const timezoneField = z.string().max(LIMITS.timezone.max);
export const localeField = z.string().max(LIMITS.locale.max);
export const urlField = z.string().url('validation.urlInvalid').max(LIMITS.url.max);

export const tagNameField = z
  .string()
  .min(LIMITS.tagName.min, 'validation.nameRequired')
  .max(LIMITS.tagName.max);

/** A whole number inside a closed range, carrying the key that quotes that range. */
export function intRange(
  bounds: { readonly min: number; readonly max: number },
  message: string,
): z.ZodNumber {
  return z.number().int().min(bounds.min, message).max(bounds.max, message);
}

export const dayOfMonthField = intRange(LIMITS.dayOfMonth, 'validation.dayOfMonth');
export const monthOfYearField = intRange(LIMITS.monthOfYear, 'validation.monthRequired');
export const weekdayField = intRange(LIMITS.weekday, 'validation.weekdayRequired');
export const percentField = intRange(LIMITS.percent, 'validation.percentRange');
export const priorityField = intRange(LIMITS.priority, 'validation.priorityRange');
export const recurringIntervalField = intRange(LIMITS.recurringInterval, 'validation.intervalRange');
export const occurrenceLimitField = intRange(LIMITS.occurrenceLimit, 'validation.occurrenceLimitRange');
export const leadTimeDaysField = intRange(LIMITS.leadTimeDays, 'validation.leadTimeRange');
