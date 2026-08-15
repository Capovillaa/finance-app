import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

/**
 * The single RTK Query service. Domain endpoints are injected from
 * `src/api/endpoints/*`, one file per API module, mirroring the backend's
 * "one folder per domain" convention.
 *
 * Every workspace-scoped tag carries the workspace id in its `id` field so that
 * switching workspaces cannot serve another workspace's cached rows.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Account',
    'Alert',
    'Budget',
    'Category',
    'Dashboard',
    'Goal',
    'Import',
    'Invitation',
    'Notification',
    'Reconciliation',
    'Recurring',
    'Tag',
    'Transaction',
    'Workspace',
  ],
  // Financial data changes from other sessions and from the background worker,
  // so refetching when the tab regains focus keeps the numbers honest.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
