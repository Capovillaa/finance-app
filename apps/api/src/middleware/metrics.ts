import type { RequestHandler } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../lib/metrics.js';

/**
 * Records request duration and count against a *route pattern*, never a raw
 * path — `/workspaces/01a0.../accounts` would otherwise mint a fresh
 * Prometheus time series per workspace ID, which is exactly the cardinality
 * explosion Prometheus's own docs warn against.
 *
 * `req.route` is only populated once Express has actually matched a route,
 * which has not happened yet at the point this middleware itself runs (it is
 * mounted early, on `/api/v1`, before the router). Reading it inside the
 * `res.on('finish', …)` callback instead works because that fires after the
 * whole request/response cycle — routing included — so `req.route` is set by
 * then for anything that matched. Anything that did not (a 404, a scanner
 * probing random paths) is bucketed under the fixed label `'unmatched'`
 * rather than its raw path, for the same cardinality reason.
 */
export function httpMetrics(): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route ? `${req.baseUrl}${req.route.path as string}` : 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };

      httpRequestDuration.observe(labels, seconds);
      httpRequestsTotal.inc(labels);
    });

    next();
  };
}
