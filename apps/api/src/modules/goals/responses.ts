import { GOAL_CATEGORIES, GOAL_STATUSES } from '@finance/schemas';
import { z } from 'zod/v4';
import { component, currencyCode, dateOnly, integer, money, percent, timestamp, uuid } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * Note that **adding a contribution returns the goal, not the contribution**:
 * the point of the call is the new `currentAmount`, and everything derived from
 * it — `progressPercent`, `offTrack`, `requiredMonthlyContribution` — moves with
 * it. The contributions themselves are only listed as part of `GET /goals/:id`.
 */

export const goalSchema = component(
  'Goal',
  z.object({
    id: uuid,
    name: z.string(),
    description: z.string().nullable(),
    category: z.enum(GOAL_CATEGORIES),
    targetAmount: money,
    currentAmount: money,
    remainingAmount: money,
    progressPercent: percent,
    currency: currencyCode,
    targetDate: dateOnly.nullable(),
    accountId: uuid.nullable().describe('The account the goal is saved into, when one was named.'),
    status: z.enum(GOAL_STATUSES),
    priority: integer,
    color: z.string().nullable(),
    achievedAt: timestamp.nullable(),
    requiredMonthlyContribution: money
      .nullable()
      .describe('What it now takes each month to hit the target by `targetDate`. Null without a deadline.'),
    daysRemaining: integer.nullable(),
    offTrack: z.boolean().describe('True when the goal is behind the pace its deadline implies.'),
    createdAt: timestamp,
  }),
);

export const goalContributionSchema = component(
  'GoalContribution',
  z.object({
    id: uuid,
    amount: money,
    occurredOn: dateOnly,
    note: z.string().nullable(),
    transactionId: uuid.nullable().describe('Set when the contribution was recorded against a ledger row.'),
    createdByName: z.string().nullable(),
    createdAt: timestamp,
  }),
);

export const goalListResponse = z.object({ goals: z.array(goalSchema) });

export const goalResponse = z.object({ goal: goalSchema });

export const goalDetailResponse = z
  .object({ goal: goalSchema, contributions: z.array(goalContributionSchema) })
  .describe('The goal and its contribution history, newest first.');
