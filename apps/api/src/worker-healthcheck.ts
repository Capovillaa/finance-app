/**
 * The worker's `HEALTHCHECK` command (docker-compose.deploy.yml). The worker
 * opens no HTTP port — `apps/api/Dockerfile`'s inherited `HEALTHCHECK` probes
 * one, which is why the deployed composition used to disable it outright
 * rather than have it report every worker unhealthy forever. Disabling a
 * wrong probe is not the same as having a right one: this is the liveness
 * signal that was missing, reading a heartbeat file `worker.ts` updates only
 * after `workerHealthy()` (`jobs/processors.ts`) confirms the database is
 * actually reachable — so a stale file means either the process is wedged or
 * its database connection is, and both are exactly what should fail the
 * check. See finding P-6 in AUDIT_REPORT.md.
 *
 * Deliberately reads the filesystem rather than querying the database itself:
 * a `HEALTHCHECK` that opens its own connection competes with the worker for
 * pool slots at the exact moment — a saturated pool — that answer matters
 * most.
 */
import { readFile } from 'node:fs/promises';
import { HEARTBEAT_PATH, isHeartbeatStale } from './worker-healthcheck-shared.js';

async function main(): Promise<void> {
  const raw = await readFile(HEARTBEAT_PATH, 'utf8');
  const writtenAt = Number(raw);

  if (isHeartbeatStale(writtenAt, Date.now())) {
    console.error(`Worker heartbeat is stale or unreadable (age: ${Date.now() - writtenAt}ms, raw: ${JSON.stringify(raw)})`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Worker healthcheck failed:', err);
  process.exit(1);
});
