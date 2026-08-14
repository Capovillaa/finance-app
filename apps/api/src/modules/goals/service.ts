import { db } from '../../db/client.js';
import type { GoalStatus } from '../../db/types.js';
import { differenceInDays, today, type DateOnly } from '../../lib/dates.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { compare, percentOf, subtract, Decimal } from '../../lib/money.js';
import { recordActivity } from '../activity/service.js';

export interface GoalRecord {
  id: string;
  name: string;
  description: string | null;
  category: string;
  targetAmount: string;
  currentAmount: string;
  remainingAmount: string;
  progressPercent: number;
  currency: string;
  targetDate: DateOnly | null;
  accountId: string | null;
  status: GoalStatus;
  priority: number;
  color: string | null;
  achievedAt: Date | null;
  /** Contribution per month needed to hit the target by `targetDate`. */
  requiredMonthlyContribution: string | null;
  daysRemaining: number | null;
  /** True when the goal is behind the pace implied by its deadline. */
  offTrack: boolean;
  createdAt: Date;
}

interface GoalRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  target_amount: string;
  current_amount: string;
  currency: string;
  target_date: string | null;
  account_id: string | null;
  status: GoalStatus;
  priority: number;
  color: string | null;
  achieved_at: Date | null;
  created_at: Date;
}

function toRecord(row: GoalRow, asOf: DateOnly): GoalRecord {
  const remaining = subtract(row.target_amount, row.current_amount);
  const progressPercent = percentOf(row.current_amount, row.target_amount);
  const daysRemaining = row.target_date ? differenceInDays(asOf, row.target_date) : null;

  let requiredMonthly: string | null = null;
  if (row.target_date && daysRemaining !== null && compare(remaining, '0') > 0) {
    const months = Math.max(1, Math.ceil(daysRemaining / 30));
    requiredMonthly = new Decimal(remaining).div(months).toDecimalPlaces(4).toFixed(4);
  }

  // Behind pace: less progress than the fraction of the timeline already spent.
  let offTrack = false;
  if (row.status === 'active' && row.target_date && daysRemaining !== null && daysRemaining >= 0) {
    const totalDays = differenceInDays(row.created_at.toISOString().slice(0, 10), row.target_date);
    if (totalDays > 0) {
      const elapsedFraction = (totalDays - daysRemaining) / totalDays;
      offTrack = progressPercent / 100 < elapsedFraction - 0.05;
    }
  } else if (row.status === 'active' && daysRemaining !== null && daysRemaining < 0) {
    offTrack = compare(remaining, '0') > 0;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    targetAmount: row.target_amount,
    currentAmount: row.current_amount,
    remainingAmount: compare(remaining, '0') > 0 ? remaining : '0.0000',
    progressPercent,
    currency: row.currency,
    targetDate: row.target_date,
    accountId: row.account_id,
    status: row.status,
    priority: row.priority,
    color: row.color,
    achievedAt: row.achieved_at,
    requiredMonthlyContribution: requiredMonthly,
    daysRemaining,
    offTrack,
    createdAt: row.created_at,
  };
}

export interface CreateGoalInput {
  workspaceId: string;
  name: string;
  description?: string | null;
  category?: string;
  targetAmount: string;
  currency: string;
  targetDate?: DateOnly | null;
  accountId?: string | null;
  priority?: number;
  color?: string | null;
  createdBy: string;
}

export async function createGoal(input: CreateGoalInput): Promise<GoalRecord> {
  if (compare(input.targetAmount, '0') <= 0) throw unprocessable('goals.targetMustBePositive');
  if (input.targetDate && input.targetDate < today('UTC')) {
    throw unprocessable('goals.targetDateInFuture');
  }

  const row = await db
    .insertInto('financial_goals')
    .values({
      workspace_id: input.workspaceId,
      name: input.name.trim(),
      description: input.description ?? null,
      category: input.category ?? 'other',
      target_amount: input.targetAmount,
      currency: input.currency.toUpperCase(),
      target_date: input.targetDate ?? null,
      account_id: input.accountId ?? null,
      priority: input.priority ?? 3,
      color: input.color ?? null,
      created_by: input.createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.createdBy,
    action: 'goal.created',
    entityType: 'financial_goal',
    entityId: row.id,
    summary: `Created goal "${row.name}" targeting ${row.currency} ${row.target_amount}`,
  });

  return toRecord(row as GoalRow, today('UTC'));
}

export async function listGoals(
  workspaceId: string,
  options: { status?: GoalStatus } = {},
): Promise<GoalRecord[]> {
  let query = db.selectFrom('financial_goals').selectAll().where('workspace_id', '=', workspaceId);
  if (options.status) query = query.where('status', '=', options.status);

  const rows = await query.orderBy('priority', 'asc').orderBy('created_at', 'desc').execute();
  const asOf = today('UTC');
  return rows.map((row) => toRecord(row as GoalRow, asOf));
}

