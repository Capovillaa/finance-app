import { api } from '../api';
import type { User } from '../types';

export interface ProfileInput {
  fullName?: string;
  avatarUrl?: string | null;
  locale?: string;
  timezone?: string;
  /** The user's own default, used when creating a workspace — not a workspace's base currency. */
  baseCurrency?: string;
}

export const usersApi = api.injectEndpoints({
  endpoints: (build) => ({
    updateProfile: build.mutation<{ user: User }, ProfileInput>({
      query: (body) => ({ url: '/users/me', method: 'PATCH', body }),
      // The signed-in user lives in the auth slice rather than in the query
      // cache, so the caller dispatches `userLoaded` with the response; there is
      // no tag to invalidate here.
    }),

    /**
     * The GDPR export: every row tied to this account, as JSON. A mutation
     * because it is triggered by a button and the payload is written straight to
     * disk — see `exportStatementCsv` in `reports.ts` for the same reasoning.
     */
    exportMyData: build.mutation<unknown, void>({
      query: () => ({ url: '/users/me/export' }),
    }),

    /**
     * Erasure. The server anonymises rather than hard-deletes so shared history
     * stays coherent for other members, and revokes every session, so the caller
     * must tear down local state too.
     */
    deleteAccount: build.mutation<void, void>({
      query: () => ({ url: '/users/me', method: 'DELETE', body: { confirm: true } }),
    }),
  }),
});

export const { useUpdateProfileMutation, useExportMyDataMutation, useDeleteAccountMutation } = usersApi;
