import { api } from '../api';
import type { ImportBatch, ImportOptionOverrides, ImportPreview } from '../types';

export interface PreviewImportArgs extends ImportOptionOverrides {
  workspaceId: string;
  accountId: string;
  /** The file's text, read in the browser. */
  content: string;
  filename?: string | null;
}

export interface CommitImportArgs {
  workspaceId: string;
  batchId: string;
  rows: { lineNumber: number; categoryId?: string | null }[];
}

export const importsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listImportBatches: build.query<{ batches: ImportBatch[] }, { workspaceId: string; limit?: number }>({
      query: ({ workspaceId, limit }) => ({
        url: `/workspaces/${workspaceId}/imports`,
        params: limit ? { limit } : undefined,
      }),
      providesTags: (_result, _error, { workspaceId }) => [{ type: 'Import', id: `LIST:${workspaceId}` }],
    }),

    /**
     * A preview is a POST that writes no ledger rows, so it is a mutation
     * despite being a read of the file: it is triggered by picking a file or
     * changing an option, never by a component mounting, and its result is
     * held in the dialog's own state rather than in the cache. Caching it would
     * also be wrong — the same file re-previewed after a commit must see the
     * rows it just created and flag them as duplicates.
     */
    previewImport: build.mutation<{ preview: ImportPreview }, PreviewImportArgs>({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/imports/preview`,
        method: 'POST',
        body,
      }),
    }),

    commitImport: build.mutation<
      { batchId: string; imported: number; accountId: string },
      CommitImportArgs
    >({
      query: ({ workspaceId, batchId, rows }) => ({
        url: `/workspaces/${workspaceId}/imports/${batchId}/commit`,
        method: 'POST',
        body: { rows },
      }),
      // A commit writes transactions, which moves balances and every derived
      // figure on the dashboard and the reports.
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Transaction', id: `LIST:${workspaceId}` },
        { type: 'Account', id: `LIST:${workspaceId}` },
        { type: 'Dashboard', id: workspaceId },
        { type: 'Import', id: `LIST:${workspaceId}` },
      ],
    }),

    revertImport: build.mutation<{ reverted: number }, { workspaceId: string; batchId: string }>({
      query: ({ workspaceId, batchId }) => ({
        url: `/workspaces/${workspaceId}/imports/${batchId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Transaction', id: `LIST:${workspaceId}` },
        { type: 'Account', id: `LIST:${workspaceId}` },
        { type: 'Dashboard', id: workspaceId },
        { type: 'Import', id: `LIST:${workspaceId}` },
      ],
    }),
  }),
});

export const {
  useListImportBatchesQuery,
  usePreviewImportMutation,
  useCommitImportMutation,
  useRevertImportMutation,
} = importsApi;
