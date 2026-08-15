import { db, type Executor } from '../../db/client.js';
import type { RecurrenceFrequency, TransactionType } from '../../db/types.js';
import { addDays, today, type DateOnly } from '../../lib/dates.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { abs } from '../../lib/money.js';
import { describeRecurrence, nextOccurrence, occurrencesBetween, type RecurrenceRule } from '../../lib/recurrence.js';
import { recordActivity } from '../activity/service.js';
import { getAccount } from '../accounts/service.js';
import { createTransaction, signedAmount } from '../transactions/service.js';

export interface RecurringRecord {
  id: string;
  name: string;
  accountId: string;
  accountName?: string;
  categoryId: string | null;
  categoryName?: string | null;
  type: Exclude<TransactionType, 'transfer'>;
  amount: string;
  currency: string;
  description: string;
  merchant: string | null;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  byWeekday: number[] | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: DateOnly;
  endDate: DateOnly | null;
  occurrenceLimit: number | null;
  occurrencesCreated: number;
  nextOccurrenceOn: DateOnly | null;
  autoPost: boolean;
  leadTimeDays: number;
  isActive: boolean;
  summary: string;
}

interface RecurringRow {
  id: string;
  name: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: string;
  currency: string;
  description: string;
  merchant: string | null;
  frequency: RecurrenceFrequency;
  interval_count: number;
  by_weekday: number[] | null;
  day_of_month: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  occurrence_limit: number | null;
  occurrences_created: number;
  next_occurrence_on: string | null;
  auto_post: boolean;
  lead_time_days: number;
  is_active: boolean;
  account_name?: string;
  category_name?: string | null;
}

export function toRule(row: RecurringRow): RecurrenceRule {
  return {
    frequency: row.frequency,
    intervalCount: row.interval_count,
    startDate: row.start_date,
    endDate: row.end_date,
    byWeekday: row.by_weekday,
    dayOfMonth: row.day_of_month,
    monthOfYear: row.month_of_year,
    occurrenceLimit: row.occurrence_limit,
    occurrencesCreated: row.occurrences_created,
  };
}

function toRecord(row: RecurringRow): RecurringRecord {
  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    ...(row.account_name !== undefined ? { accountName: row.account_name } : {}),
    categoryId: row.category_id,
    ...(row.category_name !== undefined ? { categoryName: row.category_name } : {}),
    type: row.type as Exclude<TransactionType, 'transfer'>,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    merchant: row.merchant,
    frequency: row.frequency,
    intervalCount: row.interval_count,
    byWeekday: row.by_weekday,
    dayOfMonth: row.day_of_month,
    monthOfYear: row.month_of_year,
    startDate: row.start_date,
    endDate: row.end_date,
    occurrenceLimit: row.occurrence_limit,
    occurrencesCreated: row.occurrences_created,
    nextOccurrenceOn: row.next_occurrence_on,
    autoPost: row.auto_post,
    leadTimeDays: row.lead_time_days,
    isActive: row.is_active,
    summary: describeRecurrence(toRule(row)),
  };
}

export interface CreateRecurringInput {
  workspaceId: string;
  accountId: string;
  categoryId?: string | null;
  name: string;
  type: Exclude<TransactionType, 'transfer'>;
  /** Positive magnitude; the sign is derived from `type`. */
  amount: string;
  description: string;
  merchant?: string | null;
  notes?: string | null;
  frequency: RecurrenceFrequency;
  intervalCount?: number;
  byWeekday?: number[] | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: DateOnly;
  endDate?: DateOnly | null;
  occurrenceLimit?: number | null;
  autoPost?: boolean;
  leadTimeDays?: number;
  createdBy: string;
}

export async function createRecurring(input: CreateRecurringInput): Promise<RecurringRecord> {
  const account = await getAccount(input.workspaceId, input.accountId);
  if (account.isArchived) throw unprocessable('recurring.archivedAccount');

  if (input.categoryId) {
    const category = await db
      .selectFrom('categories')
      .select(['kind'])
      .where('workspace_id', '=', input.workspaceId)
      .where('id', '=', input.categoryId)
      .executeTakeFirst();
    if (!category) throw unprocessable('categories.notInWorkspace');
    if (category.kind !== input.type) {
      throw unprocessable('recurring.kindMismatch', {
        typeKey: `common.transactionKind.${input.type}`,
        kindKey: `common.transactionKind.${category.kind}`,
      });
    }
  }

  const rule: RecurrenceRule = {
    frequency: input.frequency,
    intervalCount: input.intervalCount ?? 1,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    byWeekday: input.byWeekday ?? null,
    dayOfMonth: input.dayOfMonth ?? null,
    monthOfYear: input.monthOfYear ?? null,
    occurrenceLimit: input.occurrenceLimit ?? null,
    occurrencesCreated: 0,
  };

  const next = nextOccurrence(rule, input.startDate);
  if (next === null) throw unprocessable('recurring.noOccurrences');

  const row = await db
    .insertInto('recurring_transactions')
    .values({
      workspace_id: input.workspaceId,
      account_id: input.accountId,
      category_id: input.categoryId ?? null,
      name: input.name.trim(),
      type: input.type,
      amount: signedAmount(input.type, input.amount),
      currency: account.currency,
      description: input.description.trim(),
      merchant: input.merchant ?? null,
      notes: input.notes ?? null,
      frequency: input.frequency,
      interval_count: input.intervalCount ?? 1,
      by_weekday: input.byWeekday ?? null,
      day_of_month: input.dayOfMonth ?? null,
      month_of_year: input.monthOfYear ?? null,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      occurrence_limit: input.occurrenceLimit ?? null,
      next_occurrence_on: next,
      auto_post: input.autoPost ?? false,
      lead_time_days: input.leadTimeDays ?? 3,
      created_by: input.createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.createdBy,
    action: 'recurring.created',
    entityType: 'recurring_transaction',
    entityId: row.id,
    summary: `Scheduled "${row.name}" (${describeRecurrence(rule)})`,
  });

  return toRecord(row as RecurringRow);
}

