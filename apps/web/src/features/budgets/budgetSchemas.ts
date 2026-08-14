import {
  BUDGET_PERIODS,
  CURRENCY_CODE_LENGTH,
  LIMITS,
  isPositiveMoneyText,
  isWholeNumberInRange,
  type BudgetPeriod,
} from '@finance/schemas';
import { z } from 'zod';

/**
 * The budget create/edit form.
 *
 * Periods, bounds and the cap on how many category lines one budget may carry
 * come from `@finance/schemas`, so this form and
 * `apps/api/src/modules/budgets/routes.ts` enforce the same rules. Budgets are
 * only ever set on expense categories — the server rejects an income category
 * outright, which is a lookup the client cannot do and so does not attempt.
 */
export { BUDGET_PERIODS, type BudgetPeriod as BudgetPeriodValue };

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const BUDGET_PERIOD_LABEL_KEYS: Record<BudgetPeriod, string> = {
  monthly: 'budgets.period.monthly',
  quarterly: 'budgets.period.quarterly',
  yearly: 'budgets.period.yearly',
  custom: 'budgets.period.custom',
};

const positiveAmountSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .refine(isPositiveMoneyText, 'validation.amountPositive');

const lineFormSchema = z.object({
  categoryId: z.string().min(1, 'validation.categoryRequired'),
  limitAmount: positiveAmountSchema,
  includeSubcategories: z.boolean(),
  alertThresholdPercent: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || isWholeNumberInRange(v, LIMITS.percent.min, LIMITS.percent.max),
      'validation.percentRange',
    ),
});

export const budgetFormSchema = z
  .object({
    name: z.string().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max),
    period: z.enum(BUDGET_PERIODS),
    startDate: z.string().min(1, 'validation.startDateRequired'),
    endDate: z.string(),
    currency: z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode').toUpperCase(),
    rollover: z.boolean(),
    lines: z
      .array(lineFormSchema)
      .min(LIMITS.budgetLines.min, 'validation.atLeastOneLine')
      .max(LIMITS.budgetLines.max, 'validation.maxBudgetLines'),
  })
  .refine((v) => v.period !== 'custom' || v.endDate.trim() !== '', {
    message: 'validation.endDateRequired',
    path: ['endDate'],
  });

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;
export type BudgetLineFormValues = BudgetFormValues['lines'][number];

export function emptyBudgetLine(): BudgetLineFormValues {
  return { categoryId: '', limitAmount: '', includeSubcategories: true, alertThresholdPercent: '80' };
}

export function defaultBudgetFormValues(currency: string, todayIso: string): BudgetFormValues {
  return {
    name: '',
    period: 'monthly',
    startDate: todayIso,
    endDate: '',
    currency,
    rollover: false,
    lines: [emptyBudgetLine()],
  };
}

export const reviseLineSchema = z.object({
  newLimit: positiveAmountSchema,
  reason: z.string().max(LIMITS.reason.max).optional(),
});
export type ReviseLineValues = z.infer<typeof reviseLineSchema>;

export const addLineSchema = lineFormSchema;
export type AddLineValues = z.infer<typeof addLineSchema>;
