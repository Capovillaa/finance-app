import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { pool } from '../db/client.js';
import { redis } from './redis.js';

/**
 * Finding P-2 in AUDIT_REPORT.md: observability was structured pino logs to
 * stdout and nothing else — no metrics, no alerting on the
 * "rate limiting is running on the per-process fallback" warning
 * `middleware/rate-limit.ts` was written specifically to emit. A warning
 * nobody can alert on is the same as no warning.
 *
 * This covers the half of P-2 that is genuinely buildable without a real
 * external account: a `/metrics` endpoint in the standard Prometheus text
 * format. An error tracker (Sentry or similar) and distributed tracing both
 * need a real subscription to be worth wiring — see the "deliberately not
 * built" note in `docs/decisions.md` for why nothing here pretends to have
 * one. `infra/prometheus/alerts.example.yml` gives the alert rules an
 * operator would point at these metrics.
 *
 * Safe to leave unauthenticated: same reasoning as `/health` and
 * `/health/ready` — an orchestrator or a Prometheus scraper has no
 * credentials, and in `docker-compose.deploy.yml` the API publishes
 * no port of its own at all, so nothing outside the compose
 * network can reach this regardless.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  // Tuned for a request/response API rather than a streaming one: most of
  // this app's own endpoints answer in single-digit milliseconds, and the
  // request-timeout backstop (M-4) gives up at REQUEST_TIMEOUT_MS.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

// Read at scrape time rather than pushed on change, so this never drifts from
// whatever `pool` actually reports — the three counts `pg` already tracks
// for its own purposes.
new Gauge({
  name: 'pg_pool_total_connections',
  help: 'Total connections in the Postgres pool (in use + idle)',
  registers: [registry],
  collect() {
    this.set(pool.totalCount);
  },
});
new Gauge({
  name: 'pg_pool_idle_connections',
  help: 'Idle connections in the Postgres pool',
  registers: [registry],
  collect() {
    this.set(pool.idleCount);
  },
});
new Gauge({
  name: 'pg_pool_waiting_requests',
  help:
    'Queries waiting for a connection the pool has none free for. Sustained non-zero here is the ' +
    'leading indicator for M-4\'s failure mode: the pool is saturated and everyone else is queued behind it.',
  registers: [registry],
  collect() {
    this.set(pool.waitingCount);
  },
});

// Doubles as the signal `middleware/rate-limit.ts`'s "running on the
// per-process fallback" log warning has no alert wired to today: both are the
// same underlying fact, `redis.status !== 'ready'`. A gauge is what actually
// lets that warning drive a page instead of scrolling past in a log nobody is
// watching at 3am.
new Gauge({
  name: 'redis_connected',
  help:
    '1 if the shared Redis connection reports ready, 0 otherwise. 0 also means the rate limiter has ' +
    'fallen back to its per-process in-memory budget — see middleware/rate-limit.ts.',
  registers: [registry],
  collect() {
    this.set(redis.status === 'ready' ? 1 : 0);
  },
});
