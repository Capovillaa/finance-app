import { api } from '../api';
import type {
  DateOnly,
  Money,
  Page,
  Transaction,
  TransactionComment,
  TransactionDetail,
  TransactionSplit,
  TransactionStatus,
  TransactionType,
} from '../types';

export interface TransactionFilters {
  page?: number;
  pageSize?: number;
  from?: DateOnly;
  to?: DateOnly;
  accountIds?: string[];
  categoryIds?: string[];
  tagIds?: string[];
  includeSubcategories?: boolean;
  types?: TransactionType[];
  statuses?: TransactionStatus[];
  minAmount?: Money;
  maxAmount?: Money;
  search?: string;
  createdBy?: string;
  isReconciled?: boolean;
  sortBy?: 'occurredOn' | 'amount' | 'createdAt';
  sortDirection?: 'asc' | 'desc';
}

export interface TransactionInput {
  accountId: string;
  categoryId?: string | null;
  type: 'income' | 'expense';
  /** Always positive — the API derives the sign from `type`. */
  amount: Money;
  description: string;
  merchant?: string | null;
  notes?: string | null;
  occurredOn: DateOnly;
  status?: 'cleared' | 'pending' | 'scheduled';
  paidByUserId?: string | null;
  tagIds?: string[];
}

/**
 * A transfer is created as a pair of linked legs sharing a `transferGroupId`.
 *
 * `destinationAmount` only applies when the two accounts hold different
 * currencies: without it the server converts at the stored rate, with it the
 * caller pins what actually landed in the destination account — which is what
 * the receiving bank's statement will say, rate slippage and all.
 */
export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
  destinationAmount?: Money;
  description: string;
  notes?: string | null;
  occurredOn: DateOnly;
  status?: 'cleared' | 'pending';
}

export interface SplitInput {
  userId: string;
  /** Exact share. Every share given this way must add up to the transaction total. */
  shareAmount?: Money;
  /** Relative weight; the server normalises weights into amounts. */
  weight?: Money;
  note?: string | null;
}

/**
 * Turns the filter object into query parameters the API accepts.
 *
 * Two rules the API enforces and this must respect: array filters go over the
 * wire as `a,b,c`, and booleans must be the literal strings `"true"`/`"false"`
 * rather than anything relying on JavaScript truthiness. Empty arrays are
 * dropped entirely so an unset filter never becomes an empty `IN ()`.
 */
export function toQueryParams(filters: TransactionFilters): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;

    if (Array.isArray(value)) {
      if (value.length > 0) params[key] = value.join(',');
    } else if (typeof value === 'boolean') {
      params[key] = value ? 'true' : 'false';
    } else {
      params[key] = String(value);
    }
  }

  return params;
}

export const transactionsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listTransactions: build.query<
      Page<Transaction>,
      { workspaceId: string; filters?: TransactionFilters }
    >({
      query: ({ workspaceId, filters = {} }) => ({
        url: `/workspaces/${workspaceId}/transactions`,
        params: toQueryParams(filters),
      }),
      providesTags: (result, _error, { workspaceId }) => [
        { type: 'Transaction' as const, id: `LIST:${workspaceId}` },
        ...(result?.items ?? []).map((t) => ({ type: 'Transaction' as const, id: t.id })),
      ],
    }),

    /** The row plus its splits and comment thread, in one round trip. */
    getTransaction: build.query<TransactionDetail, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => `/workspaces/${workspaceId}/transactions/${id}`,
      providesTags: (_result, _error, { id }) => [{ type: 'Transaction', id }],
    }),

    createTransaction: build.mutation<
      { transaction: Transaction },
      { workspaceId: string; body: TransactionInput }
    >({
      query: ({ workspaceId, body }) => ({
        url: `/workspaces/${workspaceId}/transactions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => invalidateLedger(workspaceId),
    }),

    updateTransaction: build.mutation<
      { transaction: Transaction },
      { workspaceId: string; id: string; body: Partial<TransactionInput> }
    >({
      query: ({ workspaceId, id, body }) => ({
        url: `/workspaces/${workspaceId}/transactions/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Transaction' as const, id },
        ...invalidateLedger(workspaceId),
      ],
    }),

    deleteTransaction: build.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({
        url: `/workspaces/${workspaceId}/transactions/${id}`,
        method: 'DELETE',
      }),
      // Deleting one leg of a transfer soft-deletes the whole group server-side,
      // so the whole list has to go rather than just the row that was clicked.
      invalidatesTags: (_result, _error, { workspaceId }) => invalidateLedger(workspaceId),
    }),

    createTransfer: build.mutation<
      { transactions: Transaction[] },
      { workspaceId: string; body: TransferInput }
    >({
      query: ({ workspaceId, body }) => ({
        url: `/workspaces/${workspaceId}/transactions/transfers`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => invalidateLedger(workspaceId),
    }),

    // --- splits ------------------------------------------------------------

    /**
     * Replaces the whole split set — the server deletes and reinserts, so this
     * is a PUT and the client always sends every participant, not a delta.
     */
    setSplits: build.mutation<
      { splits: TransactionSplit[] },
      { workspaceId: string; id: string; splits: SplitInput[] }
    >({
      query: ({ workspaceId, id, splits }) => ({
        url: `/workspaces/${workspaceId}/transactions/${id}/splits`,
        method: 'PUT',
        body: { splits },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Transaction', id }],
    }),

    settleSplit: build.mutation<
      void,
      { workspaceId: string; id: string; splitId: string; settled: boolean }
    >({
      query: ({ workspaceId, id, splitId, settled }) => ({
        url: `/workspaces/${workspaceId}/transactions/${id}/splits/${splitId}/settle`,
        method: 'POST',
        body: { settled },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Transaction', id }],
    }),

    // --- comments ----------------------------------------------------------

    addComment: build.mutation<
      { comment: TransactionComment },
      { workspaceId: string; id: string; body: string }
    >({
      query: ({ workspaceId, id, body }) => ({
        url: `/workspaces/${workspaceId}/transactions/${id}/comments`,
        method: 'POST',
        body: { body },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Transaction', id }],
    }),

    /** Anyone may delete their own; admins may delete anyone's. */
    deleteComment: build.mutation<void, { workspaceId: string; id: string; commentId: string }>({
      query: ({ workspaceId, id, commentId }) => ({
        url: `/workspaces/${workspaceId}/transactions/${id}/comments/${commentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Transaction', id }],
    }),
  }),
});

/**
 * A write to the ledger moves account balances, budget progress and every
 * analytics figure, so all three caches have to go — not just the list.
 */
function invalidateLedger(workspaceId: string) {
  return [
    { type: 'Transaction' as const, id: `LIST:${workspaceId}` },
    { type: 'Account' as const, id: `LIST:${workspaceId}` },
    { type: 'Budget' as const, id: `LIST:${workspaceId}` },
    { type: 'Dashboard' as const, id: workspaceId },
  ];
}

export const {
  useListTransactionsQuery,
  useGetTransactionQuery,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionMutation,
  useCreateTransferMutation,
  useSetSplitsMutation,
  useSettleSplitMutation,
  useAddCommentMutation,
  useDeleteCommentMutation,
} = transactionsApi;
