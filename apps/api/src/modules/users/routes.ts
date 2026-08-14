import {
  currencyField,
  localeField,
  nameField,
  timezoneField,
  urlField,
} from '@finance/schemas';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { asyncHandler } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { body, validate } from '../../middleware/validate.js';
import { recordActivity } from '../activity/service.js';
import { toPublicUser } from '../auth/service.js';
import { revokeAllUserTokens } from '../auth/tokens.js';
import { exportUserData } from './service.js';

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
  asyncHandler(async (req, res) => {
    const data = await exportUserData(req.user!.id);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="finance-export-${req.user!.id}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }),
);

/**
 * GDPR erasure. The account is anonymised rather than hard-deleted so that
 * shared-workspace history stays coherent for the other members, and every
 * session is revoked immediately.
 */
userRouter.delete(
  '/me',
  validate({ body: z.object({ confirm: z.literal(true) }) }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    await db.transaction().execute(async (trx) => {
      const owned = await trx
        .selectFrom('workspaces')
        .select('id')
        .where('owner_id', '=', userId)
        .where('archived_at', 'is', null)
        .execute();

      // Workspaces the user owns alone go with them; shared ones must have
      // ownership transferred first.
      for (const workspace of owned) {
        const otherMembers = await trx
          .selectFrom('workspace_members')
          .select('user_id')
          .where('workspace_id', '=', workspace.id)
          .where('user_id', '<>', userId)
          .execute();

        if (otherMembers.length === 0) {
          await trx.deleteFrom('workspaces').where('id', '=', workspace.id).execute();
        } else {
          await trx
            .updateTable('workspaces')
            .set({ archived_at: new Date() })
            .where('id', '=', workspace.id)
            .execute();
        }
      }

      await trx
        .updateTable('users')
        .set({
          status: 'deleted',
          deleted_at: new Date(),
          email: `deleted+${userId}@finance.local`,
          full_name: 'Deleted user',
          password_hash: null,
          avatar_url: null,
        })
        .where('id', '=', userId)
        .execute();

      await revokeAllUserTokens(userId, trx);
    });

    await recordActivity({
      actorUserId: userId,
      action: 'user.deleted',
      entityType: 'user',
      entityId: userId,
      summary: 'Account deleted at the user\'s request',
      auditOnly: true,
    });

    res.status(204).send();
  }),
);
