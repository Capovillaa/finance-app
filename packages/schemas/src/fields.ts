import { z } from 'zod/v4';
import { CURRENCY_CODE_LENGTH, LIMITS } from './limits.js';
import {
  DATE_ONLY_PATTERN,
  MONEY_PATTERN,
  hasLettersAndDigits,
  isDateOnlyText,
  isMoneyText,
  isSafeUrl,
} from './patterns.js';

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
 *
 * ## Why some fields carry `.meta()`
 *
 * The OpenAPI document is generated from these schemas by `z.toJSONSchema()`,
 * which can only describe what it understands. A `.refine()` is an arbitrary
 * predicate, so it is dropped **silently** — left alone, `moneyField` would be
 * published as "a string or a number" with no mention of the decimal format at
 * all, and a spec that omits a rule is worse than no spec because it looks
 * authoritative.
 *
 * The rules that JSON Schema *can* express are therefore restated as metadata,
 * and the ones it cannot are written out in prose. Metadata is used rather than
 * a real `z.string().regex(...)` on purpose: moving `MONEY_PATTERN` into the
 * union's string branch would also make the parser reject `" 12.50 "`, which
 * `.refine(... String(value).trim())` accepts today. Publishing the rule must
 * not quietly change which requests the API answers, so the parser below is
 * byte-for-byte the one that shipped before the spec existed.
 *
 * `.meta()` survives `.transform()`, `.optional()` and `.nullish()`, which is
 * what makes this work at all: routes compose `moneySchema`, never `moneyField`.
 */

export const uuidField = z.string().uuid('validation.uuidInvalid');

/**
 * `isDateOnlyText` is stricter than the pattern it starts with — `2025-02-30`
 * matches `YYYY-MM-DD` and is not a day — so the calendar half is described in
 * prose and only the shape is published as a pattern.
 */
export const dateField = z
  .string()
  .refine(isDateOnlyText, 'validation.dateInvalid')
  .meta({
    pattern: DATE_ONLY_PATTERN.source,
    description: 'A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected.',
  });

/** ISO 4217. Case is normalised by the caller, which knows whether it stores or displays. */
export const currencyField = z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode');

export const emailField = z.string().email('validation.emailInvalid').max(LIMITS.email.max);

export const passwordField = z
  .string()
  .min(LIMITS.password.min, 'validation.passwordLength')
  .max(LIMITS.password.max)
  .refine(hasLettersAndDigits, 'validation.passwordComplexity')
  .meta({ description: 'Must contain at least one letter and at least one digit.' });

/**
 * A decimal amount, signed. Accepts a number so a client that JSON-encodes
 * `12.5` is not rejected for being literal-minded, but everything downstream
 * deals in strings — a `number` anywhere in the money path defeats the point of
 * `NUMERIC(19,4)`.
 */
export const moneyField = z
  .union([z.string(), z.number()])
  .refine((value) => isMoneyText(String(value).trim()), 'validation.decimalAmount')
  .meta({
    pattern: MONEY_PATTERN.source,
    description:
      `A decimal amount with at most ${LIMITS.money.integerDigits} integer digits and ` +
      `${LIMITS.money.decimals} decimal places, matching the \`NUMERIC(19,4)\` column it is stored in. ` +
      'Send it as a string: a JSON number is accepted for convenience but loses precision on the way in.',
  });

/** The same, rejecting zero and negatives. */
export const positiveMoneyField = moneyField
  .refine((value) => Number(value) > 0, 'validation.amountPositive')
  .meta({
    pattern: MONEY_PATTERN.source,
    description:
      'A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal ' +
      'held as a string, so it is stated here rather than published as a constraint.',
  });

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
export const reconciliationNotesField = z.string().max(LIMITS.reconciliationNotes.max);
export const timezoneField = z.string().max(LIMITS.timezone.max);
export const localeField = z.string().max(LIMITS.locale.max);
/**
 * `https:` only, unconditionally — including in development. Every viewer's
 * browser fetches whatever this stores (today via `<img src>`, as an avatar),
 * and `javascript:`, `data:` and `file:` all parse as a syntactically valid
 * URL, so the format check on its own lets an attacker-chosen scheme through.
 * See `isSafeUrl` in `patterns.ts` for the finding this closes (M-2).
 */
export const urlField = z
  .string()
  .url('validation.urlInvalid')
  .max(LIMITS.url.max)
  .refine(isSafeUrl, 'validation.urlProtocol')
  .meta({ pattern: '^https://', description: 'An https:// URL. No other scheme is accepted.' });

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
