import { z } from 'zod';

/**
 * Client-side mirror of `createAccountSchema` / `updateAccountSchema` in
 * `apps/api/src/modules/accounts/routes.ts`. Kept in sync by hand until the
 * shared-schema package lands (CLAUDE.md, next task 3); any server rejection
 * still surfaces through `getFieldErrors`.
 */
export const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'loan'] as const;

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const ACCOUNT_TYPE_LABEL_KEYS: Record<AccountTypeValue, string> = {
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
  .refine((v) => v === '' || /^-?\d{1,15}(\.\d{1,4})?$/.test(v), 'validation.decimalAmount');

const dayOfMonthSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 31), 'validation.dayOfMonth');

export const accountFormSchema = z.object({
  name: z.string().min(1, 'validation.nameRequired').max(120),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().length(3, 'validation.currencyCode').toUpperCase(),
  institution: z.string().max(120).optional(),
  initialBalance: moneyInputSchema,
  creditLimit: moneyInputSchema,
  statementDay: dayOfMonthSchema,
  dueDay: dayOfMonthSchema,
  color: z.string().max(20).optional(),
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
