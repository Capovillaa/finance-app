import {
  fetchBaseQuery,
  type BaseQueryApi,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query';
import { credentialsCleared, tokenRefreshed } from '../features/auth/authSlice';
import i18n from '../i18n';
import type { TokenPair } from './types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/**
 * The slice of state this layer reads. Declared structurally rather than
 * imported from the store so that `store.ts` can depend on the API without the
 * API depending back on the store.
 */
interface AuthStateSlice {
  auth: { accessToken: string | null };
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  // Sends the HttpOnly refresh cookie. In development Vite proxies /api so this
  // is a same-origin request; in production the API must allow this origin with
  // credentials (it does — see `WEB_BASE_URL` in the API's CORS config).
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as AuthStateSlice).auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    // Lets the API translate errors, alert emails and notifications before a
    // profile even exists to read a preference from (a bad login, a register
    // validation error) — see `middleware/locale.ts` on the server, which
    // prefers the signed-in user's stored locale over this once one is known.
    headers.set('accept-language', i18n.language);
    return headers;
  },
});

/**
 * Endpoints that must never trigger a refresh attempt. A 401 from any of these
 * *is* the answer, and retrying would either loop or mask a genuine credential
 * failure behind a second error.
 */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

function requestPath(args: string | FetchArgs): string {
  return typeof args === 'string' ? args : args.url;
}

/**
 * A refresh in flight, shared by every caller.
 *
 * Without this, a screen that fires six queries at once against an expired
 * access token would send six refreshes. The refresh token rotates on every
 * use and replaying a rotated token revokes the entire family, so the five
 * losers of that race would log the user out. Single-flighting is not an
 * optimisation here — it is what keeps the session alive.
 */
let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(
  api: BaseQueryApi,
  extraOptions: object = {},
): Promise<string | null> {
  const existing = refreshInFlight;
  if (existing) return existing;

  const attempt = (async (): Promise<string | null> => {
    try {
      const result = await rawBaseQuery(
        { url: '/auth/refresh', method: 'POST', body: {} },
        api,
        extraOptions,
      );

      if (result.error) return null;

      const { accessToken } = result.data as TokenPair;
      api.dispatch(tokenRefreshed(accessToken));
      return accessToken;
    } finally {
      // Cleared in `finally` so a failed refresh does not wedge every later
      // request behind a permanently settled promise.
      refreshInFlight = null;
    }
  })();

  refreshInFlight = attempt;
  return attempt;
}

/**
 * `fetchBaseQuery` plus transparent re-authentication.
 *
 * On a 401 the access token is refreshed once and the original request is
 * replayed. If the refresh itself fails the session is genuinely over, so the
 * credentials are cleared and the route guard sends the user to the login page.
 */
export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401 || NO_REFRESH_PATHS.includes(requestPath(args))) {
    return result;
  }

  const token = await refreshAccessToken(api, extraOptions);
  if (!token) {
    api.dispatch(credentialsCleared());
    return result;
  }

  result = await rawBaseQuery(args, api, extraOptions);
  return result;
};
