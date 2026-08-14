import type { RequestHandler } from 'express';
import { RateLimiterMemory, RateLimiterRedis, type RateLimiterAbstract } from 'rate-limiter-flexible';
import { env } from '../config/env.js';
import { rateLimited } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';

function createLimiter(keyPrefix: string, points: number, duration: number): RateLimiterAbstract {
  if (env.isTest) {
    // Tests hammer the auth routes deliberately; keep limiting in-process and
    // generous so unrelated cases do not trip each other's budget.
    return new RateLimiterMemory({ keyPrefix, points: points * 1000, duration });
  }
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix,
    points,
    duration,
    // If Redis is unreachable, fall back to a local counter rather than 500.
    insuranceLimiter: new RateLimiterMemory({ keyPrefix: `${keyPrefix}_ins`, points, duration }),
  });
}

const globalLimiter = createLimiter(
  'rl_global',
  env.RATE_LIMIT_MAX_REQUESTS,
  env.RATE_LIMIT_WINDOW_SECONDS,
);

const authLimiter = createLimiter(
  'rl_auth',
  env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  env.RATE_LIMIT_WINDOW_SECONDS,
);

function limiterMiddleware(limiter: RateLimiterAbstract, keyFn: (req: Parameters<RequestHandler>[0]) => string): RequestHandler {
  return (req, res, next) => {
    const key = keyFn(req);
    limiter
      .consume(key)
      .then((result) => {
        res.setHeader('x-ratelimit-remaining', String(result.remainingPoints));
        next();
      })
      .catch((rejection: unknown) => {
        if (rejection instanceof Error) {
          logger.error({ err: rejection }, 'Rate limiter failure, allowing request');
          next();
          return;
        }
        const retryMs = (rejection as { msBeforeNext?: number }).msBeforeNext ?? 1000;
        res.setHeader('retry-after', String(Math.ceil(retryMs / 1000)));
        next(rateLimited());
      });
  };
}

/** Per-user when authenticated, otherwise per-IP. */
export const globalRateLimit = limiterMiddleware(globalLimiter, (req) => req.user?.id ?? req.ip ?? 'unknown');

/**
 * Credential endpoints are limited per IP *and* per submitted email so a single
 * attacker cannot rotate IPs to brute-force one account.
 */
export const authRateLimit = limiterMiddleware(authLimiter, (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
  return `${req.ip ?? 'unknown'}:${email}`;
});
