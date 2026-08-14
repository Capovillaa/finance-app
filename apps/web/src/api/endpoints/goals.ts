import { api } from '../api';
import type { DateOnly, Goal, GoalCategory, GoalContribution, GoalStatus, Money } from '../types';

export interface GoalInput {
  name: string;
  description?: string | null;
  category?: GoalCategory;
  targetAmount: Money;
  currency?: string;
  targetDate?: DateOnly | null;
  accountId?: string | null;
  priority?: number;
  color?: string | null;
}

export interface UpdateGoalInput {
  name?: string;
  description?: string | null;
  targetAmount?: Money;
  targetDate?: DateOnly | null;
  status?: GoalStatus;
  priority?: number;
  color?: string | null;
  accountId?: string | null;
}

export interface ContributionInput {
  amount: Money;
  occurredOn?: DateOnly;
  note?: string | null;
}

export const goalsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listGoals: build.query<{ goals: Goal[] }, { workspaceId: string; status?: GoalStatus }>({
      query: ({ workspaceId, status }) => ({
        url: `/workspaces/${workspaceId}/goals`,
        params: status ? { status } : undefined,
      }),
      providesTags: (result, _error, { workspaceId }) => [
        { type: 'Goal' as const, id: `LIST:${workspaceId}` },
        ...(result?.goals ?? []).map((g) => ({ type: 'Goal' as const, id: g.id })),
      ],
    }),

    getGoal: build.query<{ goal: Goal; contributions: GoalContribution[] }, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => `/workspaces/${workspaceId}/goals/${id}`,
      providesTags: (_result, _error, { id }) => [{ type: 'Goal', id }, { type: 'Goal', id: `CONTRIBUTIONS:${id}` }],
    }),

    createGoal: build.mutation<{ goal: Goal }, { workspaceId: string; body: GoalInput }>({
      query: ({ workspaceId, body }) => ({ url: `/workspaces/${workspaceId}/goals`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Goal', id: `LIST:${workspaceId}` }],
    }),

    updateGoal: build.mutation<{ goal: Goal }, { workspaceId: string; id: string; body: UpdateGoalInput }>({
      query: ({ workspaceId, id, body }) => ({ url: `/workspaces/${workspaceId}/goals/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Goal', id },
        { type: 'Goal', id: `LIST:${workspaceId}` },
      ],
    }),

    deleteGoal: build.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({ url: `/workspaces/${workspaceId}/goals/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Goal', id: `LIST:${workspaceId}` }],
    }),

    addContribution: build.mutation<{ goal: Goal }, { workspaceId: string; id: string; body: ContributionInput }>({
      query: ({ workspaceId, id, body }) => ({
        url: `/workspaces/${workspaceId}/goals/${id}/contributions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Goal', id },
        { type: 'Goal', id: `LIST:${workspaceId}` },
        { type: 'Goal', id: `CONTRIBUTIONS:${id}` },
      ],
    }),

    deleteContribution: build.mutation<void, { workspaceId: string; id: string; contributionId: string }>({
      query: ({ workspaceId, id, contributionId }) => ({
        url: `/workspaces/${workspaceId}/goals/${id}/contributions/${contributionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { workspaceId, id }) => [
        { type: 'Goal', id },
        { type: 'Goal', id: `LIST:${workspaceId}` },
        { type: 'Goal', id: `CONTRIBUTIONS:${id}` },
      ],
    }),
  }),
});

export const {
  useListGoalsQuery,
  useGetGoalQuery,
  useCreateGoalMutation,
  useUpdateGoalMutation,
  useDeleteGoalMutation,
  useAddContributionMutation,
  useDeleteContributionMutation,
} = goalsApi;
