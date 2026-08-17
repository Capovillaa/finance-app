import type { Request, RequestHandler } from 'express';
import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterAbstract,
  type RateLimiterRes,
} from 'rate-limiter-flexible';
import { env } from '../config/env.js';
import { rateLimited } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { stampRoute } from '../lib/route-metadata.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import {
  accountKey,
  bearerSubject,
  bearerToken,
  insurancePoints,
  ipKey,
  userKey,
} from './rate-limit-policy.js';

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
    // If Redis is unreachable, fall back to a local counter rather than 500 —
    // on a budget divided by the number of instances sharing that Redis, so
    // losing it costs precision rather than multiplying the advertised limit by
    // the size of the deployment. See `insurancePoints`.
    insuranceLimiter: new RateLimiterMemory({
      keyPrefix: `${keyPrefix}_ins`,
      points: insurancePoints(points, env.RATE_LIMIT_INSTANCES),
      duration,
    }),
  });
}

/** A budget, and the subject whose share of it this request spends. */
interface Charge {
  limiter: RateLimiterAbstract;
  /** The advertised size of the budget, for the `x-ratelimit-limit` header. */
  points: number;
  key: string;
}

const window = env.RATE_LIMIT_WINDOW_SECONDS;

const ipLimiter = createLimiter('rl_ip', env.RATE_LIMIT_IP_MAX_REQUESTS, window);
const userLimiter = createLimiter('rl_user', env.RATE_LIMIT_MAX_REQUESTS, window);
const authIpLimiter = createLimiter('rl_auth_ip', env.AUTH_RATE_LIMIT_MAX_REQUESTS, window);
const authAccountLimiter = createLimiter(
  'rl_auth_account',
  env.AUTH_RATE_LIMIT_MAX_PER_ACCOUNT,
  env.AUTH_RATE_LIMIT_ACCOUNT_WINDOW_SECONDS,
);

/**
 * Says once a minute that limiting has degraded to the per-process fallback.
 *
 * Without this the failure is completely silent: the API keeps serving, every
 * instance quietly enforces its own copy of the budget, and the first sign of
 * trouble is a bill or a breach. `rate-limiter-flexible` does not report which
 * store answered, so the Redis connection's own state is the signal.
 */
let lastDegradedLog = 0;
function noteDegradedStore(): void {
  if (env.isTest || redis.status === 'ready') return;
  const now = Date.now();
  if (now - lastDegradedLog < 60_000) return;
  lastDegradedLog = now;
  logger.warn(
    { redisStatus: redis.status, instances: env.RATE_LIMIT_INSTANCES },
    'Rate limiting is running on the per-process fallback; budgets are enforced per instance',
  );
}

/**
 * `rate-limiter-flexible` rejects with a `RateLimiterRes` when the budget is
 * spent and with an `Error` when the store itself failed. The two mean opposite
 * things, so they are never conflated: one is the limiter working, the other is
 * the limiter not working.
 */
function isBudgetRejection(reason: unknown): reason is RateLimiterRes {
  return !(reason instanceof Error) && typeof reason === 'object' && reason !== null;
}

interface LimiterOptions {
  /**
   * What to do when the store fails and the fallback cannot answer either.
   *
   * Availability wins on ordinary traffic — refusing every request because a
   * counter is unavailable turns a Redis blip into an outage. It does not win on
   * credential endpoints, where failing open means unlimited password guesses
   * for as long as the incident lasts, and where the traffic that suffers from
   * failing closed is a handful of sign-ins.
   */
  failOpen: boolean;
  /** Names the limiter in logs. */
  name: string;
}

