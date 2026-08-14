import { api } from '../api';
import type { Category, CategoryKind, CategoryNode } from '../types';

export const categoriesApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Flat shape — what a select control wants. */
    listCategories: build.query<
      { categories: Category[] },
      { workspaceId: string; kind?: CategoryKind; includeArchived?: boolean }
    >({
      query: ({ workspaceId, kind, includeArchived }) => ({
        url: `/workspaces/${workspaceId}/categories`,
        params: {
          shape: 'flat',
          ...(kind ? { kind } : {}),
          ...(includeArchived === undefined ? {} : { includeArchived: includeArchived ? 'true' : 'false' }),
        },
      }),
      providesTags: (_result, _error, { workspaceId }) => [
        { type: 'Category', id: `LIST:${workspaceId}` },
      ],
    }),

    /** Nested shape — what a tree view wants. */
    listCategoryTree: build.query<
      { categories: CategoryNode[] },
      { workspaceId: string; kind?: CategoryKind; includeArchived?: boolean }
    >({
      query: ({ workspaceId, kind, includeArchived }) => ({
        url: `/workspaces/${workspaceId}/categories`,
        params: {
          shape: 'tree',
          ...(kind ? { kind } : {}),
          ...(includeArchived === undefined ? {} : { includeArchived: includeArchived ? 'true' : 'false' }),
        },
      }),
      providesTags: (_result, _error, { workspaceId }) => [
        { type: 'Category', id: `TREE:${workspaceId}` },
      ],
    }),
  }),
});

export const { useListCategoriesQuery, useListCategoryTreeQuery } = categoriesApi;
