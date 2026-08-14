import { api } from '../api';
import type { NotificationPage } from '../types';

export const notificationsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** User-scoped and spans every workspace, so it is not workspace-tagged. */
    listNotifications: build.query<
      NotificationPage,
      { workspaceId?: string; unreadOnly?: boolean; page?: number; pageSize?: number } | void
    >({
      query: (args) => {
        const { unreadOnly, ...rest } = args ?? {};
        return {
          url: '/notifications',
          params: {
            ...rest,
            ...(unreadOnly === undefined ? {} : { unreadOnly: unreadOnly ? 'true' : 'false' }),
          },
        };
      },
      providesTags: [{ type: 'Notification', id: 'LIST' }],
    }),

    markNotificationRead: build.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST', body: {} }),
      invalidatesTags: [{ type: 'Notification', id: 'LIST' }],
    }),

    markAllNotificationsRead: build.mutation<{ updated: number }, { workspaceId?: string } | void>({
      query: (args) => ({
        url: '/notifications/read-all',
        method: 'POST',
        body: args ?? {},
      }),
      invalidatesTags: [{ type: 'Notification', id: 'LIST' }],
    }),

    deleteNotification: build.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Notification', id: 'LIST' }],
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationMutation,
} = notificationsApi;
