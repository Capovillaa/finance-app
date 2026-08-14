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

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'finance-api', env: env.NODE_ENV },
  transport: env.isDevelopment
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});

export type Logger = typeof logger;
