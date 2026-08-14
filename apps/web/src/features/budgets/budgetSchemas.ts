import { z } from 'zod';

/**
 * Client-side mirror of the create-budget body in
 * `apps/api/src/modules/budgets/routes.ts`. Budgets are only ever set on
 * expense categories — the server rejects an income category outright.
 */
export const BUDGET_PERIODS = ['monthly', 'quarterly', 'yearly', 'custom'] as const;
export type BudgetPeriodValue = (typeof BUDGET_PERIODS)[number];

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const BUDGET_PERIOD_LABEL_KEYS: Record<BudgetPeriodValue, string> = {
  monthly: 'budgets.period.monthly',
  quarterly: 'budgets.period.quarterly',
  yearly: 'budgets.period.yearly',
  custom: 'budgets.period.custom',
};

const positiveAmountSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .refine((v) => /^\d{1,15}(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'validation.amountPositive');

const lineFormSchema = z.object({
  categoryId: z.string().min(1, 'validation.categoryRequired'),
  limitAmount: positiveAmountSchema,
  includeSubcategories: z.boolean(),
  alertThresholdPercent: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100), 'validation.percent1to100'),
});

export const budgetFormSchema = z
  .object({
    name: z.string().min(1, 'validation.nameRequired').max(120),
    period: z.enum(BUDGET_PERIODS),
    startDate: z.string().min(1, 'validation.startDateRequired'),
    endDate: z.string(),
    currency: z.string().length(3, 'validation.currencyCode').toUpperCase(),
    rollover: z.boolean(),
    lines: z.array(lineFormSchema).min(1, 'validation.atLeastOneLine'),
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
  reason: z.string().max(300).optional(),
});
export type ReviseLineValues = z.infer<typeof reviseLineSchema>;

export const addLineSchema = lineFormSchema;
export type AddLineValues = z.infer<typeof addLineSchema>;
