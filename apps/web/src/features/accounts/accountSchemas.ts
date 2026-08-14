import {
  ACCOUNT_TYPES,
  CURRENCY_CODE_LENGTH,
  LIMITS,
  isMoneyText,
  isWholeNumberInRange,
  type AccountType,
} from '@finance/schemas';
import { z } from 'zod';

/**
 * The account create/edit form.
 *
 * The type list and every bound come from `@finance/schemas`, which
 * `apps/api/src/modules/accounts/routes.ts` builds its request schema from too.
 * What is local is the form's own shape: each numeric field arrives as text and
 * an untouched one is `''`, which is why the rules below are "empty, or valid"
 * rather than the server's "absent, or valid".
 */
export { ACCOUNT_TYPES, type AccountType as AccountTypeValue };

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const ACCOUNT_TYPE_LABEL_KEYS: Record<AccountType, string> = {
  checking: 'accounts.type.checking',
  savings: 'accounts.type.savings',
  credit_card: 'accounts.type.creditCard',
  investment: 'accounts.type.investment',
  cash: 'accounts.type.cash',
  loan: 'accounts.type.loan',
};

const moneyInputSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || isMoneyText(v), 'validation.decimalAmount');

const dayOfMonthSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || isWholeNumberInRange(v, LIMITS.dayOfMonth.min, LIMITS.dayOfMonth.max),
    'validation.dayOfMonth',
  );

export const accountFormSchema = z.object({
  name: z.string().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode').toUpperCase(),
  institution: z.string().max(LIMITS.institution.max).optional(),
  initialBalance: moneyInputSchema,
  creditLimit: moneyInputSchema,
  statementDay: dayOfMonthSchema,
  dueDay: dayOfMonthSchema,
  color: z.string().max(LIMITS.color.max).optional(),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

export const DEFAULT_ACCOUNT_FORM_VALUES: AccountFormValues = {
  name: '',
  type: 'checking',
  currency: 'USD',
  institution: '',
  initialBalance: '',
  creditLimit: '',
  statementDay: '',
  dueDay: '',
  color: '',
};
