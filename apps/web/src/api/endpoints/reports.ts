import { api } from '../api';
import type { DateOnly, MonthlyStatement, YearOverYearRow } from '../types';

export interface TransactionExportFilters {
  from?: DateOnly;
  to?: DateOnly;
  accountIds?: string[];
  categoryIds?: string[];
}

/**
 * `YYYY-MM` → `YYYY-MM-01`.
 *
 * The statement endpoints take a full calendar date and derive the month from
 * it, so a month picker's value has to be anchored to a day before it is sent.
 */
export function monthAnchor(month: string): DateOnly {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month;
}

function exportParams(filters: TransactionExportFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  // Same convention as the transaction filters: array values go over the wire
  // comma-joined, and an empty selection is dropped rather than sent empty.
  if (filters.accountIds?.length) params.accountIds = filters.accountIds.join(',');
  if (filters.categoryIds?.length) params.categoryIds = filters.categoryIds.join(',');
  return params;
}

export const reportsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getStatement: build.query<
      { statement: MonthlyStatement },
      { workspaceId: string; month?: DateOnly }
    >({
      query: ({ workspaceId, month }) => ({
        url: `/workspaces/${workspaceId}/reports/statement`,
        params: month ? { month } : undefined,
      }),
      // A statement is derived from the ledger, so it goes stale for exactly the
      // reasons the dashboard does — reusing that tag means a transaction write
      // already invalidates it, with no new bookkeeping.
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    getYearOverYear: build.query<
      { year: number; rows: YearOverYearRow[] },
      { workspaceId: string; year?: number }
    >({
      query: ({ workspaceId, year }) => ({
        url: `/workspaces/${workspaceId}/reports/year-over-year`,
        params: year ? { year } : undefined,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Dashboard', id: workspaceId }],
    }),

    /**
     * The two exports are reads, but they are modelled as mutations on purpose:
     * a download is triggered by a button rather than by a component mounting,
     * and caching a CSV body that is immediately written to disk would only
     * hold megabytes of text in memory for nothing.
     *
     * `responseHandler: 'text'` is required — the default handler parses JSON
     * and would fail on a `text/csv` body before it ever reached the caller.
     */
    exportStatementCsv: build.mutation<string, { workspaceId: string; month?: DateOnly }>({
      query: ({ workspaceId, month }) => ({
        url: `/workspaces/${workspaceId}/reports/export/statement.csv`,
        params: month ? { month } : undefined,
        responseHandler: 'text',
      }),
    }),

    exportTransactionsCsv: build.mutation<
      string,
      { workspaceId: string; filters?: TransactionExportFilters }
    >({
      query: ({ workspaceId, filters = {} }) => ({
        url: `/workspaces/${workspaceId}/reports/export/transactions.csv`,
        params: exportParams(filters),
        responseHandler: 'text',
      }),
    }),
  }),
});

export const {
  useGetStatementQuery,
  useGetYearOverYearQuery,
  useExportStatementCsvMutation,
  useExportTransactionsCsvMutation,
} = reportsApi;
