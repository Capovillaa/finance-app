import { api } from '../api';
import type {
  Account,
  AccountListResponse,
  AccountReconciliation,
  AccountType,
  DateOnly,
  Money,
  ReconciliationResult,
} from '../types';

export interface AccountInput {
  name: string;
  type: AccountType;
  currency: string;
  institution?: string | null;
  initialBalance?: Money;
  creditLimit?: Money | null;
  statementDay?: number | null;
  dueDay?: number | null;
  color?: string | null;
  icon?: string | null;
}

export const accountsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listAccounts: build.query<
      AccountListResponse,
      { workspaceId: string; includeArchived?: boolean }
    >({
      query: ({ workspaceId, includeArchived }) => ({
        url: `/workspaces/${workspaceId}/accounts`,
        // Booleans are spelled out rather than coerced: the API rejects
        // JavaScript truthiness on query flags on purpose.
        params: includeArchived === undefined ? undefined : { includeArchived: String(includeArchived) },
      }),
      providesTags: (result, _error, { workspaceId }) => [
        { type: 'Account' as const, id: `LIST:${workspaceId}` },
        ...(result?.accounts ?? []).map((a) => ({ type: 'Account' as const, id: a.id })),
      ],
    }),

    getAccount: build.query<{ account: Account }, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => `/workspaces/${workspaceId}/accounts/${id}`,
      providesTags: (_result, _error, { id }) => [{ type: 'Account', id }],
    }),

    createAccount: build.mutation<
      { account: Account },
      { workspaceId: string; body: AccountInput }
    >({
      query: ({ workspaceId, body }) => ({
        url: `/workspaces/${workspaceId}/accounts`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Account', id: `LIST:${workspaceId}` },
        { type: 'Dashboard', id: workspaceId },
      ],
    }),

    updateAccount: build.mutation<
      { account: Account },
      { workspaceId: string; id: string; body: Partial<AccountInput> & { isArchived?: boolean } }
    >({
      query: ({ workspaceId, id, body }) => ({
        url: `/workspaces/${workspaceId}/accounts/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Account', id },
        { type: 'Account', id: `LIST:${workspaceId}` },
        { type: 'Dashboard', id: workspaceId },
      ],
    }),

    deleteAccount: build.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({
        url: `/workspaces/${workspaceId}/accounts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Account', id: `LIST:${workspaceId}` },
        { type: 'Dashboard', id: workspaceId },
      ],
    }),

    listReconciliations: build.query<
      { reconciliations: AccountReconciliation[] },
      { workspaceId: string; accountId: string }
    >({
      query: ({ workspaceId, accountId }) =>
        `/workspaces/${workspaceId}/accounts/${accountId}/reconciliations`,
      providesTags: (_result, _error, { accountId }) => [{ type: 'Reconciliation', id: accountId }],
    }),

    /**
     * A reconciliation that balances freezes every cleared transaction up to the
     * statement date, so this invalidates the ledger as well as its own history —
     * a frozen row can no longer be edited and the Transactions screen has to
     * stop offering to.
     */
    createReconciliation: build.mutation<
      { reconciliation: ReconciliationResult },
      {
        workspaceId: string;
        accountId: string;
        body: {
          statementDate: DateOnly;
          statementBalance: Money;
          notes?: string | null;
          markTransactions?: boolean;
        };
      }
    >({
      query: ({ workspaceId, accountId, body }) => ({
        url: `/workspaces/${workspaceId}/accounts/${accountId}/reconciliations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId, accountId }) => [
        { type: 'Reconciliation', id: accountId },
        { type: 'Account', id: accountId },
        { type: 'Transaction', id: `LIST:${workspaceId}` },
      ],
    }),
  }),
});

export const {
  useListAccountsQuery,
  useGetAccountQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useListReconciliationsQuery,
  useCreateReconciliationMutation,
} = accountsApi;
