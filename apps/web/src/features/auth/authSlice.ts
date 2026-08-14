import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from '../../api/types';

/**
 * The access token lives in memory only.
 *
 * It is deliberately *not* persisted to `localStorage`: the API already issues a
 * long-lived refresh token as an HttpOnly cookie scoped to `/api/v1/auth`, so a
 * page reload can mint a fresh access token without the client ever holding a
 * credential that injected JavaScript could read. `bootstrap()` in
 * `sessionBootstrap.ts` is what turns that cookie back into a session.
 */
interface AuthState {
  accessToken: string | null;
  user: User | null;
  /** False until the initial silent-refresh attempt has settled, either way. */
  bootstrapped: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  bootstrapped: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    credentialsReceived(state, action: PayloadAction<{ user: User; accessToken: string }>) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.bootstrapped = true;
    },
    tokenRefreshed(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    userLoaded(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    credentialsCleared(state) {
      state.accessToken = null;
      state.user = null;
      state.bootstrapped = true;
    },
    bootstrapFinished(state) {
      state.bootstrapped = true;
    },
  },
});

export const {
  credentialsReceived,
  tokenRefreshed,
  userLoaded,
  credentialsCleared,
  bootstrapFinished,
} = authSlice.actions;

export const authReducer = authSlice.reducer;
