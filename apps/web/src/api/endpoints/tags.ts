import { api } from '../api';
import type { Tag } from '../types';

export const tagsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listTags: build.query<{ tags: Tag[] }, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/tags`,
      providesTags: (_result, _error, workspaceId) => [{ type: 'Tag', id: `LIST:${workspaceId}` }],
    }),

    createTag: build.mutation<{ tag: Tag }, { workspaceId: string; name: string; color?: string | null }>({
      query: ({ workspaceId, ...body }) => ({ url: `/workspaces/${workspaceId}/tags`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Tag', id: `LIST:${workspaceId}` }],
    }),

    /**
     * Deleting a tag detaches it from every transaction that carried it, so the
     * ledger has to be refetched alongside the tag list — a row's chips would
     * otherwise keep showing a tag that no longer exists.
     */
    deleteTag: build.mutation<void, { workspaceId: string; id: string }>({
      query: ({ workspaceId, id }) => ({ url: `/workspaces/${workspaceId}/tags/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Tag', id: `LIST:${workspaceId}` },
        { type: 'Transaction', id: `LIST:${workspaceId}` },
      ],
    }),
  }),
});

export const { useListTagsQuery, useCreateTagMutation, useDeleteTagMutation } = tagsApi;
