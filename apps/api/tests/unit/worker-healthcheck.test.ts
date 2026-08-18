import { describe, expect, it } from 'vitest';
import { HEARTBEAT_STALE_AFTER_MS, isHeartbeatStale } from '../../src/worker-healthcheck-shared.js';

/**
 * P-6 in AUDIT_REPORT.md: the worker had no liveness signal at all. This is
 * the one piece of `worker-healthcheck.ts` worth pulling out and testing on
 * its own — no filesystem, no `process.exit`, just "is this heartbeat old
 * enough to mean something is wrong."
 */
describe('isHeartbeatStale', () => {
  it('is not stale immediately after being written', () => {
    const now = Date.now();
    expect(isHeartbeatStale(now, now)).toBe(false);
  });

  it('is not stale just under the threshold', () => {
    const now = Date.now();
    expect(isHeartbeatStale(now - (HEARTBEAT_STALE_AFTER_MS - 1), now)).toBe(false);
  });

  it('is stale just over the threshold', () => {
    const now = Date.now();
    expect(isHeartbeatStale(now - (HEARTBEAT_STALE_AFTER_MS + 1), now)).toBe(true);
  });

  it('treats an unparsable heartbeat (NaN) as stale rather than as "just written"', () => {
    // A missing or corrupt heartbeat file reads as `NaN` once passed through
    // `Number(raw)` — this must fail closed, not compute a nonsensical age.
    expect(isHeartbeatStale(NaN, Date.now())).toBe(true);
  });
});
