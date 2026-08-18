import { api } from '../api';
import type {
  AuthResult,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  ResetPasswordResult,
  TokenPair,
  User,
  VerifyEmailRequest,
} from '../types';

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<AuthResult, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),

    register: build.mutation<AuthResult, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),

    /**
     * Used only by the boot-time session restore. Ordinary 401s are refreshed
     * inside `baseQueryWithReauth`, which single-flights them.
     */
    refresh: build.mutation<TokenPair, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST', body: {} }),
    }),

    /** The refresh cookie is HttpOnly, so an empty body is all the server needs. */
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST', body: {} }),
    }),

    /**
     * Revokes every refresh-token family the account has, on every device. This
     * session is one of them, so the caller must end it locally as well.
     */
    logoutAll: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout-all', method: 'POST', body: {} }),
    }),

    me: build.query<{ user: User }, void>({
      query: () => '/auth/me',
    }),

    changePassword: build.mutation<void, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),

    /** Always resolves, whether or not the address has an account. */
    forgotPassword: build.mutation<void, ForgotPasswordRequest>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),

    /** Signs the caller in on success, the same shape as `login`. */
    resetPassword: build.mutation<ResetPasswordResult, ResetPasswordRequest>({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
    }),

    verifyEmail: build.mutation<void, VerifyEmailRequest>({
      query: (body) => ({ url: '/auth/verify-email', method: 'POST', body }),
    }),

    resendVerification: build.mutation<void, void>({
      query: () => ({ url: '/auth/resend-verification', method: 'POST', body: {} }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useRefreshMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useMeQuery,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
} = authApi;
