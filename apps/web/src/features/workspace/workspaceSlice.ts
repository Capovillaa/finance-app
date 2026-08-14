import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const STORAGE_KEY = 'finance.activeWorkspaceId';

/**
 * Which workspace the UI is currently looking at.
 *
 * Every financial endpoint is mounted under `/workspaces/:workspaceId`, so this
 * id is a parameter of almost every query. It is persisted to `localStorage`
 * because it is a preference, not a credential — the API still checks
 * membership on every request, so a tampered value yields a 403, not access.
 */
interface WorkspaceState {
  activeWorkspaceId: string | null;
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing modes can throw on storage access. A missing preference
    // is recoverable — the switcher falls back to the first workspace.
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* preference is best-effort */
  }
}

const initialState: WorkspaceState = {
  activeWorkspaceId: readStored(),
};

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    workspaceSelected(state, action: PayloadAction<string>) {
      state.activeWorkspaceId = action.payload;
      writeStored(action.payload);
    },
    workspaceCleared(state) {
      state.activeWorkspaceId = null;
      writeStored(null);
    },
  },
});

export const { workspaceSelected, workspaceCleared } = workspaceSlice.actions;

export const workspaceReducer = workspaceSlice.reducer;
