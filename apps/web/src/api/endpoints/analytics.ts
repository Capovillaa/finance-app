import { api } from '../api';
import type {
  CategoryBreakdownItem,
  DashboardSummary,
  DateRange,
  Money,
  NetWorthPoint,
  PeriodTotals,
  SavingsRatePoint,
  SpendingInsight,
  TrendPoint,
} from '../types';

export const analyticsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Everything the dashboard needs in one round trip; cached server-side too. */
    getDashboard: build.query<DashboardSummary, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/analytics/dashboard`,
      providesTags: (_result, _error, workspaceId) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    getSummary: build.query<
      { range: DateRange; totals: PeriodTotals },
      { workspaceId: string; from?: string; to?: string }
    >({
      query: ({ workspaceId, ...params }) => ({
        url: `/workspaces/${workspaceId}/analytics/summary`,
        params,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    getCategoryBreakdown: build.query<
      { range: DateRange; categories: CategoryBreakdownItem[] },
      {
        workspaceId: string;
        from?: string;
        to?: string;
        type?: 'income' | 'expense';
        /** 0 rolls everything up to top-level categories, 2 keeps the leaves. */
        depth?: 0 | 1 | 2;
        limit?: number;
      }
    >({
      query: ({ workspaceId, ...params }) => ({
        url: `/workspaces/${workspaceId}/analytics/categories`,
        params,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    getTrends: build.query<
      { range: DateRange; points: TrendPoint[] },
      {
        workspaceId: string;
        months?: number;
        unit?: 'day' | 'week' | 'month' | 'year';
        from?: string;
        to?: string;
      }
    >({
      query: ({ workspaceId, ...params }) => ({
        url: `/workspaces/${workspaceId}/analytics/trends`,
        params,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    getNetWorth: build.query<
      { points: NetWorthPoint[] },
      { workspaceId: string; months?: number }
    >({
      query: ({ workspaceId, ...params }) => ({
        url: `/workspaces/${workspaceId}/analytics/net-worth`,
        params,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    getSavingsRate: build.query<
      { points: SavingsRatePoint[] },
      { workspaceId: string; months?: number }
    >({
      query: ({ workspaceId, ...params }) => ({
        url: `/workspaces/${workspaceId}/analytics/savings-rate`,
        params,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    getBudgetVariance: build.query<
      { rows: BudgetVarianceRow[] },
      { workspaceId: string; asOf?: string }
    >({
      query: ({ workspaceId, ...params }) => ({
        url: `/workspaces/${workspaceId}/analytics/budget-variance`,
        params,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Budget', id: `LIST:${workspaceId}` }],
    }),

    getInsights: build.query<{ insights: SpendingInsight[] }, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/analytics/insights`,
      providesTags: (_result, _error, workspaceId) => [{ type: 'Dashboard', id: workspaceId }],
    }),
  }),
});

export interface BudgetVarianceRow {
  categoryId: string;
  categoryName: string;
  budgeted: Money;
  actual: Money;
  variance: Money;
  variancePercent: number;
  status: 'under' | 'over' | 'on_target';
}

export const {
  useGetDashboardQuery,
  useGetSummaryQuery,
  useGetCategoryBreakdownQuery,
  useGetTrendsQuery,
  useGetNetWorthQuery,
  useGetSavingsRateQuery,
  useGetBudgetVarianceQuery,
  useGetInsightsQuery,
} = analyticsApi;
