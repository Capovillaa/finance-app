import { Router } from 'express';
import { mount } from './lib/route-metadata.js';
import { requireAuth, withWorkspace } from './middleware/auth.js';
import { uuidSchema, validate } from './middleware/validate.js';
import { z } from 'zod/v4';
import { accountRouter } from './modules/accounts/routes.js';
import { alertRouter } from './modules/alerts/routes.js';
import { analyticsRouter, reportRouter } from './modules/analytics/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { budgetRouter } from './modules/budgets/routes.js';
import { categoryRouter } from './modules/categories/routes.js';
import { currencyRouter } from './modules/currencies/routes.js';
import { goalRouter } from './modules/goals/routes.js';
import { importRouter } from './modules/imports/routes.js';
import { notificationRouter } from './modules/notifications/routes.js';
import { recurringRouter } from './modules/recurring/routes.js';
import { tagRouter } from './modules/tags/routes.js';
import { transactionRouter } from './modules/transactions/routes.js';
import { userRouter } from './modules/users/routes.js';
import { invitationRouter, workspaceRouter } from './modules/workspaces/routes.js';

/**
 * Sub-routers mounted under `/workspaces/:workspaceId`. Authentication and
 * workspace membership are resolved once here, so no individual route can
 * forget to scope its queries — `requireViewer` and friends then narrow by role.
 */
const workspaceScoped: Router = Router({ mergeParams: true });

workspaceScoped.use(
  '/:workspaceId',
  validate({ params: z.object({ workspaceId: uuidSchema }) }),
  withWorkspace,
);

// `mount` is `use` that also remembers the literal prefix, so the OpenAPI
// generator can assemble an exact path instead of unescaping Express's compiled
// `RegExp` — see `lib/route-metadata.ts`.
mount(workspaceScoped, '/:workspaceId/accounts', accountRouter);
mount(workspaceScoped, '/:workspaceId/categories', categoryRouter);
mount(workspaceScoped, '/:workspaceId/transactions', transactionRouter);
mount(workspaceScoped, '/:workspaceId/tags', tagRouter);
mount(workspaceScoped, '/:workspaceId/imports', importRouter);
mount(workspaceScoped, '/:workspaceId/budgets', budgetRouter);
mount(workspaceScoped, '/:workspaceId/recurring', recurringRouter);
mount(workspaceScoped, '/:workspaceId/goals', goalRouter);
mount(workspaceScoped, '/:workspaceId/alerts', alertRouter);
mount(workspaceScoped, '/:workspaceId/analytics', analyticsRouter);
mount(workspaceScoped, '/:workspaceId/reports', reportRouter);

export const apiRouter: Router = Router();

mount(apiRouter, '/auth', authRouter);
mount(apiRouter, '/users', userRouter);
mount(apiRouter, '/currencies', currencyRouter);
mount(apiRouter, '/notifications', notificationRouter);
mount(apiRouter, '/invitations', invitationRouter);

// Workspace CRUD and membership live on the same prefix as the scoped modules.
mount(apiRouter, '/workspaces', workspaceRouter);
mount(apiRouter, '/workspaces', requireAuth, workspaceScoped);