export async function getGoal(workspaceId: string, goalId: string): Promise<GoalRecord> {
  const row = await db
    .selectFrom('financial_goals')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', goalId)
    .executeTakeFirst();
  if (!row) throw notFound('resources.goal');
  return toRecord(row as GoalRow, today('UTC'));
}

export interface UpdateGoalInput {
  name?: string;
  description?: string | null;
  targetAmount?: string;
  targetDate?: DateOnly | null;
  status?: GoalStatus;
  priority?: number;
  color?: string | null;
  accountId?: string | null;
}

export async function updateGoal(
  workspaceId: string,
  goalId: string,
  input: UpdateGoalInput,
  actorId: string,
): Promise<GoalRecord> {
  const existing = await getGoal(workspaceId, goalId);

  await db
    .updateTable('financial_goals')
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.targetAmount !== undefined ? { target_amount: input.targetAmount } : {}),
      ...(input.targetDate !== undefined ? { target_date: input.targetDate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.accountId !== undefined ? { account_id: input.accountId } : {}),
      ...(input.status === 'achieved' ? { achieved_at: new Date() } : {}),
    })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', goalId)
    .execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'goal.updated',
    entityType: 'financial_goal',
    entityId: goalId,
    summary: `Updated goal "${existing.name}"`,
    changes: input as Record<string, unknown>,
  });

  return getGoal(workspaceId, goalId);
}

export async function deleteGoal(workspaceId: string, goalId: string, actorId: string): Promise<void> {
  const existing = await getGoal(workspaceId, goalId);
  await db
    .deleteFrom('financial_goals')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', goalId)
    .execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'goal.deleted',
    entityType: 'financial_goal',
    entityId: goalId,
    summary: `Deleted goal "${existing.name}"`,
  });
}

export interface ContributionInput {
  workspaceId: string;
  goalId: string;
  amount: string;
  occurredOn?: DateOnly;
  transactionId?: string | null;
  note?: string | null;
  createdBy: string;
}

/**
 * Adds to a goal's balance. `current_amount` is maintained by a database
 * trigger, so a contribution and the goal total can never disagree.
 */
export async function addContribution(input: ContributionInput): Promise<GoalRecord> {
  const goal = await getGoal(input.workspaceId, input.goalId);
  if (goal.status === 'cancelled') throw unprocessable('goals.cancelledGoal');

  await db
    .insertInto('goal_contributions')
    .values({
      goal_id: input.goalId,
      workspace_id: input.workspaceId,
      amount: input.amount,
      occurred_on: input.occurredOn ?? today('UTC'),
      transaction_id: input.transactionId ?? null,
      note: input.note ?? null,
      created_by: input.createdBy,
    })
    .execute();

  const updated = await getGoal(input.workspaceId, input.goalId);

  // Reaching the target closes the goal automatically.
  if (updated.status === 'active' && compare(updated.currentAmount, updated.targetAmount) >= 0) {
    await db
      .updateTable('financial_goals')
      .set({ status: 'achieved', achieved_at: new Date() })
      .where('id', '=', input.goalId)
      .execute();

    await recordActivity({
      workspaceId: input.workspaceId,
      actorUserId: input.createdBy,
      action: 'goal.achieved',
      entityType: 'financial_goal',
      entityId: input.goalId,
      summary: `Reached goal "${updated.name}"`,
    });

    return getGoal(input.workspaceId, input.goalId);
  }

  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.createdBy,
    action: 'goal.contributed',
    entityType: 'financial_goal',
    entityId: input.goalId,
    summary: `Contributed ${goal.currency} ${input.amount} to "${goal.name}"`,
  });

  return updated;
}

export async function listContributions(workspaceId: string, goalId: string) {
  const rows = await db
    .selectFrom('goal_contributions')
    .leftJoin('users', 'users.id', 'goal_contributions.created_by')
    .select([
      'goal_contributions.id as id',
      'goal_contributions.amount as amount',
      'goal_contributions.occurred_on as occurred_on',
      'goal_contributions.note as note',
      'goal_contributions.transaction_id as transaction_id',
      'goal_contributions.created_at as created_at',
      'users.full_name as created_by_name',
    ])
    .where('goal_contributions.workspace_id', '=', workspaceId)
    .where('goal_contributions.goal_id', '=', goalId)
    .orderBy('goal_contributions.occurred_on', 'desc')
    .orderBy('goal_contributions.created_at', 'desc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    occurredOn: row.occurred_on,
    note: row.note,
    transactionId: row.transaction_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }));
}

export async function deleteContribution(workspaceId: string, contributionId: string): Promise<void> {
  const result = await db
    .deleteFrom('goal_contributions')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', contributionId)
    .executeTakeFirst();
  if (Number(result.numDeletedRows ?? 0) === 0) throw notFound('resources.contribution');
}
