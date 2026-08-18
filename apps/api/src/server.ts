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

/** Promisifies `server.close`, so shutdown can genuinely wait for it. */
function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    void (async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Shutting down');

      // The 10-second ceiling still applies to the whole sequence — an idle
      // keep-alive socket can leave `server.close`'s callback waiting
      // indefinitely, which is exactly the case this exists to bound.
      const timeout = setTimeout(() => {
        logger.warn('Forcing exit after shutdown timeout');
        process.exit(1);
      }, 10_000);
      timeout.unref();

      try {
        // Stop accepting new connections and *wait* for in-flight ones to
        // finish before touching the pools. `server.close()` on its own is
        // fire-and-forget: destroying the database and Redis connections in
        // parallel with it, as this used to, dropped the connection out from
        // under any request still executing — a 500, mid-query, on every
        // rolling deploy — despite the comment here claiming the opposite.
        await closeServer(server);
        logger.info('HTTP server closed');
        await Promise.allSettled([closeDatabase(), closeRedis()]);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
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
