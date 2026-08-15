import { randomUUID } from 'node:crypto';
import { sql, type ExpressionBuilder } from 'kysely';
import { db, type Executor } from '../../db/client.js';
import type { Database, TransactionStatus, TransactionType } from '../../db/types.js';
import { today, type DateOnly } from '../../lib/dates.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { buildPage, offsetOf, type Page, type Pagination } from '../../lib/http.js';
import { abs, negate, splitByWeights, splitEvenly, sum as sumMoney } from '../../lib/money.js';
import { invalidateWorkspaceCache } from '../../lib/redis.js';
import { recordActivity } from '../activity/service.js';
import { getAccount } from '../accounts/service.js';
import { convertAmount } from '../currencies/service.js';
import { descendantIds } from '../categories/service.js';

export interface TransactionRecord {
  id: string;
  accountId: string;
  accountName?: string;
  categoryId: string | null;
  categoryName?: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  currency: string;
  baseAmount: string;
  exchangeRate: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  occurredOn: DateOnly;
  transferGroupId: string | null;
  counterAccountId: string | null;
  recurringTransactionId: string | null;
  isReconciled: boolean;
  paidByUserId: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  /** Non-null on a soft-deleted row, which only `includeDeleted` returns. */
  deletedAt: Date | null;
}

interface TransactionRow {
  id: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  currency: string;
  base_amount: string;
  exchange_rate: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  occurred_on: string;
  transfer_group_id: string | null;
  counter_account_id: string | null;
  recurring_transaction_id: string | null;
  is_reconciled: boolean;
  paid_by_user_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  account_name?: string;
  category_name?: string | null;
  created_by_name?: string | null;
}

