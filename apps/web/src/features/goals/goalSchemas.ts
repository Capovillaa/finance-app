import {
  CURRENCY_CODE_LENGTH,
  GOAL_CATEGORIES,
  LIMITS,
  isPositiveMoneyText,
  isWholeNumberInRange,
  type GoalCategory,
} from '@finance/schemas';
import { z } from 'zod';

/**
 * The goal create/edit form and its contributions dialog.
 *
 * Categories and bounds come from `@finance/schemas`, shared with
 * `apps/api/src/modules/goals/routes.ts`. Priority is a text field here and a
 * number on the wire, which is the one difference the form has to carry itself.
 */
export { GOAL_CATEGORIES, type GoalCategory as GoalCategoryValue };

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const GOAL_CATEGORY_LABEL_KEYS: Record<GoalCategory, string> = {
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
  .refine(isPositiveMoneyText, 'validation.amountPositive');

export const goalFormSchema = z.object({
  name: z.string().min(LIMITS.name.min, 'validation.nameRequired').max(LIMITS.name.max),
  description: z.string().max(LIMITS.longDescription.max).optional(),
  category: z.enum(GOAL_CATEGORIES),
  targetAmount: positiveAmountSchema,
  currency: z.string().length(CURRENCY_CODE_LENGTH, 'validation.currencyCode').toUpperCase(),
  targetDate: z.string().optional(),
  accountId: z.string().optional(),
  priority: z
    .string()
    .refine(
      (v) => isWholeNumberInRange(v, LIMITS.priority.min, LIMITS.priority.max),
      'validation.priorityRange',
    ),
  color: z.string().max(LIMITS.color.max).optional(),
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
  note: z.string().max(LIMITS.goalContributionNote.max).optional(),
});
export type ContributionFormValues = z.infer<typeof contributionFormSchema>;
