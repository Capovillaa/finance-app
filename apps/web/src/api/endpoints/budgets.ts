import { api } from '../api';
import type { BudgetPeriod, BudgetProgress, DateOnly, Money } from '../types';

export interface BudgetLineInput {
  categoryId: string;
  limitAmount: Money;
  includeSubcategories?: boolean;
  alertThresholdPercent?: number;
}

export interface CreateBudgetInput {
  name: string;
  period: BudgetPeriod;
  startDate: DateOnly;
  endDate?: DateOnly;
  currency?: string;
  rollover?: boolean;
  lines: BudgetLineInput[];
}

export interface UpdateBudgetInput {
  name?: string;
  isActive?: boolean;
  rollover?: boolean;
}

export const budgetsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listBudgets: build.query<
      { budgets: BudgetProgress[] },
      { workspaceId: string; activeOn?: DateOnly; includeInactive?: boolean }
    >({
      query: ({ workspaceId, activeOn, includeInactive }) => ({
        url: `/workspaces/${workspaceId}/budgets`,
        params: {
          ...(activeOn ? { activeOn } : {}),
          ...(includeInactive === undefined ? {} : { includeInactive: String(includeInactive) }),
        },
      }),
      providesTags: (result, _error, { workspaceId }) => [
        { type: 'Budget' as const, id: `LIST:${workspaceId}` },
        ...(result?.budgets ?? []).map((b) => ({ type: 'Budget' as const, id: b.id })),
      ],
    }),

    createBudget: build.mutation<{ budget: BudgetProgress }, { workspaceId: string; body: CreateBudgetInput }>({
      query: ({ workspaceId, body }) => ({
        url: `/workspaces/${workspaceId}/budgets`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Budget', id: `LIST:${workspaceId}` }],
    }),

    updateBudget: build.mutation<
      { budget: BudgetProgress },
      { workspaceId: string; id: string; body: UpdateBudgetInput }
    >({
      query: ({ workspaceId, id, body }) => ({
        url: `/workspaces/${workspaceId}/budgets/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Budget', id },
        { type: 'Budget', id: `LIST:${workspaceId}` },
      ],
    }),

    deleteBudget: build.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({ url: `/workspaces/${workspaceId}/budgets/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Budget', id: `LIST:${workspaceId}` }],
    }),

    upsertBudgetLine: build.mutation<
      { budget: BudgetProgress },
      { workspaceId: string; id: string; body: BudgetLineInput }
    >({
      query: ({ workspaceId, id, body }) => ({
        url: `/workspaces/${workspaceId}/budgets/${id}/lines`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Budget', id },
        { type: 'Budget', id: `LIST:${workspaceId}` },
      ],
    }),

    deleteBudgetLine: build.mutation<void, { workspaceId: string; id: string; lineId: string }>({
      query: ({ workspaceId, id, lineId }) => ({
        url: `/workspaces/${workspaceId}/budgets/${id}/lines/${lineId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Budget', id },
        { type: 'Budget', id: `LIST:${workspaceId}` },
      ],
    }),

    reviseBudgetLine: build.mutation<
      { budget: BudgetProgress },
      { workspaceId: string; id: string; lineId: string; newLimit: Money; reason?: string | null }
    >({
      query: ({ workspaceId, id, lineId, ...body }) => ({
        url: `/workspaces/${workspaceId}/budgets/${id}/lines/${lineId}/revise`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Budget', id },
        { type: 'Budget', id: `LIST:${workspaceId}` },
      ],
    }),

    rolloverBudget: build.mutation<{ budget: BudgetProgress }, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({ url: `/workspaces/${workspaceId}/budgets/${id}/rollover`, method: 'POST' }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Budget', id: `LIST:${workspaceId}` }],
    }),
  }),
});

export const {
  useListBudgetsQuery,
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  useUpsertBudgetLineMutation,
  useDeleteBudgetLineMutation,
  useReviseBudgetLineMutation,
  useRolloverBudgetMutation,
} = budgetsApi;