export async function listRecurring(
  workspaceId: string,
  options: { includeInactive?: boolean } = {},
): Promise<RecurringRecord[]> {
  let query = db
    .selectFrom('recurring_transactions')
    .leftJoin('accounts', 'accounts.id', 'recurring_transactions.account_id')
    .leftJoin('categories', 'categories.id', 'recurring_transactions.category_id')
    .where('recurring_transactions.workspace_id', '=', workspaceId);

  if (!options.includeInactive) query = query.where('recurring_transactions.is_active', '=', true);

  const rows = await query
    .select([
      'recurring_transactions.id as id',
      'recurring_transactions.name as name',
      'recurring_transactions.account_id as account_id',
      'recurring_transactions.category_id as category_id',
      'recurring_transactions.type as type',
      'recurring_transactions.amount as amount',
      'recurring_transactions.currency as currency',
      'recurring_transactions.description as description',
      'recurring_transactions.merchant as merchant',
      'recurring_transactions.frequency as frequency',
      'recurring_transactions.interval_count as interval_count',
      'recurring_transactions.by_weekday as by_weekday',
      'recurring_transactions.day_of_month as day_of_month',
      'recurring_transactions.month_of_year as month_of_year',
      'recurring_transactions.start_date as start_date',
      'recurring_transactions.end_date as end_date',
      'recurring_transactions.occurrence_limit as occurrence_limit',
      'recurring_transactions.occurrences_created as occurrences_created',
      'recurring_transactions.next_occurrence_on as next_occurrence_on',
      'recurring_transactions.auto_post as auto_post',
      'recurring_transactions.lead_time_days as lead_time_days',
      'recurring_transactions.is_active as is_active',
      'accounts.name as account_name',
      'categories.name as category_name',
    ])
    .orderBy('recurring_transactions.next_occurrence_on', 'asc')
    .execute();

  return rows.map((row) => toRecord(row as RecurringRow));
}

export async function getRecurring(workspaceId: string, id: string): Promise<RecurringRecord> {
  const row = await db
    .selectFrom('recurring_transactions')
    .leftJoin('accounts', 'accounts.id', 'recurring_transactions.account_id')
    .leftJoin('categories', 'categories.id', 'recurring_transactions.category_id')
    .selectAll('recurring_transactions')
    .select(['accounts.name as account_name', 'categories.name as category_name'])
    .where('recurring_transactions.workspace_id', '=', workspaceId)
    .where('recurring_transactions.id', '=', id)
    .executeTakeFirst();
  if (!row) throw notFound('resources.recurringTransaction');
  return toRecord(row as RecurringRow);
}

export interface UpdateRecurringInput {
  name?: string;
  amount?: string;
  description?: string;
  merchant?: string | null;
  categoryId?: string | null;
  endDate?: DateOnly | null;
  isActive?: boolean;
  autoPost?: boolean;
  leadTimeDays?: number;
}

export async function updateRecurring(
  workspaceId: string,
  id: string,
  input: UpdateRecurringInput,
  actorId: string,
): Promise<RecurringRecord> {
  const existing = await getRecurring(workspaceId, id);

  await db
    .updateTable('recurring_transactions')
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.amount !== undefined ? { amount: signedAmount(existing.type, input.amount) } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.merchant !== undefined ? { merchant: input.merchant } : {}),
      ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
      ...(input.endDate !== undefined ? { end_date: input.endDate } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.autoPost !== undefined ? { auto_post: input.autoPost } : {}),
      ...(input.leadTimeDays !== undefined ? { lead_time_days: input.leadTimeDays } : {}),
    })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', id)
    .execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'recurring.updated',
    entityType: 'recurring_transaction',
    entityId: id,
    summary: `Updated schedule "${existing.name}"`,
    changes: input as Record<string, unknown>,
  });

  return getRecurring(workspaceId, id);
}

