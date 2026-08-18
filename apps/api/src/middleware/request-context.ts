import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

/**
 * Adopted, not merely capped: a length check alone still let a client hand
 * this process a control character or a newline, which lands verbatim in
 * every log line for the request and in the echoed response header — log
 * injection and correlation-id poisoning (L-1 in AUDIT_REPORT.md). The
 * charset below matches what every generator that actually produces one of
 * these emits (a UUID, a ULID, a trace id): letters, digits and `-`/`_`.
 * Anything else is treated the same as "no header sent" and gets a fresh id
 * instead of being sanitised — there is no way to un-poison a string that
 * already needed sanitising without also changing what the caller sent, so
 * it is simpler and safer to refuse it outright.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Assigns (or adopts) a correlation id and echoes it on the response. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
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
