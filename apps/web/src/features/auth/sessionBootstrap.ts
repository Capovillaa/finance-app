import { createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '../../api/endpoints/auth';
import { bootstrapFinished, credentialsCleared, tokenRefreshed, userLoaded } from './authSlice';
import type { AppDispatch } from '../../app/store';

/**
 * Restores a session on page load.
 *
 * The access token only ever lives in memory, so after a reload the client has
 * nothing — but the browser still holds the HttpOnly refresh cookie. Spending it
 * once gives a new access token, and `/auth/me` fills in the user. If either
 * step fails the visitor is simply logged out, which is the correct outcome for
 * an expired or revoked session.
 *
 * `bootstrapped` flips to true either way, so the route guard knows the
 * difference between "not logged in" and "not yet checked" and does not flash
 * the login page at a returning user.
 */
export const restoreSession = createAsyncThunk<void, void, { dispatch: AppDispatch }>(
  'auth/restoreSession',
  async (_arg, { dispatch }) => {
    const refresh = await dispatch(authApi.endpoints.refresh.initiate());

    if (!('data' in refresh) || !refresh.data) {
      dispatch(credentialsCleared());
      return;
    }

    dispatch(tokenRefreshed(refresh.data.accessToken));

    const me = await dispatch(authApi.endpoints.me.initiate(undefined, { forceRefetch: true }));

    if (me.data) dispatch(userLoaded(me.data.user));
    else dispatch(credentialsCleared());

    dispatch(bootstrapFinished());
  },
);
