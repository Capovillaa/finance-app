import { createRequire } from 'node:module';
import { pino } from 'pino';
import { env } from '../config/env.js';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.token_hash',
];

/**
 * Human-readable output, but only if it is genuinely available.
 *
 * `pino-pretty` is a devDependency, so a pruned production image legitimately
 * does not have it — and pino throws on a transport target it cannot resolve,
 * at import, before any logger exists to report it. The process then dies
 * without explaining itself. That is not hypothetical: a container that
 * inherited `NODE_ENV=development` from a mounted `.env` did exactly this, and
 * restarted in a loop with a stack trace about "transport target" as its only
 * clue. Asking only when the module is really there means the worst case is
 * plain JSON logs.
 */
function prettyTransport(): { target: string; options: Record<string, unknown> } | undefined {
  if (!env.isDevelopment) return undefined;
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
  } catch {
    return undefined;
  }
  return {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
  };
}

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'finance-api', env: env.NODE_ENV },
  transport: prettyTransport(),
});

export type Logger = typeof logger;
