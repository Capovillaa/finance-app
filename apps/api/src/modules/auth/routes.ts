import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { clientIp } from '../../middleware/request-context.js';
import { body, validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/http.js';
import { unauthorized } from '../../lib/errors.js';
import { db } from '../../db/client.js';
import * as authService from './service.js';
import { toPublicUser } from './service.js';

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Password must contain both letters and numbers');

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
  fullName: z.string().min(1).max(120),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
  baseCurrency: z.string().length(3).optional(),
  workspaceName: z.string().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

const REFRESH_COOKIE = 'finance_refresh_token';

export const authRouter: Router = Router();

/**
 * The refresh token is returned in the body (for native clients) *and* set as an
 * HttpOnly cookie (for browsers), so the web app never has to keep it in JS.
 */
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1/auth',
    maxAge: 30 * 86_400_000,
  });
}

authRouter.post(
  '/register',
  authRateLimit,
  validate({ body: registerSchema }),
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
  asyncHandler(async (req, res) => {
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'full_name', 'locale', 'timezone', 'base_currency', 'avatar_url'])
      .where('id', '=', req.user!.id)
      .executeTakeFirstOrThrow();
    res.json({ user: toPublicUser(user) });
  }),
);
