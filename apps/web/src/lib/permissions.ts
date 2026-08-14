import type { WorkspaceRole } from '../api/types';

/**
 * Client-side mirror of the `requireEditor` / `requireAdmin` checks in
 * `apps/api/src/middleware/auth.ts`. These only hide controls the API would
 * reject anyway — the server is still the authority, so a 403 is handled
 * normally if role state is ever stale.
 */
export function canEdit(role: WorkspaceRole | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function canAdminister(role: WorkspaceRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
