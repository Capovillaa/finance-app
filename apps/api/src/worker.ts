import { writeFile } from 'node:fs/promises';
import { Worker, type Job } from 'bullmq';
import { env } from './config/env.js';
import { closeDatabase, pingDatabase } from './db/client.js';
import { logger } from './lib/logger.js';
import { closeRedis, connectRedis, createQueueConnection } from './lib/redis.js';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_PATH } from './worker-healthcheck-shared.js';
import {
  processAlerts,
  processDeliveries,
  processMaintenance,
  processRecurring,
  workerHealthy,
} from './jobs/processors.js';
import {
  QUEUE_NAMES,
  closeQueues,
  registerSchedules,
  type AlertJobData,
  type MaintenanceJobData,
  type RecurringJobData,
} from './jobs/queues.js';

const workers: Worker[] = [];

function attachLogging(worker: Worker): Worker {
  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error({ err, queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade }, 'Job failed');
  });
  worker.on('error', (err) => logger.error({ err, queue: worker.name }, 'Worker error'));
  workers.push(worker);
  return worker;
}

async function start(): Promise<void> {
  await pingDatabase();
  await connectRedis();
  logger.info('Worker dependencies ready');

  const connection = createQueueConnection();

  attachLogging(
    new Worker<RecurringJobData>(QUEUE_NAMES.recurring, async (job) => processRecurring(job.data), {
      connection,
      // Materialisation writes transactions; keep it serial so two runs cannot
      // race on the same schedule.
      concurrency: 1,
    }),
  );

  attachLogging(
    new Worker<AlertJobData>(QUEUE_NAMES.alerts, async (job) => processAlerts(job.data), {
      connection,
      concurrency: 2,
    }),
  );

  attachLogging(
    new Worker(QUEUE_NAMES.delivery, async () => processDeliveries(), { connection, concurrency: 1 }),
  );

  attachLogging(
    new Worker<MaintenanceJobData>(QUEUE_NAMES.maintenance, async (job) => processMaintenance(job.data), {
      connection,
      concurrency: 1,
    }),
  );

  if (env.ENABLE_SCHEDULER) {
    await registerSchedules();
    logger.info('Repeatable schedules registered');
  }

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'Worker started');
  const heartbeat = startHeartbeat();
  installShutdownHandlers(heartbeat);
}

/**
 * Writes the current time to `HEARTBEAT_PATH` every `HEARTBEAT_INTERVAL_MS`,
 * but only once `workerHealthy()` has actually confirmed the database is
 * reachable — a wedged event loop stops the interval from firing at all, and
 * a broken database connection stops it from ever writing, so either failure
 * mode shows up as the same thing to `worker-healthcheck.ts`: a stale file.
 * P-6 in AUDIT_REPORT.md.
 */
function startHeartbeat(): NodeJS.Timeout {
  const beat = async (): Promise<void> => {
    try {
      if (await workerHealthy()) {
        await writeFile(HEARTBEAT_PATH, String(Date.now()));
      }
    } catch (err) {
      logger.error({ err }, 'Worker heartbeat check failed');
    }
  };

  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  // Never keeps the process alive on its own — the BullMQ workers already do
  // that, and shutdown clears this explicitly rather than relying on it.
  timer.unref();
  return timer;
}

function installShutdownHandlers(heartbeat: NodeJS.Timeout): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    void (async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Worker shutting down');
      clearInterval(heartbeat);

      // `close()` waits for in-flight jobs, so a job is never abandoned midway
      // through writing transactions.
      await Promise.allSettled(workers.map((worker) => worker.close()));
      await closeQueues();
      await Promise.allSettled([closeDatabase(), closeRedis()]);
      process.exit(0);
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker');
  process.exit(1);
});
