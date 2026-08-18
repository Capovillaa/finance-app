import {
  currencyField,
  LIMITS,
  localeField,
  nameField,
  timezoneField,
  urlField,
} from '@finance/schemas';
import { Router } from 'express';
import { z } from 'zod/v4';
import { db } from '../../db/client.js';
import { asyncHandler } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { media, responds } from '../../middleware/responds.js';
import { body, validate } from '../../middleware/validate.js';
import { userResponse } from '../auth/responses.js';
import { toPublicUser } from '../auth/service.js';
import { deletionScheduledResponse } from './responses.js';
import { exportUserData, requestAccountDeletion } from './service.js';

/**
 * A password being *checked*, not being set: no policy, only a bound, so that
 * an account created before a policy change can still prove itself. The same
 * schema `auth/routes.ts` uses for `currentPassword`.
 */
const suppliedPasswordSchema = z.string().min(1, 'validation.passwordRequired').max(LIMITS.password.max);

export const userRouter: Router = Router();

userRouter.use(requireAuth);

userRouter.patch(
  '/me',
  validate({
    body: z.object({
      fullName: nameField.optional(),
      avatarUrl: urlField.nullish(),
      locale: localeField.optional(),
      timezone: timezoneField.optional(),
      baseCurrency: currencyField.optional(),
    }),
  }),
  responds({ 200: userResponse }),
  asyncHandler(async (req, res) => {
    const input = body<{
      fullName?: string;
      avatarUrl?: string | null;
      locale?: string;
      timezone?: string;
      baseCurrency?: string;
    }>(req);

    const user = await db
      .updateTable('users')
      .set({
        ...(input.fullName !== undefined ? { full_name: input.fullName.trim() } : {}),
        ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.baseCurrency !== undefined ? { base_currency: input.baseCurrency.toUpperCase() } : {}),
      })
      .where('id', '=', req.user!.id)
      .returning(['id', 'email', 'full_name', 'locale', 'timezone', 'base_currency', 'avatar_url'])
      .executeTakeFirstOrThrow();

    res.json({ user: toPublicUser(user) });
  }),
);

/** GDPR: a full machine-readable copy of everything tied to this account. */
userRouter.get(
  '/me/export',
  responds({
    200: media(
      'application/json',
      'Every row tied to this account, as a downloadable file. The shape follows the database rather ' +
        'than the API, so it is deliberately not modelled here.',
    ),
  }),
  asyncHandler(async (req, res) => {
    const data = await exportUserData(req.user!.id);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="finance-export-${req.user!.id}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }),
);

/**
 * GDPR erasure, scheduled rather than performed.
 *
 * It used to happen inside this handler, behind a bearer token and a
 * `{ confirm: true }` body — a hard delete of every solely-owned workspace and
 * all of its financial history, with no undo. Three things guard it now: the
 * account password, so a fifteen-minute access token is not by itself enough to
 * destroy someone's records; `authRateLimit`, because this endpoint now takes a
 * password and every endpoint that does is a guessing oracle; and a grace
 * period, during which signing in cancels the request.
 *
 * The erasure itself, once the window closes, is `eraseAccount` in the service —
 * shared with the maintenance task that calls it, so the two can never drift.
 */
userRouter.delete(
  '/me',
  authRateLimit,
  validate({ body: z.object({ confirm: z.literal(true), currentPassword: suppliedPasswordSchema }) }),
  responds({ 200: deletionScheduledResponse }),
  asyncHandler(async (req, res) => {
    const input = body<{ confirm: true; currentPassword: string }>(req);
    const { deletionScheduledFor } = await requestAccountDeletion(req.user!.id, input.currentPassword);

    res.json({ deletionScheduledFor: deletionScheduledFor.toISOString() });
  }),
);
