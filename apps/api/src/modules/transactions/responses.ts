import { LEDGER_STATUSES, LEDGER_TYPES } from '@finance/schemas';
import { z } from 'zod/v4';
import {
  component,
  currencyCode,
  dateOnly,
  integer,
  money,
  page,
  timestamp,
  uuid,
} from '../shared/responses.js';

/**
 * What this module returns.
 *
 * The one thing to know before editing: **`accountName`, `categoryName`,
 * `createdByName` and `tags` are optional and that is not laziness.** The list
 * and detail queries join the account, category and author and attach tag names
 * afterwards; create and update use `returningAll()` on `transactions` alone, so
 * the same record comes back without them. `toRecord()` omits the keys rather
 * than sending nulls, so a client can tell "no category" from "not asked for".
 */

export const transactionSchema = component(
  'Transaction',
  z.object({
    id: uuid,
    accountId: uuid,
    accountName: z.string().optional().describe('Joined by the list and detail queries only.'),
    categoryId: uuid.nullable(),
    categoryName: z.string().nullable().optional(),
    type: z.enum(LEDGER_TYPES),
    status: z.enum(LEDGER_STATUSES),
    amount: money.describe('Signed as stored: negative for an expense, positive for income.'),
    currency: currencyCode,
    baseAmount: money.describe("The same amount in the workspace's base currency, converted on the day it happened."),
    exchangeRate: money.describe('The rate that applied on `occurredOn`, to ten decimal places.'),
    description: z.string(),
    merchant: z.string().nullable(),
    notes: z.string().nullable(),
    occurredOn: dateOnly,
    transferGroupId: uuid.nullable().describe('Both legs of a transfer share one group id.'),
    counterAccountId: uuid.nullable(),
    recurringTransactionId: uuid.nullable(),
    isReconciled: z.boolean(),
    paidByUserId: uuid.nullable(),
    createdBy: uuid.nullable(),
    createdByName: z.string().nullable().optional(),
    tags: z.array(z.string()).optional().describe('Tag names, attached by the list and detail queries only.'),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp
      .nullable()
      .describe('Set on a soft-deleted row. Only `?includeDeleted=true` returns one; `POST /:id/restore` undoes it.'),
  }),
);

export const transactionPageResponse = page(transactionSchema).describe(
  'One page of the ledger, newest first unless `sortBy` says otherwise.',
);

export const transactionResponse = z.object({ transaction: transactionSchema });

/**
 * Both legs of a transfer, in order: the account money left, then the account it
 * reached. They share a `transferGroupId` and their amounts are opposite signs.
 */
export const transferResponse = z.object({ transactions: z.array(transactionSchema) });

export const bulkCategorizeResponse = z
  .object({ updated: integer })
  .describe('How many rows the recategorisation actually changed.');

/**
 * One person's share. `shareAmount` is always a magnitude, never signed, and the
 * server guarantees the shares add up to the absolute value of the transaction —
 * so a client never has to reconcile them.
 */
export const transactionSplitSchema = component(
  'TransactionSplit',
  z.object({
    id: uuid,
    userId: uuid,
    fullName: z.string(),
    shareAmount: money,
    sharePercent: money.nullable().describe('Present when the split was made by weight.'),
    settledAt: timestamp.nullable(),
    note: z.string().nullable(),
  }),
);

export const splitsResponse = z.object({ splits: z.array(transactionSplitSchema) });

export const transactionCommentSchema = component(
  'TransactionComment',
  z.object({
    id: uuid,
    body: z.string(),
    userId: uuid,
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
);

export const commentResponse = z.object({ comment: transactionCommentSchema });

/** `GET /transactions/:id` returns the row with everything hanging off it. */
export const transactionDetailResponse = z
  .object({
    transaction: transactionSchema,
    splits: z.array(transactionSplitSchema),
    comments: z.array(transactionCommentSchema),
  })
  .describe('The row, its splits and its comment thread, in one call.');
