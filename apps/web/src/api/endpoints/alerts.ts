import { api } from '../api';
import type { AlertEvaluationSummary, AlertRule, AlertRuleType, NotificationChannel } from '../types';

export interface UpsertAlertRuleInput {
  type: AlertRuleType;
  isEnabled?: boolean;
  config?: Record<string, unknown>;
  channels?: NotificationChannel[];
  scopeCategoryId?: string | null;
  scopeAccountId?: string | null;
}

export const alertsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listAlertRules: build.query<{ rules: AlertRule[] }, { workspaceId: string }>({
      query: ({ workspaceId }) => `/workspaces/${workspaceId}/alerts`,
      providesTags: (result, _error, { workspaceId }) => [
        { type: 'Alert' as const, id: `LIST:${workspaceId}` },
        ...(result?.rules ?? []).map((r) => ({ type: 'Alert' as const, id: r.id })),
      ],
    }),

    upsertAlertRule: build.mutation<{ rule: AlertRule }, { workspaceId: string; body: UpsertAlertRuleInput }>({
      query: ({ workspaceId, body }) => ({ url: `/workspaces/${workspaceId}/alerts`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Alert', id: `LIST:${workspaceId}` }],
    }),

    deleteAlertRule: build.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({ url: `/workspaces/${workspaceId}/alerts/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Alert', id: `LIST:${workspaceId}` }],
    }),

    evaluateAlerts: build.mutation<AlertEvaluationSummary, { workspaceId: string }>({
      query: ({ workspaceId }) => ({ url: `/workspaces/${workspaceId}/alerts/evaluate`, method: 'POST' }),
      invalidatesTags: () => [{ type: 'Notification' }],
    }),
  }),
});

export const {
  useListAlertRulesQuery,
  useUpsertAlertRuleMutation,
  useDeleteAlertRuleMutation,
  useEvaluateAlertsMutation,
} = alertsApi;
