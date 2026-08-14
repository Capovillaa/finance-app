import { api } from '../api';
import type { DateOnly, Money, RecurrenceFrequency, RecurringTransaction } from '../types';

export interface RecurringInput {
  accountId: string;
  categoryId?: string | null;
  name: string;
  type: 'income' | 'expense';
  amount: Money;
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
}

export interface UpdateRecurringInput {
  name?: string;
  amount?: Money;
  description?: string;
  merchant?: string | null;
  categoryId?: string | null;
  endDate?: DateOnly | null;
  isActive?: boolean;
  autoPost?: boolean;
  leadTimeDays?: number;
}

export const recurringApi = api.injectEndpoints({
  endpoints: (build) => ({
    listRecurring: build.query<{ recurring: RecurringTransaction[] }, { workspaceId: string; includeInactive?: boolean }>({
      query: ({ workspaceId, includeInactive }) => ({
        url: `/workspaces/${workspaceId}/recurring`,
        params: includeInactive === undefined ? undefined : { includeInactive: String(includeInactive) },
      }),
      providesTags: (result, _error, { workspaceId }) => [
        { type: 'Recurring' as const, id: `LIST:${workspaceId}` },
        ...(result?.recurring ?? []).map((r) => ({ type: 'Recurring' as const, id: r.id })),
      ],
    }),

    getRecurring: build.query<
      { recurring: RecurringTransaction; upcoming: DateOnly[] },
      { workspaceId: string; id: string }
    >({
      query: ({ workspaceId, id }) => `/workspaces/${workspaceId}/recurring/${id}`,
      providesTags: (_result, _error, { id }) => [{ type: 'Recurring', id }],
    }),

    createRecurring: build.mutation<{ recurring: RecurringTransaction }, { workspaceId: string; body: RecurringInput }>({
      query: ({ workspaceId, body }) => ({ url: `/workspaces/${workspaceId}/recurring`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Recurring', id: `LIST:${workspaceId}` }],
    }),

    updateRecurring: build.mutation<
      { recurring: RecurringTransaction },
      { workspaceId: string; id: string; body: UpdateRecurringInput }
    >({
      query: ({ workspaceId, id, body }) => ({ url: `/workspaces/${workspaceId}/recurring/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Recurring', id },
        { type: 'Recurring', id: `LIST:${workspaceId}` },
      ],
    }),

    deleteRecurring: build.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({ url: `/workspaces/${workspaceId}/recurring/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Recurring', id: `LIST:${workspaceId}` }],
    }),

    materializeRecurring: build.mutation<{ created: number }, { workspaceId: string; id: string; through?: DateOnly }>({
      query: ({ workspaceId, id, through }) => ({
        url: `/workspaces/${workspaceId}/recurring/${id}/materialize`,
        method: 'POST',
        body: through ? { through } : {},
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Recurring', id },
        { type: 'Recurring', id: `LIST:${workspaceId}` },
        { type: 'Transaction', id: `LIST:${workspaceId}` },
        { type: 'Account', id: `LIST:${workspaceId}` },
        { type: 'Dashboard', id: workspaceId },
      ],
    }),
  }),
});

export const {
  useListRecurringQuery,
  useGetRecurringQuery,
  useCreateRecurringMutation,
  useUpdateRecurringMutation,
  useDeleteRecurringMutation,
  useMaterializeRecurringMutation,
} = recurringApi;
