import { z } from 'zod';

/**
 * Client-side mirror of the goal schemas in
 * `apps/api/src/modules/goals/routes.ts`.
 */
export const GOAL_CATEGORIES = [
  'emergency_fund',
  'vacation',
  'car',
  'house',
  'education',
  'retirement',
  'investment',
  'other',
] as const;
export type GoalCategoryValue = (typeof GOAL_CATEGORIES)[number];

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const GOAL_CATEGORY_LABEL_KEYS: Record<GoalCategoryValue, string> = {
  emergency_fund: 'goals.category.emergencyFund',
  vacation: 'goals.category.vacation',
  car: 'goals.category.car',
  house: 'goals.category.house',
  education: 'goals.category.education',
  retirement: 'goals.category.retirement',
  investment: 'goals.category.investment',
  other: 'goals.category.other',
};

const positiveAmountSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .refine((v) => /^\d{1,15}(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'validation.amountPositive');

export const goalFormSchema = z.object({
  name: z.string().min(1, 'validation.nameRequired').max(120),
  description: z.string().max(1000).optional(),
  category: z.enum(GOAL_CATEGORIES),
  targetAmount: positiveAmountSchema,
  currency: z.string().length(3, 'validation.currencyCode').toUpperCase(),
  targetDate: z.string().optional(),
  accountId: z.string().optional(),
  priority: z.string().refine((v) => /^[1-5]$/.test(v), 'validation.priority1to5'),
  color: z.string().max(20).optional(),
});

export type GoalFormValues = z.infer<typeof goalFormSchema>;

export function defaultGoalFormValues(currency: string): GoalFormValues {
  return {
    name: '',
    description: '',
    category: 'other',
    targetAmount: '',
    currency,
    targetDate: '',
    accountId: '',
    priority: '3',
    color: '',
  };
}

export const contributionFormSchema = z.object({
  amount: positiveAmountSchema,
  occurredOn: z.string().min(1, 'validation.dateRequired'),
  note: z.string().max(300).optional(),
});
export type ContributionFormValues = z.infer<typeof contributionFormSchema>;
