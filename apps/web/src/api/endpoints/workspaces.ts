import { api } from '../api';
import type { Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from '../types';

/** Roles that can be granted. Ownership moves through `transferOwnership`. */
export type GrantableRole = Exclude<WorkspaceRole, 'owner'>;

export interface UpdateWorkspaceInput {
  name?: string;
  baseCurrency?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

export const workspacesApi = api.injectEndpoints({
  endpoints: (build) => ({
    listWorkspaces: build.query<{ workspaces: Workspace[] }, void>({
      query: () => '/workspaces',
      providesTags: (result) => [
        { type: 'Workspace' as const, id: 'LIST' },
        ...(result?.workspaces ?? []).map((w) => ({ type: 'Workspace' as const, id: w.id })),
      ],
    }),

    getWorkspace: build.query<{ workspace: Workspace }, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}`,
      providesTags: (_result, _error, workspaceId) => [{ type: 'Workspace', id: workspaceId }],
    }),

    createWorkspace: build.mutation<
      { workspace: Workspace },
      { name: string; baseCurrency?: string; timezone?: string }
    >({
      query: (body) => ({ url: '/workspaces', method: 'POST', body }),
      invalidatesTags: [{ type: 'Workspace', id: 'LIST' }],
    }),

    updateWorkspace: build.mutation<
      { workspace: Workspace },
      { workspaceId: string; body: UpdateWorkspaceInput }
    >({
      query: ({ workspaceId, body }) => ({ url: `/workspaces/${workspaceId}`, method: 'PATCH', body }),
      // The base currency is what every converted total is expressed in, so a
      // change to it invalidates far more than the workspace row itself.
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
        { type: 'Dashboard', id: workspaceId },
      ],
    }),

    /** Archive, not destroy: the server soft-deletes so history survives. */
    archiveWorkspace: build.mutation<void, string>({
      query: (workspaceId) => ({ url: `/workspaces/${workspaceId}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, workspaceId) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),

    // --- members -----------------------------------------------------------

    listMembers: build.query<{ members: WorkspaceMember[] }, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/members`,
      providesTags: (_result, _error, workspaceId) => [{ type: 'Workspace', id: workspaceId }],
    }),

    updateMemberRole: build.mutation<
      void,
      { workspaceId: string; userId: string; role: GrantableRole }
    >({
      query: ({ workspaceId, userId, role }) => ({
        url: `/workspaces/${workspaceId}/members/${userId}`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),

    removeMember: build.mutation<void, { workspaceId: string; userId: string }>({
      query: ({ workspaceId, userId }) => ({
        url: `/workspaces/${workspaceId}/members/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),

    /**
     * Owner-only, and one-way: the caller is demoted to admin by the same
     * request, so the workspace list has to be refetched or every control on
     * screen would still be gated on a role the caller no longer holds.
     */
    transferOwnership: build.mutation<void, { workspaceId: string; newOwnerId: string }>({
      query: ({ workspaceId, newOwnerId }) => ({
        url: `/workspaces/${workspaceId}/transfer-ownership`,
        method: 'POST',
        body: { newOwnerId },
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),

    // --- invitations -------------------------------------------------------

    listInvitations: build.query<{ invitations: WorkspaceInvitation[] }, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/invitations`,
      providesTags: (_result, _error, workspaceId) => [{ type: 'Invitation', id: workspaceId }],
    }),

    createInvitation: build.mutation<
      { invitation: WorkspaceInvitation; emailDelivered: boolean },
      { workspaceId: string; email: string; role: GrantableRole }
    >({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/invitations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Invitation', id: workspaceId }],
    }),

    revokeInvitation: build.mutation<void, { workspaceId: string; invitationId: string }>({
      query: ({ workspaceId, invitationId }) => ({
        url: `/workspaces/${workspaceId}/invitations/${invitationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { workspaceId }) => [{ type: 'Invitation', id: workspaceId }],
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useArchiveWorkspaceMutation,
  useListMembersQuery,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useTransferOwnershipMutation,
  useListInvitationsQuery,
  useCreateInvitationMutation,
  useRevokeInvitationMutation,
} = workspacesApi;
