import { LIMITS } from './limits.js';

/**
 * The catalogue key a rejected field carries.
 *
 * A Zod message is a plain string fixed when the schema is built, long before
 * either side knows what language to answer in — so the schemas carry a *key*
 * and each side resolves it at the last moment: the web client in
 * `lib/validation.ts`, the API in its error handler. Typing the union means a
 * key that is not in the catalogues is a compile error rather than a field that
 * silently displays `validation.someTypo` to a user.
 */
export type ValidationKey =
  | 'validation.required'
  | 'validation.nameRequired'
  | 'validation.descriptionRequired'
  | 'validation.dateRequired'
  | 'validation.dateInvalid'
  | 'validation.dateRangeOrder'
  | 'validation.startDateRequired'
  | 'validation.endDateRequired'
  | 'validation.monthRequired'
  | 'validation.weekdayRequired'
  | 'validation.dayOfMonth'
  | 'validation.intervalRequired'
  | 'validation.intervalRange'
  | 'validation.occurrenceLimitRange'
  | 'validation.leadTimeRange'
  | 'validation.amountRequired'
  | 'validation.amountPositive'
  | 'validation.decimalAmount'
  | 'validation.currencyCode'
  | 'validation.percentRange'
  | 'validation.priorityRange'
  | 'validation.categoryRequired'
  | 'validation.accountRequired'
  | 'validation.fromAccountRequired'
  | 'validation.toAccountRequired'
  | 'validation.differentAccounts'
  | 'validation.atLeastOneLine'
  | 'validation.maxBudgetLines'
  | 'validation.maxTags'
  | 'validation.emailRequired'
  | 'validation.emailInvalid'
  | 'validation.urlInvalid'
  | 'validation.uuidInvalid'
  | 'validation.uuidList'
  | 'validation.passwordRequired'
  | 'validation.passwordLength'
  | 'validation.passwordComplexity'
  | 'validation.passwordsDiffer'
  | 'validation.confirmPassword'
  | 'validation.confirmNewPassword'
  | 'validation.currentPasswordRequired'
  | 'validation.languageRequired';

/**
 * Interpolation values for the keys whose wording quotes a bound.
 *
 * "Enter 1–1000" is a better message than "out of range", but writing those
 * numbers into thirty-odd catalogue entries would put the bound back in the
 * places this package exists to empty. So the catalogue entry says
 * `{{min}}`–`{{max}}` and the numbers come from `LIMITS` at the moment the
 * message is rendered. Change a bound and every translation follows it.
 *
 * The params for a given key are constant, which is why they can live in a
 * table instead of travelling with the message: a Zod message is only ever a
 * string, and neither resolver has any other way to receive them.
 */
export const VALIDATION_PARAMS: Partial<Record<ValidationKey, Record<string, number>>> = {
  'validation.dayOfMonth': { min: LIMITS.dayOfMonth.min, max: LIMITS.dayOfMonth.max },
  'validation.intervalRange': { min: LIMITS.recurringInterval.min, max: LIMITS.recurringInterval.max },
  'validation.occurrenceLimitRange': { min: LIMITS.occurrenceLimit.min, max: LIMITS.occurrenceLimit.max },
  'validation.leadTimeRange': { min: LIMITS.leadTimeDays.min, max: LIMITS.leadTimeDays.max },
  'validation.decimalAmount': { decimals: LIMITS.money.decimals },
  'validation.percentRange': { min: LIMITS.percent.min, max: LIMITS.percent.max },
  'validation.priorityRange': { min: LIMITS.priority.min, max: LIMITS.priority.max },
  'validation.maxBudgetLines': { max: LIMITS.budgetLines.max },
  'validation.maxTags': { max: LIMITS.tagsPerTransaction.max },
  'validation.passwordLength': { min: LIMITS.password.min },
};

/** Narrows an arbitrary message back to a key, for a resolver reading an issue. */
export function validationParamsFor(message: string): Record<string, number> | undefined {
  return VALIDATION_PARAMS[message as ValidationKey];
}
