import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { addDays, today } from '../lib/dates.js';
import { notificationEmail, sendEmail } from '../lib/email.js';
import { resolveLocale } from '../lib/i18n.js';
import { logger } from '../lib/logger.js';
import { evaluateWorkspaceAlerts, workspacesWithAlerts } from '../modules/alerts/engine.js';
import { refreshRates } from '../modules/currencies/service.js';
import { markDelivery, pendingDeliveries } from '../modules/notifications/service.js';
import { purgeExpiredTokens } from '../modules/auth/tokens.js';
import { purgeExpiredPreviews } from '../modules/imports/service.js';
import { dueSchedules, materializeSchedule } from '../modules/recurring/service.js';
import { purgeDueAccountDeletions } from '../modules/users/service.js';
import { expireStaleInvitations } from '../modules/workspaces/invitations.js';
import type { AlertJobData, MaintenanceJobData, RecurringJobData } from './queues.js';

/**
 * Materialises upcoming transactions for recurring schedules.
 *
 * The horizon runs a little ahead of today so bills exist before they are due —
 * that is what lets the "bill due" alert fire with lead time and what makes the
 * upcoming-bills panel useful.
 */
export async function processRecurring(data: RecurringJobData): Promise<{ processed: number; created: number }> {
  const through = data.through ?? addDays(today('UTC'), 7);

  const ids = data.scheduleId ? [data.scheduleId] : await dueSchedules(through);
  let created = 0;

  for (const id of ids) {
    try {
      const result = await materializeSchedule(id, through);
      created += result.created;
    } catch (err) {
      // One broken schedule (deleted account, say) must not stall the sweep.
      logger.error({ err, scheduleId: id }, 'Failed to materialise recurring schedule');
    }
  }

  if (ids.length > 0) logger.info({ processed: ids.length, created, through }, 'Recurring sweep complete');
  return { processed: ids.length, created };
}

export async function processAlerts(data: AlertJobData): Promise<{ workspaces: number; notifications: number }> {
  const asOf = data.asOf ?? today('UTC');
  const workspaceIds = data.workspaceId ? [data.workspaceId] : await workspacesWithAlerts();

  let notifications = 0;
  for (const workspaceId of workspaceIds) {
    try {
      const summary = await evaluateWorkspaceAlerts(workspaceId, asOf);
      notifications += summary.notificationsCreated;
    } catch (err) {
      logger.error({ err, workspaceId }, 'Alert evaluation failed for workspace');
    }
  }

  if (notifications > 0) {
    logger.info({ workspaces: workspaceIds.length, notifications }, 'Alert sweep complete');
  }
  return { workspaces: workspaceIds.length, notifications };
}

/**
 * Sends queued email notifications. Each delivery row tracks its own attempt
 * count, so a permanently failing address is retried a bounded number of times
 * and then left alone.
 */
export async function processDeliveries(): Promise<{ sent: number; failed: number }> {
  const pending = await pendingDeliveries('email', 50);
  let sent = 0;
  let failed = 0;

  for (const delivery of pending) {
    const data = (delivery.data ?? {}) as Record<string, unknown>;
    const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId : null;

    const ok = await sendEmail(
      notificationEmail({
        to: delivery.email,
        fullName: delivery.full_name,
        title: delivery.title,
        message: delivery.message,
        url: workspaceId ? `${env.WEB_BASE_URL}/workspaces/${workspaceId}` : env.WEB_BASE_URL,
        locale: resolveLocale(delivery.locale),
      }),
    );

    if (ok) {
      await markDelivery(delivery.delivery_id, 'sent');
      sent += 1;
    } else {
      await markDelivery(delivery.delivery_id, delivery.attempts >= 4 ? 'failed' : 'pending', 'SMTP send failed');
      failed += 1;
    }
  }

  // Push delivery has no provider wired up yet; mark it skipped so the rows do
  // not accumulate as permanently pending.
  const push = await pendingDeliveries('push', 100);
  for (const delivery of push) {
    await markDelivery(delivery.delivery_id, 'skipped', 'Push provider not configured');
  }

  return { sent, failed };
}

export async function processMaintenance(data: MaintenanceJobData): Promise<{ task: string; affected: number }> {
  switch (data.task) {
    case 'purge_tokens': {
      const affected = await purgeExpiredTokens();
      logger.info({ affected }, 'Purged expired refresh tokens');
      return { task: data.task, affected };
    }
    case 'expire_invitations': {
      const affected = await expireStaleInvitations();
      logger.info({ affected }, 'Expired stale invitations');
      return { task: data.task, affected };
    }
    case 'refresh_rates': {
      // Which provider answers is `EXCHANGE_RATE_PROVIDER`'s business, and a
      // live provider that cannot be reached falls back inside the service
      // rather than failing the job — see `refreshRates`.
      const affected = await refreshRates();
      return { task: data.task, affected };
    }
    case 'purge_import_previews': {
      const affected = await purgeExpiredPreviews();
      if (affected > 0) logger.info({ affected }, 'Purged expired import previews');
      return { task: data.task, affected };
    }
    case 'purge_deleted_accounts': {
      // The irreversible half of `DELETE /users/me`: everything the request
      // scheduled happens here, once the grace period has run out and nobody
      // has signed in to call it off.
      const affected = await purgeDueAccountDeletions();
      if (affected > 0) logger.info({ affected }, 'Erased accounts past their deletion grace period');
      return { task: data.task, affected };
    }
    default:
      return { task: 'unknown', affected: 0 };
  }
}

/** Cheap liveness probe for the worker process. */
export async function workerHealthy(): Promise<boolean> {
  const row = await db.selectFrom('currencies').select('code').limit(1).executeTakeFirst();
  return row !== undefined;
}
