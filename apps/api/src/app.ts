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
import { responds } from './middleware/responds.js';
import { resolveRequestLocale } from './middleware/locale.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { httpLogger, requestId } from './middleware/request-context.js';
import { buildDocument } from './openapi/document.js';
import { healthResponse, openApiDocumentResponse, readinessResponse } from './openapi/service-responses.js';
import { apiRouter } from './routes.js';

export function createApp(): Express {
  const app = express();

  // `X-Forwarded-For` is a header the *client* sends. Trusting it is what makes
  // `req.ip` correct behind a load balancer, and what makes it forgeable when
  // there is nothing in front — at which point every caller can mint a fresh
  // rate-limit bucket per request by changing a string. So it is configuration,
  // not a constant, and it defaults to trusting nothing: this repo's own compose
  // profile publishes the API directly, with no proxy anywhere.
  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(resolveRequestLocale);
  app.use(httpLogger);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      // Reflecting whatever origin asks, *with credentials*, is a development
      // convenience and only that. It used to apply to everything that was not
      // literally `NODE_ENV=production`, which quietly included any staging or
      // preview deployment — precisely the ones exposed to a network.
      origin: env.isDevelopment ? true : env.corsOrigins,
      credentials: true,
      // A browser cannot read a response header it was not told about, so the
      // rate-limit budget would be invisible to the client meant to respect it.
      exposedHeaders: [
        'x-request-id',
        'content-disposition',
        'retry-after',
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset',
      ],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Liveness: the process is up. Kept dependency-free so a database blip does
  // not cause the orchestrator to restart a healthy container.
  app.get('/health', responds({ 200: healthResponse }), (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), env: env.NODE_ENV });
  });

  // Readiness: this instance can actually serve traffic.
  //
  // Unauthenticated and outside the rate limiter, because an orchestrator has
  // no credentials and a probe that can be throttled is not a probe. That makes
  // it the one route where an anonymous caller can drive load onto Postgres and
  // Redis for free, so the result is cached for a second and concurrent probes
  // share one round of checks. A second is far below any sensible probe interval
  // and far above the rate a prober could otherwise multiply.
  const READINESS_TTL_MS = 1000;
  let readinessCache: { at: number; value: { database: string; redis: string } } | null = null;
  let readinessInFlight: Promise<{ database: string; redis: string }> | null = null;

  const readiness = async (): Promise<{ database: string; redis: string }> => {
    if (readinessCache && Date.now() - readinessCache.at < READINESS_TTL_MS) {
      return readinessCache.value;
    }
    readinessInFlight ??= (async () => {
      try {
        const checks = await Promise.allSettled([pingDatabase(), pingRedis()]);
        const [database, redis] = checks.map((check) => (check.status === 'fulfilled' ? 'ok' : 'down'));
        const value = { database: database!, redis: redis! };
        readinessCache = { at: Date.now(), value };
        return value;
      } finally {
        readinessInFlight = null;
      }
    })();
    return readinessInFlight;
  };

  app.get(
    '/health/ready',
    responds({ 200: readinessResponse, 503: readinessResponse }),
    asyncHandler(async (_req, res) => {
      const { database, redis } = await readiness();
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
  app.get('/openapi.json', responds({ 200: openApiDocumentResponse }), (_req, res) => {
    document ??= buildDocument(app);
    res.json(document);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