function toRecord(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    ...(row.account_name !== undefined ? { accountName: row.account_name } : {}),
    categoryId: row.category_id,
    ...(row.category_name !== undefined ? { categoryName: row.category_name } : {}),
    type: row.type,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    baseAmount: row.base_amount,
    exchangeRate: row.exchange_rate,
    description: row.description,
    merchant: row.merchant,
    notes: row.notes,
    occurredOn: row.occurred_on,
    transferGroupId: row.transfer_group_id,
    counterAccountId: row.counter_account_id,
    recurringTransactionId: row.recurring_transaction_id,
    isReconciled: row.is_reconciled,
    paidByUserId: row.paid_by_user_id,
    createdBy: row.created_by,
    ...(row.created_by_name !== undefined ? { createdByName: row.created_by_name } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

/**
 * Callers submit a positive magnitude plus a type; the column stores the sign.
 * Doing the conversion in exactly one place is what keeps the database CHECK
 * constraint (`sign(amount)` must match `type`) from ever firing in practice.
 */
export function signedAmount(type: TransactionType, magnitude: string): string {
  const positive = abs(magnitude);
  return type === 'expense' ? negate(positive) : positive;
}

export interface CreateTransactionInput {
  workspaceId: string;
  baseCurrency: string;
  accountId: string;
  categoryId?: string | null;
  type: Exclude<TransactionType, 'transfer'>;
  /** Positive magnitude; the sign is derived from `type`. */
  amount: string;
  description: string;
  merchant?: string | null;
  notes?: string | null;
  occurredOn: DateOnly;
  status?: TransactionStatus;
  paidByUserId?: string | null;
  externalId?: string | null;
  recurringTransactionId?: string | null;
  tagIds?: string[];
  createdBy: string;
  executor?: Executor;
  skipActivity?: boolean;
}

export async function createTransaction(input: CreateTransactionInput): Promise<TransactionRecord> {
  const executor = input.executor ?? db;
  const account = await getAccount(input.workspaceId, input.accountId);
  if (account.isArchived) throw unprocessable('transactions.archivedAccount');

  await assertCategoryUsable(input.workspaceId, input.categoryId ?? null, input.type, executor);

  const amount = signedAmount(input.type, input.amount);
  const { amount: baseAmount, rate } = await convertAmount(
    amount,
    account.currency,
    input.baseCurrency,
    input.occurredOn,
    executor,
  );

  const row = await executor
    .insertInto('transactions')
    .values({
      workspace_id: input.workspaceId,
      account_id: input.accountId,
      category_id: input.categoryId ?? null,
      type: input.type,
      status: input.status ?? 'cleared',
      amount,
      currency: account.currency,
      base_amount: baseAmount,
      exchange_rate: rate,
      description: input.description.trim(),
      merchant: input.merchant ?? null,
      notes: input.notes ?? null,
      occurred_on: input.occurredOn,
      paid_by_user_id: input.paidByUserId ?? input.createdBy,
      external_id: input.externalId ?? null,
      recurring_transaction_id: input.recurringTransactionId ?? null,
      created_by: input.createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (input.tagIds?.length) await setTags(input.workspaceId, row.id, input.tagIds, executor);

  await invalidateWorkspaceCache(input.workspaceId);

  if (!input.skipActivity) {
    await recordActivity({
      workspaceId: input.workspaceId,
      actorUserId: input.createdBy,
      action: 'transaction.created',
      entityType: 'transaction',
      entityId: row.id,
      summary: `Added ${input.type} "${row.description}" of ${account.currency} ${abs(amount)}`,
      executor,
    });
  }

  return toRecord(row as TransactionRow);
}

export interface CreateTransferInput {
  workspaceId: string;
  baseCurrency: string;
  fromAccountId: string;
  toAccountId: string;
  /** Amount leaving the source account, in the source account's currency. */
  amount: string;
  /** Amount arriving, if the accounts hold different currencies. */
  destinationAmount?: string;
  description: string;
  notes?: string | null;
  occurredOn: DateOnly;
  status?: TransactionStatus;
  createdBy: string;
}

/**
 * A transfer is two linked legs, one per account, sharing a `transfer_group_id`.
 * Modelling it this way keeps every account's balance a simple SUM and lets a
 * cross-currency transfer record a different amount on each side.
 */
export async function createTransfer(input: CreateTransferInput): Promise<TransactionRecord[]> {
  if (input.fromAccountId === input.toAccountId) {
    throw unprocessable('transactions.sameAccountTransfer');
  }

  const [source, destination] = await Promise.all([
    getAccount(input.workspaceId, input.fromAccountId),
    getAccount(input.workspaceId, input.toAccountId),
  ]);

  if (source.isArchived || destination.isArchived) {
    throw unprocessable('transactions.archivedTransferAccount');
  }

  const outMagnitude = abs(input.amount);
  const inMagnitude =
    source.currency === destination.currency
      ? outMagnitude
      : input.destinationAmount
        ? abs(input.destinationAmount)
        : (await convertAmount(outMagnitude, source.currency, destination.currency, input.occurredOn)).amount;

  const groupId = randomUUID();
  const status = input.status ?? 'cleared';

  const rows = await db.transaction().execute(async (trx) => {
    const legs = [
      {
        account: source,
        amount: negate(outMagnitude),
        counterAccountId: destination.id,
      },
      {
        account: destination,
        amount: inMagnitude,
        counterAccountId: source.id,
      },
    ];

    const inserted = [];
    for (const leg of legs) {
      const { amount: baseAmount, rate } = await convertAmount(
        leg.amount,
        leg.account.currency,
        input.baseCurrency,
        input.occurredOn,
        trx,
      );

      const row = await trx
        .insertInto('transactions')
        .values({
          workspace_id: input.workspaceId,
          account_id: leg.account.id,
          category_id: null,
          type: 'transfer',
          status,
          amount: leg.amount,
          currency: leg.account.currency,
          base_amount: baseAmount,
          exchange_rate: rate,
          description: input.description.trim(),
          notes: input.notes ?? null,
          occurred_on: input.occurredOn,
          transfer_group_id: groupId,
          counter_account_id: leg.counterAccountId,
          created_by: input.createdBy,
          paid_by_user_id: input.createdBy,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      inserted.push(row);
    }
    return inserted;
  });

  await invalidateWorkspaceCache(input.workspaceId);

  await recordActivity({
    workspaceId: input.workspaceId,
    actorUserId: input.createdBy,
    action: 'transaction.transferred',
    entityType: 'transaction',
    entityId: rows[0]?.id ?? null,
    summary: `Transferred ${source.currency} ${outMagnitude} from "${source.name}" to "${destination.name}"`,
    changes: { transferGroupId: groupId },
  });

  return rows.map((row) => toRecord(row as TransactionRow));
}

async function assertCategoryUsable(
  workspaceId: string,
  categoryId: string | null,
  type: TransactionType,
  executor: Executor = db,
): Promise<void> {
  if (!categoryId) return;

  const category = await executor
    .selectFrom('categories')
    .select(['id', 'kind', 'is_archived'])
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', categoryId)
    .executeTakeFirst();

  if (!category) throw unprocessable('categories.notInWorkspace');
  if (category.is_archived) throw unprocessable('transactions.archivedCategory');
  if (category.kind !== type && category.kind !== 'transfer') {
    throw unprocessable('transactions.kindMismatch', {
      typeKey: `common.transactionKind.${type}`,
      kindKey: `common.transactionKind.${category.kind}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Querying
// ---------------------------------------------------------------------------

export interface TransactionFilters {
  accountIds?: string[];
  categoryIds?: string[];
  /** Roll child categories into a parent filter. */
  includeSubcategories?: boolean;
  types?: TransactionType[];
  statuses?: TransactionStatus[];
  from?: DateOnly;
  to?: DateOnly;
  minAmount?: string;
  maxAmount?: string;
  search?: string;
  tagIds?: string[];
  createdBy?: string;
  isReconciled?: boolean;
  includeDeleted?: boolean;
  sortBy?: 'occurredOn' | 'amount' | 'createdAt';
  sortDirection?: 'asc' | 'desc';
}

type TxQueryBuilder = ReturnType<typeof baseQuery>;

function baseQuery(workspaceId: string) {
  return db
    .selectFrom('transactions')
    .leftJoin('accounts', 'accounts.id', 'transactions.account_id')
    .leftJoin('categories', 'categories.id', 'transactions.category_id')
    .leftJoin('users', 'users.id', 'transactions.created_by')
    .where('transactions.workspace_id', '=', workspaceId);
}

/**
 * Returns the builder wrapped in an object: Kysely query builders are thenable
 * on purpose (they throw to catch accidental `await queryBuilder`), so an async
 * function must never resolve to one directly.
 */
async function applyFilters(
  query: TxQueryBuilder,
  workspaceId: string,
  filters: TransactionFilters,
): Promise<{ query: TxQueryBuilder }> {
  let q = query;

  if (!filters.includeDeleted) q = q.where('transactions.deleted_at', 'is', null);
  if (filters.accountIds?.length) q = q.where('transactions.account_id', 'in', filters.accountIds);

  if (filters.categoryIds?.length) {
    let ids = filters.categoryIds;
    if (filters.includeSubcategories) {
      const expanded = await Promise.all(filters.categoryIds.map((id) => descendantIds(workspaceId, id)));
      ids = [...new Set(expanded.flat())];
    }
    q = q.where('transactions.category_id', 'in', ids);
  }

  if (filters.types?.length) q = q.where('transactions.type', 'in', filters.types);
  if (filters.statuses?.length) q = q.where('transactions.status', 'in', filters.statuses);
  if (filters.from) q = q.where('transactions.occurred_on', '>=', filters.from);
  if (filters.to) q = q.where('transactions.occurred_on', '<=', filters.to);
  // Amount bounds compare magnitudes so "over 500" means the same for income
  // and expenses.
  if (filters.minAmount) q = q.where(sql`abs(transactions.amount)`, '>=', filters.minAmount);
  if (filters.maxAmount) q = q.where(sql`abs(transactions.amount)`, '<=', filters.maxAmount);
  if (filters.createdBy) q = q.where('transactions.created_by', '=', filters.createdBy);
  if (filters.isReconciled !== undefined) q = q.where('transactions.is_reconciled', '=', filters.isReconciled);

  if (filters.search) {
    const term = filters.search.trim();
    if (term.length > 0) {
      // Full-text for whole words, trigram ILIKE for partial words: users type
      // "superm" and still expect "Supermercado".
      q = q.where((eb) =>
        eb.or([
          eb(sql`transactions.search_vector`, '@@', sql`plainto_tsquery('simple', ${term})`),
          eb('transactions.description', 'ilike', `%${term}%`),
          eb('transactions.merchant', 'ilike', `%${term}%`),
        ]),
      );
    }
  }

  if (filters.tagIds?.length) {
    q = q.where((eb) =>
      eb.exists(
        eb
          .selectFrom('transaction_tags')
          .select('transaction_tags.tag_id')
          .whereRef('transaction_tags.transaction_id', '=', 'transactions.id')
          .where('transaction_tags.tag_id', 'in', filters.tagIds!),
      ),
    );
  }

  return { query: q };
}

export async function listTransactions(
  workspaceId: string,
  filters: TransactionFilters,
  pagination: Pagination,
): Promise<Page<TransactionRecord>> {
  const { query: filtered } = await applyFilters(baseQuery(workspaceId), workspaceId, filters);

  const sortColumn =
    filters.sortBy === 'amount'
      ? 'transactions.amount'
      : filters.sortBy === 'createdAt'
        ? 'transactions.created_at'
        : 'transactions.occurred_on';
  const direction = filters.sortDirection ?? 'desc';

  const [rows, countRow] = await Promise.all([
    filtered
      .select([
        'transactions.id as id',
        'transactions.account_id as account_id',
        'transactions.category_id as category_id',
        'transactions.type as type',
        'transactions.status as status',
        'transactions.amount as amount',
        'transactions.currency as currency',
        'transactions.base_amount as base_amount',
        'transactions.exchange_rate as exchange_rate',
        'transactions.description as description',
        'transactions.merchant as merchant',
        'transactions.notes as notes',
        'transactions.occurred_on as occurred_on',
        'transactions.transfer_group_id as transfer_group_id',
        'transactions.counter_account_id as counter_account_id',
        'transactions.recurring_transaction_id as recurring_transaction_id',
        'transactions.is_reconciled as is_reconciled',
        'transactions.paid_by_user_id as paid_by_user_id',
        'transactions.created_by as created_by',
        'transactions.created_at as created_at',
        'transactions.updated_at as updated_at',
        'transactions.deleted_at as deleted_at',
        'accounts.name as account_name',
        'categories.name as category_name',
        'users.full_name as created_by_name',
      ])
      .orderBy(sortColumn, direction)
      // Stable tiebreaker: v7 ids are time-ordered, so this also keeps
      // same-day rows in insertion order across pages.
      .orderBy('transactions.id', direction)
      .limit(pagination.pageSize)
      .offset(offsetOf(pagination))
      .execute(),
    filtered.select((eb) => eb.fn.count<number>('transactions.id').as('count')).executeTakeFirst(),
  ]);

  const records = rows.map((row) => toRecord(row as TransactionRow));
  await attachTags(records);

  return buildPage(records, Number(countRow?.count ?? 0), pagination);
}

async function attachTags(records: TransactionRecord[]): Promise<void> {
  if (records.length === 0) return;

  const rows = await db
    .selectFrom('transaction_tags')
    .innerJoin('tags', 'tags.id', 'transaction_tags.tag_id')
    .select(['transaction_tags.transaction_id as transaction_id', 'tags.name as name'])
    .where(
      'transaction_tags.transaction_id',
      'in',
      records.map((r) => r.id),
    )
    .execute();

  const byTransaction = new Map<string, string[]>();
  for (const row of rows) {
    const list = byTransaction.get(row.transaction_id) ?? [];
    list.push(row.name);
    byTransaction.set(row.transaction_id, list);
  }

  for (const record of records) record.tags = byTransaction.get(record.id) ?? [];
}

export async function getTransaction(workspaceId: string, transactionId: string): Promise<TransactionRecord> {
  const row = await baseQuery(workspaceId)
    .select([
      'transactions.id as id',
      'transactions.account_id as account_id',
      'transactions.category_id as category_id',
      'transactions.type as type',
      'transactions.status as status',
      'transactions.amount as amount',
      'transactions.currency as currency',
      'transactions.base_amount as base_amount',
      'transactions.exchange_rate as exchange_rate',
      'transactions.description as description',
      'transactions.merchant as merchant',
      'transactions.notes as notes',
      'transactions.occurred_on as occurred_on',
      'transactions.transfer_group_id as transfer_group_id',
      'transactions.counter_account_id as counter_account_id',
      'transactions.recurring_transaction_id as recurring_transaction_id',
      'transactions.is_reconciled as is_reconciled',
      'transactions.paid_by_user_id as paid_by_user_id',
      'transactions.created_by as created_by',
      'transactions.created_at as created_at',
      'transactions.updated_at as updated_at',
      'transactions.deleted_at as deleted_at',
      'accounts.name as account_name',
      'categories.name as category_name',
      'users.full_name as created_by_name',
    ])
    .where('transactions.id', '=', transactionId)
    .where('transactions.deleted_at', 'is', null)
    .executeTakeFirst();

  if (!row) throw notFound('resources.transaction');

  const record = toRecord(row as TransactionRow);
  await attachTags([record]);
  return record;
}

export interface UpdateTransactionInput {
  accountId?: string;
  categoryId?: string | null;
  amount?: string;
  description?: string;
  merchant?: string | null;
  notes?: string | null;
  occurredOn?: DateOnly;
  status?: TransactionStatus;
  paidByUserId?: string | null;
  tagIds?: string[];
}

export async function updateTransaction(
  workspaceId: string,
  baseCurrency: string,
  transactionId: string,
  input: UpdateTransactionInput,
  actorId: string,
): Promise<TransactionRecord> {
  const existing = await getTransaction(workspaceId, transactionId);

  if (existing.isReconciled) {
    throw conflict('transactions.reconciledEditLocked');
  }
  if (existing.type === 'transfer' && (input.accountId || input.amount)) {
    throw unprocessable('transactions.transferImmutable');
  }

  if (input.categoryId !== undefined) {
    await assertCategoryUsable(workspaceId, input.categoryId, existing.type);
  }

  const targetAccountId = input.accountId ?? existing.accountId;
  const account = await getAccount(workspaceId, targetAccountId);
  const occurredOn = input.occurredOn ?? existing.occurredOn;

  // Amount, account currency and date all feed the base-currency figure, so any
  // of them changing means recomputing the conversion.
  let amount = existing.amount;
  if (input.amount !== undefined) amount = signedAmount(existing.type, input.amount);

  const needsReconversion =
    input.amount !== undefined ||
    input.accountId !== undefined ||
    (input.occurredOn !== undefined && input.occurredOn !== existing.occurredOn);

  const conversion = needsReconversion
    ? await convertAmount(amount, account.currency, baseCurrency, occurredOn)
    : { amount: existing.baseAmount, rate: existing.exchangeRate };

  await db
    .updateTable('transactions')
    .set({
      ...(input.accountId !== undefined ? { account_id: input.accountId, currency: account.currency } : {}),
      ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
      ...(input.amount !== undefined ? { amount } : {}),
      ...(needsReconversion ? { base_amount: conversion.amount, exchange_rate: conversion.rate } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.merchant !== undefined ? { merchant: input.merchant } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.occurredOn !== undefined ? { occurred_on: input.occurredOn } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.paidByUserId !== undefined ? { paid_by_user_id: input.paidByUserId } : {}),
    })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', transactionId)
    .execute();

  if (input.tagIds) await setTags(workspaceId, transactionId, input.tagIds);

  await invalidateWorkspaceCache(workspaceId);

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'transaction.updated',
    entityType: 'transaction',
    entityId: transactionId,
    summary: `Updated transaction "${existing.description}"`,
    changes: input as Record<string, unknown>,
  });

  return getTransaction(workspaceId, transactionId);
}

/**
 * Soft delete. Financial history is never physically removed: the row stays for
 * audit, and the balance trigger reverses its contribution.
 */
export async function deleteTransaction(
  workspaceId: string,
  transactionId: string,
  actorId: string,
): Promise<void> {
  const existing = await getTransaction(workspaceId, transactionId);
  if (existing.isReconciled) {
    throw conflict('transactions.reconciledDeleteLocked');
  }

  await db.transaction().execute(async (trx) => {
    // Deleting one leg of a transfer would leave the other side dangling.
    const query = trx.updateTable('transactions').set({ deleted_at: new Date() }).where('workspace_id', '=', workspaceId);
    if (existing.transferGroupId) {
      await query.where('transfer_group_id', '=', existing.transferGroupId).execute();
    } else {
      await query.where('id', '=', transactionId).execute();
    }
  });

  await invalidateWorkspaceCache(workspaceId);

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'transaction.deleted',
    entityType: 'transaction',
    entityId: transactionId,
    summary: `Deleted transaction "${existing.description}"`,
  });
}

export async function restoreTransaction(
  workspaceId: string,
  transactionId: string,
  actorId: string,
): Promise<void> {
  const result = await db
    .updateTable('transactions')
    .set({ deleted_at: null })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', transactionId)
    .where('deleted_at', 'is not', null)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0) === 0) throw notFound('resources.deletedTransaction');

  await invalidateWorkspaceCache(workspaceId);
  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'transaction.restored',
    entityType: 'transaction',
    entityId: transactionId,
    summary: 'Restored a deleted transaction',
  });
}

// ---------------------------------------------------------------------------
// Tags, splits and comments
// ---------------------------------------------------------------------------

export async function setTags(
  workspaceId: string,
  transactionId: string,
  tagIds: string[],
  executor: Executor = db,
): Promise<void> {
  const valid = await executor
    .selectFrom('tags')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('id', 'in', tagIds.length > 0 ? tagIds : ['00000000-0000-0000-0000-000000000000'])
    .execute();

  const validIds = new Set(valid.map((t) => t.id));
  const unknown = tagIds.filter((id) => !validIds.has(id));
  if (unknown.length > 0) throw unprocessable('tags.unknownIds', { ids: unknown.join(', ') });

  await executor.deleteFrom('transaction_tags').where('transaction_id', '=', transactionId).execute();
  if (tagIds.length > 0) {
    await executor
      .insertInto('transaction_tags')
      .values(tagIds.map((tagId) => ({ transaction_id: transactionId, tag_id: tagId })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}

export interface SplitInput {
  userId: string;
  /** Either an explicit amount or a weight; weights are normalised. */
  shareAmount?: string;
  weight?: string;
  note?: string | null;
}

export interface SplitRecord {
  id: string;
  userId: string;
  fullName: string;
  shareAmount: string;
  sharePercent: string | null;
  settledAt: Date | null;
  note: string | null;
}

/**
 * Records who owes what on a shared expense. Shares must reconcile exactly to
 * the transaction total, so the helpers in `lib/money` distribute the rounding
 * remainder rather than leaving a stray cent.
 */
export async function setSplits(
  workspaceId: string,
  transactionId: string,
  splits: SplitInput[],
  actorId: string,
): Promise<SplitRecord[]> {
  const transaction = await getTransaction(workspaceId, transactionId);
  if (splits.length === 0) {
    await db.deleteFrom('transaction_splits').where('transaction_id', '=', transactionId).execute();
    return [];
  }

  const memberIds = await db
    .selectFrom('workspace_members')
    .select('user_id')
    .where('workspace_id', '=', workspaceId)
    .execute();
  const memberSet = new Set(memberIds.map((m) => m.user_id));
  const outsiders = splits.filter((s) => !memberSet.has(s.userId));
  if (outsiders.length > 0) throw unprocessable('transactions.splitNonMember');

  const total = abs(transaction.amount);
  let amounts: string[];

  if (splits.every((s) => s.shareAmount !== undefined)) {
    amounts = splits.map((s) => abs(s.shareAmount!));
    const allocated = sumMoney(amounts);
    if (allocated !== total) {
      throw unprocessable('transactions.splitMismatch', { total, allocated });
    }
  } else if (splits.some((s) => s.weight !== undefined)) {
    amounts = splitByWeights(total, splits.map((s) => s.weight ?? '1'));
  } else {
    amounts = splitEvenly(total, splits.length);
  }

  const rows = await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('transaction_splits').where('transaction_id', '=', transactionId).execute();

    return trx
      .insertInto('transaction_splits')
      .values(
        splits.map((split, index) => ({
          workspace_id: workspaceId,
          transaction_id: transactionId,
          user_id: split.userId,
          share_amount: amounts[index]!,
          share_percent: null,
          note: split.note ?? null,
        })),
      )
      .returningAll()
      .execute();
  });

  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'transaction.split',
    entityType: 'transaction',
    entityId: transactionId,
    summary: `Split "${transaction.description}" between ${splits.length} people`,
  });

  const names = await db
    .selectFrom('users')
    .select(['id', 'full_name'])
    .where('id', 'in', splits.map((s) => s.userId))
    .execute();
  const nameById = new Map(names.map((n) => [n.id, n.full_name]));

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullName: nameById.get(row.user_id) ?? '',
    shareAmount: row.share_amount,
    sharePercent: row.share_percent,
    settledAt: row.settled_at,
    note: row.note,
  }));
}

export async function listSplits(workspaceId: string, transactionId: string): Promise<SplitRecord[]> {
  const rows = await db
    .selectFrom('transaction_splits')
    .innerJoin('users', 'users.id', 'transaction_splits.user_id')
    .select([
      'transaction_splits.id as id',
      'transaction_splits.user_id as user_id',
      'transaction_splits.share_amount as share_amount',
      'transaction_splits.share_percent as share_percent',
      'transaction_splits.settled_at as settled_at',
      'transaction_splits.note as note',
      'users.full_name as full_name',
    ])
    .where('transaction_splits.workspace_id', '=', workspaceId)
    .where('transaction_splits.transaction_id', '=', transactionId)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    shareAmount: row.share_amount,
    sharePercent: row.share_percent,
    settledAt: row.settled_at,
    note: row.note,
  }));
}

export async function settleSplit(workspaceId: string, splitId: string, settled: boolean): Promise<void> {
  const result = await db
    .updateTable('transaction_splits')
    .set({ settled_at: settled ? new Date() : null })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', splitId)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows ?? 0) === 0) throw notFound('resources.split');
}

export interface CommentRecord {
  id: string;
  body: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function addComment(
  workspaceId: string,
  transactionId: string,
  userId: string,
  body: string,
): Promise<CommentRecord> {
  await getTransaction(workspaceId, transactionId);

  const row = await db
    .insertInto('transaction_comments')
    .values({ workspace_id: workspaceId, transaction_id: transactionId, user_id: userId, body: body.trim() })
    .returningAll()
    .executeTakeFirstOrThrow();

  const user = await db
    .selectFrom('users')
    .select(['full_name', 'avatar_url'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();

  await recordActivity({
    workspaceId,
    actorUserId: userId,
    action: 'transaction.commented',
    entityType: 'transaction',
    entityId: transactionId,
    summary: 'Commented on a transaction',
  });

  return {
    id: row.id,
    body: row.body,
    userId,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listComments(workspaceId: string, transactionId: string): Promise<CommentRecord[]> {
  const rows = await db
    .selectFrom('transaction_comments')
    .innerJoin('users', 'users.id', 'transaction_comments.user_id')
    .select([
      'transaction_comments.id as id',
      'transaction_comments.body as body',
      'transaction_comments.user_id as user_id',
      'transaction_comments.created_at as created_at',
      'transaction_comments.updated_at as updated_at',
      'users.full_name as full_name',
      'users.avatar_url as avatar_url',
    ])
    .where('transaction_comments.workspace_id', '=', workspaceId)
    .where('transaction_comments.transaction_id', '=', transactionId)
    .where('transaction_comments.deleted_at', 'is', null)
    .orderBy('transaction_comments.created_at', 'asc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    userId: row.user_id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function deleteComment(
  workspaceId: string,
  commentId: string,
  userId: string,
  canModerate: boolean,
): Promise<void> {
  const comment = await db
    .selectFrom('transaction_comments')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', commentId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (!comment) throw notFound('resources.comment');
  if (comment.user_id !== userId && !canModerate) {
    throw unprocessable('transactions.commentNotOwned');
  }

  await db
    .updateTable('transaction_comments')
    .set({ deleted_at: new Date() })
    .where('id', '=', commentId)
    .execute();
}

// ---------------------------------------------------------------------------
// Bulk helpers
// ---------------------------------------------------------------------------

/** Assigns a category to many transactions at once (bulk cleanup in the UI). */
export async function bulkCategorize(
  workspaceId: string,
  transactionIds: string[],
  categoryId: string | null,
  actorId: string,
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  if (categoryId) {
    const category = await db
      .selectFrom('categories')
      .select(['id'])
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', categoryId)
      .executeTakeFirst();
    if (!category) throw unprocessable('categories.notInWorkspace');
  }

  const result = await db
    .updateTable('transactions')
    .set({ category_id: categoryId })
    .where('workspace_id', '=', workspaceId)
    .where('id', 'in', transactionIds)
    .where('deleted_at', 'is', null)
    .where('is_reconciled', '=', false)
    .where('type', '<>', 'transfer')
    .executeTakeFirst();

  const updated = Number(result.numUpdatedRows ?? 0);

  await invalidateWorkspaceCache(workspaceId);
  await recordActivity({
    workspaceId,
    actorUserId: actorId,
    action: 'transaction.bulk_categorized',
    entityType: 'transaction',
    summary: `Recategorised ${updated} transactions`,
  });

  return updated;
}

export const transactionExpression = (eb: ExpressionBuilder<Database, 'transactions'>) => eb;
export const todayFor = (timezone: string): DateOnly => today(timezone);
