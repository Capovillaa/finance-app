import type { MemberRole, WorkspaceType } from '../db/types.js';

/** The caller, resolved from the access token by `requireAuth`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  timezone: string;
  baseCurrency: string;
}

/**
 * The workspace a request operates on, resolved by `withWorkspace`, together
 * with the caller's role in it. Every workspace-scoped query filters on `id`.
 */
export interface WorkspaceContext {
  id: string;
  name: string;
  role: MemberRole;
  baseCurrency: string;
  timezone: string;
  type: WorkspaceType;
}
