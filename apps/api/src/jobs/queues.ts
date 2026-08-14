import { Queue, type JobsOptions } from 'bullmq';
import { createQueueConnection } from '../lib/redis.js';

export const QUEUE_NAMES = {
  recurring: 'recurring-materialization',
  alerts: 'alert-evaluation',
  maintenance: 'maintenance',
  delivery: 'notification-delivery',
} as const;

export interface RecurringJobData {
  /** Omit to sweep every due schedule across all workspaces. */
  scheduleId?: string;
  through?: string;
}

export interface AlertJobData {
  workspaceId?: string;
  asOf?: string;
}

export type MaintenanceJobData = {
  task: 'purge_tokens' | 'expire_invitations' | 'refresh_rates' | 'purge_import_previews';
};

export type DeliveryJobData = Record<string, never>;

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  // Keep a short history for debugging without letting Redis grow unbounded.
  removeOnComplete: { count: 100, age: 86_400 },
  removeOnFail: { count: 500, age: 7 * 86_400 },
};

// One shared connection per process; BullMQ duplicates it internally as needed.
const connection = createQueueConnection();

export const recurringQueue = new Queue<RecurringJobData>(QUEUE_NAMES.recurring, {
  connection,
  defaultJobOptions,
});
export const alertQueue = new Queue<AlertJobData>(QUEUE_NAMES.alerts, { connection, defaultJobOptions });
export const maintenanceQueue = new Queue<MaintenanceJobData>(QUEUE_NAMES.maintenance, {
  connection,
  defaultJobOptions,
});
export const deliveryQueue = new Queue<DeliveryJobData>(QUEUE_NAMES.delivery, {
  connection,
  defaultJobOptions,
});

export const allQueues = [recurringQueue, alertQueue, maintenanceQueue, deliveryQueue];

/**
 * Registers the repeatable jobs. Repeat keys are stable, so restarting the
 * worker re-uses the existing schedule instead of stacking duplicates.
 */
export async function registerSchedules(): Promise<void> {
  await recurringQueue.add(
    'sweep',
    {},
    { repeat: { pattern: '5 * * * *' }, jobId: 'recurring-sweep' }, // hourly at :05
  );

  await alertQueue.add(
    'sweep',
    {},
    { repeat: { pattern: '15 */3 * * *' }, jobId: 'alert-sweep' }, // every 3 hours
  );

  await deliveryQueue.add(
    'dispatch',
    {},
    { repeat: { pattern: '*/2 * * * *' }, jobId: 'delivery-dispatch' }, // every 2 minutes
  );

  await maintenanceQueue.add(
    'daily',
    { task: 'purge_tokens' },
    { repeat: { pattern: '0 3 * * *' }, jobId: 'maintenance-purge-tokens' },
  );
  await maintenanceQueue.add(
    'daily',
    { task: 'expire_invitations' },
    { repeat: { pattern: '10 3 * * *' }, jobId: 'maintenance-expire-invitations' },
  );
  await maintenanceQueue.add(
    'daily',
    { task: 'refresh_rates' },
    { repeat: { pattern: '30 4 * * *' }, jobId: 'maintenance-refresh-rates' },
  );
  // Hourly rather than daily: an abandoned import preview holds its whole file
  // in a jsonb column, so it is worth collecting sooner than a stale token.
  await maintenanceQueue.add(
    'hourly',
    { task: 'purge_import_previews' },
    { repeat: { pattern: '40 * * * *' }, jobId: 'maintenance-purge-import-previews' },
  );
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled(allQueues.map((queue) => queue.close()));
  await connection.quit().catch(() => connection.disconnect());
}
