import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/config -> src -> apps/api -> apps -> repo root
loadDotenv({ path: path.resolve(here, '../../../../.env') });
loadDotenv(); // allow an apps/api/.env to override, if present

const durationPattern = /^\d+(ms|s|m|h|d)$/;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().regex(durationPattern).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

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
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),

  BASE_CURRENCY: z
    .string()
    .length(3)
    .default('BRL')
    .transform((v) => v.toUpperCase()),
  EXCHANGE_RATE_PROVIDER: z.enum(['static', 'openexchangerates']).default('static'),
  EXCHANGE_RATE_API_URL: z.string().optional(),
  EXCHANGE_RATE_API_KEY: z.string().optional(),

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
