import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase, pingDatabase } from './db/client.js';
import { migrateToLatest } from './db/migrate.js';
import { db } from './db/client.js';
import { logger } from './lib/logger.js';
import { closeRedis, connectRedis } from './lib/redis.js';

async function start(): Promise<void> {
  await pingDatabase();
  logger.info('Database connection established');

  // Migrating on boot keeps a single-instance deployment simple. Multi-instance
  // rollouts should run `npm run migrate` as a release step instead.
  if (!env.isProduction) {
    await migrateToLatest(db);
  }

  await connectRedis();
  logger.info('Redis connection established');

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Finance API listening');
  });

  installShutdownHandlers(server);
}

function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    void (async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Shutting down');

      // Stop accepting new connections, then release the pools so in-flight
      // requests get a chance to finish.
      server.close(() => logger.info('HTTP server closed'));

      const timeout = setTimeout(() => {
        logger.warn('Forcing exit after shutdown timeout');
        process.exit(1);
      }, 10_000);
      timeout.unref();

      try {
        await Promise.allSettled([closeDatabase(), closeRedis()]);
      } finally {
        clearTimeout(timeout);
        process.exit(0);
      }
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception; exiting');
    process.exit(1);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
