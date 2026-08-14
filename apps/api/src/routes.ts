import { Router } from 'express';
import { requireAuth, withWorkspace } from './middleware/auth.js';
import { uuidSchema, validate } from './middleware/validate.js';
import { z } from 'zod';
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

workspaceScoped.use('/:workspaceId/accounts', accountRouter);
workspaceScoped.use('/:workspaceId/categories', categoryRouter);
workspaceScoped.use('/:workspaceId/transactions', transactionRouter);
workspaceScoped.use('/:workspaceId/tags', tagRouter);
workspaceScoped.use('/:workspaceId/imports', importRouter);
workspaceScoped.use('/:workspaceId/budgets', budgetRouter);
workspaceScoped.use('/:workspaceId/recurring', recurringRouter);
workspaceScoped.use('/:workspaceId/goals', goalRouter);
workspaceScoped.use('/:workspaceId/alerts', alertRouter);
workspaceScoped.use('/:workspaceId/analytics', analyticsRouter);
workspaceScoped.use('/:workspaceId/reports', reportRouter);

export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/currencies', currencyRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/invitations', invitationRouter);

// Workspace CRUD and membership live on the same prefix as the scoped modules.
apiRouter.use('/workspaces', workspaceRouter);
apiRouter.use('/workspaces', requireAuth, workspaceScoped);