function limiterMiddleware(
  charges: (req: Request) => Charge[],
  { failOpen, name }: LimiterOptions,
): RequestHandler {
  // Stamped so the generated OpenAPI document gives a 429 to the routes that
  // can actually return one, rather than to every route on principle.
  return stampRoute((req, res, next) => {
    noteDegradedStore();

    const wanted = charges(req);

    void Promise.allSettled(wanted.map((charge) => charge.limiter.consume(charge.key))).then(
      (results) => {
        let tightest: { limit: number; remaining: number; reset: number } | null = null;
        let rejected: RateLimiterRes | null = null;
        let failure: Error | null = null;

        // A plain loop rather than `forEach`: the results are folded into three
        // outer variables, and TypeScript's narrowing does not survive being
        // assigned from inside a callback.
        for (const [index, result] of results.entries()) {
          const charge = wanted[index]!;

          if (result.status === 'fulfilled') {
            const remaining = result.value.remainingPoints;
            if (!tightest || remaining < tightest.remaining) {
              tightest = {
                limit: charge.points,
                remaining,
                reset: Math.ceil(result.value.msBeforeNext / 1000),
              };
            }
            continue;
          }

          if (isBudgetRejection(result.reason)) {
            // The longest wait wins, so `retry-after` is never optimistic.
            if (!rejected || (result.reason.msBeforeNext ?? 0) > (rejected.msBeforeNext ?? 0)) {
              rejected = result.reason;
            }
            continue;
          }
          failure ??= result.reason as Error;
        }

        // A real rejection outranks a failure elsewhere: one bucket saying "over
        // budget" is an answer, and a second bucket being unreachable does not
        // make it less of one.
        if (rejected) {
          const retrySeconds = Math.ceil((rejected.msBeforeNext ?? 1000) / 1000);
          res.setHeader('retry-after', String(retrySeconds));
          res.setHeader('x-ratelimit-remaining', '0');
          res.setHeader('x-ratelimit-reset', String(retrySeconds));
          next(rateLimited());
          return;
        }

        if (failure) {
          logger.error({ err: failure, limiter: name, failOpen }, 'Rate limiter store failed');
          if (!failOpen) {
            res.setHeader('retry-after', '1');
            next(rateLimited());
            return;
          }
        }

        if (tightest) {
          const { limit, remaining, reset } = tightest;
          res.setHeader('x-ratelimit-limit', String(limit));
          res.setHeader('x-ratelimit-remaining', String(remaining));
          res.setHeader('x-ratelimit-reset', String(reset));
        }
        next();
      },
    );
  }, { rateLimited: true });
}

/**
 * Charged to the signed-in user *and* to the calling address.
 *
 * Both, not either. The per-user budget is the one that matters day to day: it
 * is what stops one account from monopolising the API, and it is what keeps a
 * whole office behind a single address from spending each other's allowance.
 * The per-address budget is a backstop, and it is deliberately looser — its job
 * is to bound what a flood, or a pile of freshly registered accounts, can do
 * from one place.
 *
 * The identity is recovered by verifying the bearer token here rather than by
 * reading `req.user`: this middleware is mounted on `/api/v1`, outside and above
 * every `requireAuth`, so `req.user` is *always* undefined at this point and the
 * limiter that thought it was keying per user had been keying per address for
 * its whole life. Verification is an HMAC over a few hundred bytes; a request
 * that fails it is charged to its address instead.
 */
export const globalRateLimit = limiterMiddleware(
  (req) => {
    const charges: Charge[] = [
      { limiter: ipLimiter, points: env.RATE_LIMIT_IP_MAX_REQUESTS, key: ipKey(req.ip) },
    ];
    const subject = bearerSubject(bearerToken(req.header('authorization')), verifyAccessToken);
    if (subject) {
      charges.push({
        limiter: userLimiter,
        points: env.RATE_LIMIT_MAX_REQUESTS,
        key: userKey(subject),
      });
    }
    return charges;
  },
  { failOpen: true, name: 'global' },
);

/**
 * Credential endpoints are limited on two independent axes: what one address may
 * attempt, and what one account may have attempted against it from anywhere.
 *
 * They have to be separate buckets. A single key combining both — `ip:email` —
 * reads like two dimensions and behaves like neither: every new address is a new
 * key, so an attacker with a list of proxies gets the whole budget again for
 * each one against the same account, which is precisely the attack the limit was
 * written to stop.
 */
export const authRateLimit = limiterMiddleware(
  (req) => {
    const charges: Charge[] = [
      { limiter: authIpLimiter, points: env.AUTH_RATE_LIMIT_MAX_REQUESTS, key: ipKey(req.ip) },
    ];
    const account = accountKey((req.body as { email?: unknown } | undefined)?.email);
    if (account) {
      charges.push({
        limiter: authAccountLimiter,
        points: env.AUTH_RATE_LIMIT_MAX_PER_ACCOUNT,
        key: account,
      });
    }
    return charges;
  },
  { failOpen: false, name: 'credentials' },
);
