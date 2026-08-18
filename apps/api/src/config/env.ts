import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
// Pure helpers only. This module is evaluated before almost everything else, so
// what it imports must not reach Redis, Express or the database — which is
// exactly the constraint `rate-limit-policy.ts` is written to satisfy.
import { parseTrustProxy } from '../middleware/rate-limit-policy.js';
import {
  checkProductionSecrets,
  crossOriginBaseUrls,
  formatSecretIssues,
  isDevelopmentMailHost,
} from './production-policy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/config -> src -> apps/api -> apps -> repo root
loadDotenv({ path: path.resolve(here, '../../../../.env') });
loadDotenv(); // allow an apps/api/.env to override, if present

const durationPattern = /^\d+(ms|s|m|h|d)$/;

const blankAsUndefined = z
  .string()
  .optional()
  .transform((v) => {
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  /**
   * Comma-separated browser origins allowed to call this API with credentials.
   * Defaults to the web client's own origin; development additionally reflects
   * whatever origin asks, which is convenient there and nowhere else.
   */
  CORS_ORIGINS: blankAsUndefined,
  /**
   * How much of `X-Forwarded-For` to believe. `false` (the default) trusts
   * nothing, because the header is client-supplied and believing it without a
   * proxy in front hands every caller a fresh rate-limit bucket per request.
   * Set it to the number of proxy hops in front of this process — `1` behind a
   * single load balancer — or to `loopback` / a list of trusted subnets.
   */
  TRUST_PROXY: z.string().default('false'),

  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /**
   * Sent as a Postgres session parameter on every pooled connection, so a
   * runaway query is killed by the server rather than holding a connection —
   * and, with the pool exhausted, everyone else's request — forever. Ten slow
   * analytics or report-export queries otherwise exhaust a pool of ten with
   * nothing to reclaim it.
   */
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /** Same mechanism, for a connection left idle inside an open transaction. */
  DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  /**
   * How long a request may run before the client is given up on and answered
   * 503. Deliberately looser than `DATABASE_STATEMENT_TIMEOUT_MS`, so an
   * ordinary slow query times out at the database first; this is the backstop
   * for a slow path that is not database-bound at all. See
   * `middleware/request-timeout.ts`.
   */
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // 16 is the floor for development and the test suite, which sign nothing that
  // outlives the process. Production is held to a much higher bar — length,
  // entropy, and not being one of the placeholders this public repository
  // publishes — by `production-policy.ts`, applied after this parse.
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  /**
   * HMAC key for password-reset and email-verification tokens.
   *
   * Deliberately its own secret rather than `JWT_REFRESH_SECRET`, which
   * already does double duty signing refresh tokens *and* workspace
   * invitation tokens (see the M-11 finding in `AUDIT_REPORT.md`) — a third
   * purpose on that one secret would only make an existing problem worse.
   * Held to the same production bar as the two JWT secrets below.
   */
  EMAIL_TOKEN_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().regex(durationPattern).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /**
   * How long a requested account erasure waits before it happens. Signing in
   * during the window cancels it, which is the whole undo mechanism — so this
   * is also how long a mistaken or coerced deletion stays recoverable. It is
   * not "how long we keep the data after erasure": the erasure itself is still
   * immediate and irreversible when it runs.
   */
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().positive().max(90).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // The default is the local MailHog sink, which is right in development and
  // silently wrong in production — an unreachable host makes `sendEmail` log a
  // failure and return false, and `createInvitation` does not read the result,
  // so an invitation that never left the building reports success. Production
  // therefore has to name its host explicitly; see the check after the parse.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_FROM: z.string().default('Finance App <no-reply@finance.local>'),

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  /** The everyday budget, charged to the signed-in user who spends it. */
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  /**
   * A per-address backstop, charged alongside the per-user budget. Deliberately
   * looser than it, because a whole office behind one address is ordinary and a
   * flood from one address is not — this bound exists to stop the flood, not to
   * ration a shared connection.
   */
  RATE_LIMIT_IP_MAX_REQUESTS: z.coerce.number().int().positive().default(1200),
  /**
   * How many instances of this process are running behind the same Redis. Used
   * only to divide the per-process fallback budget, so that losing Redis does
   * not multiply the advertised limit by the size of the deployment.
   */
  RATE_LIMIT_INSTANCES: z.coerce.number().int().positive().default(1),
  /** Credential attempts allowed from one address per window. */
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  /**
   * Credential attempts allowed against one account, from anywhere. This is the
   * bound that survives an attacker rotating addresses, so it is counted over a
   * much longer window than the per-address one.
   */
  AUTH_RATE_LIMIT_MAX_PER_ACCOUNT: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_ACCOUNT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  /**
   * `POST /imports/preview` per user, per window. Full CSV parsing,
   * three-language header inference, date-layout inference and per-row
   * duplicate detection against the ledger is real work behind an endpoint
   * the general per-user budget (`RATE_LIMIT_MAX_REQUESTS`, 300/min) never
   * treated as different from a cheap `GET`. See M-6 in AUDIT_REPORT.md.
   */
  IMPORT_PREVIEW_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(5),

  BASE_CURRENCY: z
    .string()
    .length(3)
    .default('BRL')
    .transform((v) => v.toUpperCase()),
  EXCHANGE_RATE_PROVIDER: z.enum(['static', 'openexchangerates', 'frankfurter']).default('static'),
  // A declared-but-empty line in `.env` (`EXCHANGE_RATE_API_URL=`) reaches us as
  // `''`, not as absent, and `??` will happily keep it — which is how an empty
  // override once produced `new URL('/latest')`. Blank means unset here.
  EXCHANGE_RATE_API_URL: blankAsUndefined,
  EXCHANGE_RATE_API_KEY: blankAsUndefined,
  EXCHANGE_RATE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  ENABLE_SCHEDULER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

const raw = parsed.data;

// A signing secret that anyone can read is not a secret, and the shape of this
// repository makes that a live risk rather than a theoretical one: it is public,
// the documented setup is `cp .env.example .env`, and the deployed compose
// profile runs with `NODE_ENV=production`. So production refuses to boot on a
// published, weak or shared secret instead of serving traffic anyone can forge a
// token against. Development and tests keep the 16-character floor above.
if (raw.NODE_ENV === 'production') {
  const secretIssues = checkProductionSecrets({
    JWT_ACCESS_SECRET: raw.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: raw.JWT_REFRESH_SECRET,
    EMAIL_TOKEN_SECRET: raw.EMAIL_TOKEN_SECRET,
  });

  if (secretIssues.length > 0) {
    throw new Error(formatSecretIssues(secretIssues));
  }

  // Mail is not optional here: it carries workspace invitations, and the
  // delivery path swallows its own failures by design so that a mail outage
  // cannot fail the request that triggered the message. Left on the development
  // default, a deployment therefore posts every invitation into a socket that
  // is not listening and reports success to the admin who sent it.
  // The refresh cookie is SameSite=Lax and is the only credential
  // `/auth/refresh` accepts, so a split origin does not degrade the session —
  // it ends it, fifteen minutes in, for every user, with nothing but a 401 to
  // show for it. Serve both from one host; the deployed composition's `web`
  // service proxies `/api` to the API for exactly this reason.
  if (crossOriginBaseUrls(raw.API_BASE_URL, raw.WEB_BASE_URL)) {
    throw new Error(
      `Refusing to start in production with the API and the web client on different origins:\n` +
        `  API_BASE_URL: ${new URL(raw.API_BASE_URL).origin}\n` +
        `  WEB_BASE_URL: ${new URL(raw.WEB_BASE_URL).origin}\n\n` +
        'The refresh cookie is SameSite=Lax, so a browser will not send it on a cross-site request:\n' +
        'every session would end at the first token refresh. Serve the client and the API from one\n' +
        'host — docker-compose.deploy.yml\'s `web` service proxies /api to the API container — and\n' +
        'point both variables at that host.',
    );
  }

  if (isDevelopmentMailHost(raw.SMTP_HOST)) {
    throw new Error(
      `Refusing to start in production with SMTP_HOST=${raw.SMTP_HOST}: that is a development\n` +
        'mail sink, and the deployed composition has none. Mail carries workspace invitations, and\n' +
        'a failed delivery is logged rather than raised — so this would lose them silently. Point\n' +
        'SMTP_HOST at a real provider (see .env.deploy.example).',
    );
  }
}

const isTest = raw.NODE_ENV === 'test';

export const env = {
  ...raw,
  /**
   * bcrypt is deliberately slow, which is the point in production and a tax in
   * tests — the suite registers users constantly. The minimum cost keeps the
   * same code path without spending ~300 ms per registration.
   */
  BCRYPT_ROUNDS: isTest ? 4 : raw.BCRYPT_ROUNDS,
  /**
   * Integration tests must never point at the development database: a suite
   * truncates tables between cases, so an accidental shared URL destroys data.
   */
  DATABASE_URL: isTest ? (raw.TEST_DATABASE_URL ?? deriveTestUrl(raw.DATABASE_URL)) : raw.DATABASE_URL,
  /** What `app.set('trust proxy', …)` is given. See `TRUST_PROXY` above. */
  trustProxy: parseTrustProxy(raw.TRUST_PROXY),
  /** Browser origins allowed to send credentialed requests. */
  corsOrigins: raw.CORS_ORIGINS
    ? raw.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [raw.WEB_BASE_URL],
  isProduction: raw.NODE_ENV === 'production',
  isTest,
  isDevelopment: raw.NODE_ENV === 'development',
} as const;

function deriveTestUrl(url: string): string {
  const parsedUrl = new URL(url);
  parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/$/, '')}_test`;
  return parsedUrl.toString();
}

export type Env = typeof env;
