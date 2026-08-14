import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { pingDatabase } from './db/client.js';
import { asyncHandler } from './lib/http.js';
import { pingRedis } from './lib/redis.js';
import { mount } from './lib/route-metadata.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { resolveRequestLocale } from './middleware/locale.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { httpLogger, requestId } from './middleware/request-context.js';
import { buildDocument } from './openapi/document.js';
import { apiRouter } from './routes.js';

export function createApp(): Express {
  const app = express();

  // Behind one reverse proxy in every deployment target; needed for correct
  // client IPs in rate limiting and audit records.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(resolveRequestLocale);
  app.use(httpLogger);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.isProduction ? [env.WEB_BASE_URL] : true,
      credentials: true,
      exposedHeaders: ['x-request-id', 'content-disposition'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Liveness: the process is up. Kept dependency-free so a database blip does
  // not cause the orchestrator to restart a healthy container.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), env: env.NODE_ENV });
  });

  // Readiness: this instance can actually serve traffic.
  app.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      const checks = await Promise.allSettled([pingDatabase(), pingRedis()]);
      const [database, redis] = checks.map((check) => (check.status === 'fulfilled' ? 'ok' : 'down'));
      const ready = database === 'ok' && redis === 'ok';

      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', database, redis });
    }),
  );

  mount(app, '/api/v1', globalRateLimit, apiRouter);

  // Served from the app it describes, so what a caller reads is what this
  // process enforces. `docs/openapi.json` is the same document, committed so a
  // pull request shows the contract change in its diff and CI can fail on drift.
  // Built once on first request: walking the router and converting every schema
  // is pure work over structures that never change after boot.
  let document: unknown;
  app.get('/openapi.json', (_req, res) => {
    document ??= buildDocument(app);
    res.json(document);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