export async function deleteRecurring(workspaceId: string, id: string, actorId: string): Promise<void> {
  const existing = await getRecurring(workspaceId, id);
  await db
    .deleteFrom('recurring_transactions')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', id)
    .execute();

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'recurring.deleted',
    entityType: 'recurring_transaction',
    entityId: id,
    summary: `Deleted schedule "${existing.name}"`,
  });
}

/** Upcoming dates for a schedule, for the "bills ahead" view. */
export async function previewOccurrences(
  workspaceId: string,
  id: string,
  count = 12,
): Promise<DateOnly[]> {
  const row = await db
    .selectFrom('recurring_transactions')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) throw notFound('resources.recurringTransaction');

  const rule = toRule(row as RecurringRow);
  const from = row.next_occurrence_on ?? today('UTC');
  // Two years ahead is plenty for any supported frequency.
  return occurrencesBetween(rule, from, addDays(from, 730), count);
}

export interface MaterializeResult {
  scheduleId: string;
  created: number;
  nextOccurrenceOn: DateOnly | null;
}

/**
 * Creates the transactions a schedule owes up to `through`.
 *
 * `auto_post` decides whether the generated rows count against the balance
 * immediately (`cleared`) or wait for the user to confirm the bill was paid
 * (`scheduled`). Generation is idempotent: an occurrence that already produced a
 * transaction is skipped, so re-running the job cannot double-charge anyone.
 */
export async function materializeSchedule(
  scheduleId: string,
  through: DateOnly,
  executor: Executor = db,
): Promise<MaterializeResult> {
  const row = await executor
    .selectFrom('recurring_transactions')
    .selectAll()
    .where('id', '=', scheduleId)
    .executeTakeFirst();

  if (!row || !row.is_active) return { scheduleId, created: 0, nextOccurrenceOn: null };

  const workspace = await executor
    .selectFrom('workspaces')
    .select(['base_currency'])
    .where('id', '=', row.workspace_id)
    .executeTakeFirstOrThrow();

  const rule = toRule(row as RecurringRow);
  const from = row.next_occurrence_on ?? row.start_date;
  const due = occurrencesBetween(rule, from, through, 120);

  let created = 0;
  let occurrences = row.occurrences_created;

  for (const occurredOn of due) {
    const already = await executor
      .selectFrom('transactions')
      .select('id')
      .where('recurring_transaction_id', '=', scheduleId)
      .where('occurred_on', '=', occurredOn)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (already) continue;

    await createTransaction({
      workspaceId: row.workspace_id,
      baseCurrency: workspace.base_currency,
      accountId: row.account_id,
      categoryId: row.category_id,
      type: row.type as Exclude<TransactionType, 'transfer'>,
      amount: abs(row.amount),
      description: row.description,
      merchant: row.merchant,
      notes: row.notes,
      occurredOn,
      status: row.auto_post ? 'cleared' : 'scheduled',
      recurringTransactionId: scheduleId,
      createdBy: row.created_by ?? '',
      executor,
      skipActivity: true,
    });

    created += 1;
    occurrences += 1;
  }

  const next = nextOccurrence({ ...rule, occurrencesCreated: occurrences }, addDays(through, 1));

  await executor
    .updateTable('recurring_transactions')
    .set({
      occurrences_created: occurrences,
      last_generated_on: due.length > 0 ? due[due.length - 1]! : row.last_generated_on,
      next_occurrence_on: next,
      // A schedule that can never fire again is retired rather than rescanned.
      is_active: next !== null,
    })
    .where('id', '=', scheduleId)
    .execute();

  if (created > 0) {
    logger.info({ scheduleId, created, next }, 'Materialised recurring transactions');
  }

  return { scheduleId, created, nextOccurrenceOn: next };
}

/** Every schedule due on or before `through`, across all workspaces. */
export async function dueSchedules(through: DateOnly, limit = 500): Promise<string[]> {
  const rows = await db
    .selectFrom('recurring_transactions')
    .select('id')
    .where('is_active', '=', true)
    .where('next_occurrence_on', 'is not', null)
    .where('next_occurrence_on', '<=', through)
    .orderBy('next_occurrence_on', 'asc')
    .limit(limit)
    .execute();

  return rows.map((r) => r.id);
}

/** Confirms a scheduled bill was actually paid. */
export async function confirmScheduledTransaction(
  workspaceId: string,
  transactionId: string,
  actorId: string,
): Promise<void> {
  const result = await db
    .updateTable('transactions')
    .set({ status: 'cleared' })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', transactionId)
    .where('status', '=', 'scheduled')
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0) === 0) throw notFound('resources.scheduledTransaction');

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'transaction.confirmed',
    entityType: 'transaction',
    entityId: transactionId,
    summary: 'Marked a scheduled bill as paid',
  });
}
