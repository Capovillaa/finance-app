import {
  LIMITS,
  currencyField,
  emailField,
  localeField,
  nameField,
  passwordField,
  timezoneField,
} from '@finance/schemas';
import { Router, type Response } from 'express';
import { z } from 'zod/v4';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { clientIp } from '../../middleware/request-context.js';
import { NO_BODY, responds } from '../../middleware/responds.js';
import { body, validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/http.js';
import { unauthorized } from '../../lib/errors.js';
import { db } from '../../db/client.js';
import { authResultResponse, tokenPairResponse, userResponse } from './responses.js';
import * as authService from './service.js';
import { toPublicUser } from './service.js';

const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  fullName: nameField,
  locale: localeField.optional(),
  timezone: timezoneField.optional(),
  baseCurrency: currencyField.optional(),
  workspaceName: nameField.optional(),
});

/**
 * Sign-in checks that a password was typed, never that it is well formed. The
 * composition rules belong on the way in; applying them here would tell an
 * attacker which stored passwords predate them.
 */
const suppliedPasswordSchema = z
  .string()
  .min(1, 'validation.passwordRequired')
  .max(LIMITS.password.max);

const loginSchema = z.object({
  email: emailField,
  password: suppliedPasswordSchema,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: suppliedPasswordSchema,
  newPassword: passwordField,
});

const forgotPasswordSchema = z.object({ email: emailField });

/** Not `emailField`/anything content-shaped: this is an opaque token, checked by hash. */
const emailTokenSchema = z.string().min(20).max(200);

const resetPasswordSchema = z.object({
  token: emailTokenSchema,
  newPassword: passwordField,
});

const verifyEmailSchema = z.object({ token: emailTokenSchema });

const REFRESH_COOKIE = 'finance_refresh_token';

export const authRouter: Router = Router();

/**
 * The refresh token is returned in the body (for native clients) *and* set as an
 * HttpOnly cookie (for browsers), so the web app never has to keep it in JS.
 *
 * **This cookie requires the client and the API to share an origin**, which is
 * why `config/env.ts` refuses to start in production when `API_BASE_URL` and
 * `WEB_BASE_URL` disagree. `Lax` is not merely a hardening choice here — it is
 * what protects `/auth/refresh`, which accepts the cookie and nothing else —
 * and a browser does not send a `Lax` cookie on a cross-site fetch at all. The
 * deployed composition puts nginx in front and proxies `/api` to this process;
 * the Vite dev server does the same thing for the same reason.
 */
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    // Blocks the cookie from riding a cross-site POST, which is what stands in
    // for CSRF protection on this route: `/refresh` accepts the cookie alone.
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/api/v1/auth',
    // Follows the token's real lifetime rather than assuming the default. A
    // deployment that shortens `REFRESH_TOKEN_TTL_DAYS` was otherwise left with
    // a cookie outliving the token inside it, so the client kept presenting a
    // credential the server had already stopped honouring.
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

authRouter.post(
  '/register',
  authRateLimit,
  validate({ body: registerSchema }),
  responds({ 201: authResultResponse }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof registerSchema>>(req);
    const result = await authService.register(input, {
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent') ?? null,
    });
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  authRateLimit,
  validate({ body: loginSchema }),
  responds({ 200: authResultResponse }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof loginSchema>>(req);
    const result = await authService.login(input, {
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent') ?? null,
    });
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  }),
);

authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  responds({ 200: tokenPairResponse }),
  asyncHandler(async (req, res) => {
    const fromBody = body<z.infer<typeof refreshSchema>>(req).refreshToken;
    const token = fromBody ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!token) throw unauthorized('auth.missingRefreshToken');

    const result = await authService.refresh(token, {
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent') ?? null,
    });
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  validate({ body: refreshSchema }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const fromBody = body<z.infer<typeof refreshSchema>>(req).refreshToken;
    const token = fromBody ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.status(204).send();
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    await authService.logout(undefined, req.user!.id);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.status(204).send();
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authRateLimit,
  validate({ body: changePasswordSchema }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof changePasswordSchema>>(req);
    await authService.changePassword(req.user!.id, input.currentPassword, input.newPassword);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  responds({ 200: userResponse }),
  asyncHandler(async (req, res) => {
    const user = await db
      .selectFrom('users')
      .select([
        'id',
        'email',
        'full_name',
        'locale',
        'timezone',
        'base_currency',
        'avatar_url',
        'email_verified_at',
      ])
      .where('id', '=', req.user!.id)
      .executeTakeFirstOrThrow();
    res.json({ user: toPublicUser(user) });
  }),
);

/**
 * Always 204, whether or not the address has an account — see
 * `requestPasswordReset`. `authRateLimit` bounds it on both axes: the calling
 * address, and the account named in the body (when there is one).
 */
authRouter.post(
  '/forgot-password',
  authRateLimit,
  validate({ body: forgotPasswordSchema }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof forgotPasswordSchema>>(req);
    await authService.requestPasswordReset(input.email);
    res.status(204).send();
  }),
);

/**
 * Consumes the emailed token and signs the caller back in, the same shape
 * `login` returns — see `resetPassword` for why.
 */
authRouter.post(
  '/reset-password',
  authRateLimit,
  validate({ body: resetPasswordSchema }),
  responds({ 200: authResultResponse }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof resetPasswordSchema>>(req);
    const result = await authService.resetPassword(input.token, input.newPassword, {
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent') ?? null,
    });
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  }),
);

/**
 * Unauthenticated: the token itself proves control of the inbox, and the link
 * may be opened on a device with no session at all.
 */
authRouter.post(
  '/verify-email',
  authRateLimit,
  validate({ body: verifyEmailSchema }),
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof verifyEmailSchema>>(req);
    await authService.verifyEmail(input.token);
    res.status(204).send();
  }),
);

authRouter.post(
  '/resend-verification',
  requireAuth,
  authRateLimit,
  responds({ 204: NO_BODY }),
  asyncHandler(async (req, res) => {
    await authService.resendVerification(req.user!.id);
    res.status(204).send();
  }),
);
