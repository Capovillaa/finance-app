import { useListWorkspacesQuery } from '../../api/endpoints/workspaces';
import type { Workspace } from '../../api/types';
import { useAppSelector } from '../../app/hooks';

/**
 * The workspace the UI is currently scoped to, resolved against the list the
 * server actually returned.
 *
 * The stored id is only a hint. It can point at a workspace the user has since
 * left, or one that belongs to a different account on a shared browser, so it
 * is never trusted on its own — if it does not appear in the list, the first
 * workspace wins.
 */
export function useActiveWorkspace(): {
  workspace: Workspace | undefined;
  workspaces: Workspace[];
  isLoading: boolean;
} {
  const storedId = useAppSelector((state) => state.workspace.activeWorkspaceId);
  const { data, isLoading } = useListWorkspacesQuery();

  const workspaces = data?.workspaces ?? [];
  const workspace = workspaces.find((w) => w.id === storedId) ?? workspaces[0];

  return { workspace, workspaces, isLoading };
}

/**
 * The active workspace id for use inside a query argument.
 *
 * Returns `undefined` before the workspace list has loaded, which is the signal
 * callers pass to RTK Query's `skipToken` so no request goes out with a
 * placeholder id in the path.
 */
export function useActiveWorkspaceId(): string | undefined {
  return useActiveWorkspace().workspace?.id;
}
