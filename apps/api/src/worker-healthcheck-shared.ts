/**
 * Shared between `worker.ts`, which writes the heartbeat, and
 * `worker-healthcheck.ts`, which reads it — kept in one place so the two
 * halves of this liveness signal cannot silently disagree about the path or
 * about what "stale" means. See finding P-6 in AUDIT_REPORT.md.
 */
export const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/worker-heartbeat';

/** How often the worker updates the heartbeat, once it has confirmed it is actually healthy. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Three missed writes' worth of grace — generous enough that neither a slow
 * `workerHealthy()` query nor an ordinary GC pause reads as "wedged," tight
 * enough that a genuinely stuck worker is caught within about a minute.
 */
export const HEARTBEAT_STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 3;

/** The pure half of the check — separated so it is testable with no filesystem or process involved. */
export function isHeartbeatStale(writtenAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(writtenAtMs)) return true;
  return nowMs - writtenAtMs > HEARTBEAT_STALE_AFTER_MS;
}
