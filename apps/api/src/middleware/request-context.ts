import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

/** Assigns (or adopts) a correlation id and echoes it on the response. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { requestId?: string }).requestId ?? randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => ({ userId: (req as { user?: { id: string } }).user?.id }),
  autoLogging: {
    // Health probes would otherwise dominate the log volume.
    ignore: (req) => req.url === '/health' || req.url === '/health/ready',
  },
});

/** Client IP that respects a single trusted proxy hop. */
export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}
