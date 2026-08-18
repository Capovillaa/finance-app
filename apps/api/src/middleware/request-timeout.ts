import type { RequestHandler } from 'express';
import { serviceUnavailable } from '../lib/errors.js';

/**
 * Stops *waiting* on a slow handler and answers 503, rather than leaving a
 * caller hanging while ten concurrent slow requests quietly exhaust the whole
 * connection pool and the process stops serving anything else. Finding M-4 in
 * `AUDIT_REPORT.md`; the other half is `statement_timeout` and
 * `idle_in_transaction_session_timeout` in `db/client.ts`, which reclaim the
 * connection itself rather than only giving up on the client waiting for it.
 *
 * This cannot cancel the handler still running behind it — Node has no general
 * way to abort an arbitrary async function — so the database-side timeouts are
 * what actually free the pool. `errorHandler`'s `res.headersSent` guard is the
 * other half of that: if the original handler eventually finishes and tries to
 * write a response that already went out as a 503, that write fails and is
 * routed to Express's default handler instead of trying to send a second body.
 */
export function requestTimeout(ms: number): RequestHandler {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      next(serviceUnavailable());
    }, ms);
    // Never keeps the process alive on its own; shutdown has its own ceiling.
    timer.unref();

    res.once('finish', () => clearTimeout(timer));
    res.once('close', () => clearTimeout(timer));

    next();
  };
}
