# Release runbook

Finding **P-4** in `AUDIT_REPORT.md`: CI tests a migration up/down round-trip, which is more than
most projects have, but nothing documented *where* `npm run migrate` runs in a real release, *who*
runs it, how to roll back, or the rule a migration has to follow for the length of a rolling
deploy. This is that document. It assumes the deployment described in `CLAUDE.md` sections 5g and
5k — one image, three entrypoints, `docker-compose.deploy.yml`.

## The single-instance release (what this repository's own compose file does)

This is the deployment `docker-compose.deploy.yml` actually describes today, and it needs no
separate runbook step — the file already gates the rollout correctly:

```bash
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d --build
```

`migrate` runs to completion first; `api` and `worker` start only once it exits 0
(`depends_on: service_completed_successfully`, section 5g). A failed migration stops the release
here — neither `api` nor `worker` starts against a schema they do not match. **There is no
separate "who runs it": the same person (or the same CI job) that runs the command above is who
runs the migration, because it is one command.**

Check it worked:

```bash
docker compose -f docker-compose.deploy.yml logs migrate
docker compose -f docker-compose.deploy.yml ps
```

A `migrate` container that exited non-zero and `api`/`worker` that never started (still `created`,
not `running`) is the failure mode working as intended — see "If a migration fails" below.

## The rolling-deploy release (if this ever runs as more than one instance)

Nothing about the schema in this codebase currently *requires* more than one instance, and the
single compose file above only ever runs one of each. If a future deployment adds a second `api`
or `worker` replica — a real orchestrator, a second box behind a load balancer — the ordering
guarantee above stops being enough on its own, because for the length of the rollout, **two
different versions of the image are serving traffic against the same database at once.**

The rule that makes that safe: **a migration must be backward-compatible with the previous image
for the entire window both versions coexist.** Concretely:

- **Additive first.** Add a column as nullable (or with a default), add a table, add an index
  concurrently — anything the *old* code can simply ignore. Ship that migration and roll out the
  new image. Only once every instance is running the new image is it safe to ship a second
  migration that makes the column `NOT NULL`, drops the old one, or does anything the old code
  could not tolerate.
- **Never rename or drop a column the currently-deployed code still selects.** Kysely's generated
  types (`db/types.ts`) will not save you here — they describe what the *new* code expects, not
  what the *old* code, still running on the other half of the fleet, is still asking for.
- **Run `migrate` exactly once, before any instance is rolled**, not once per instance. The
  migration job itself is idempotent (Kysely tracks applied migrations in its own table and skips
  anything already run), so running it twice by accident is harmless — but it should still be one
  step in the release, not N.
- **A migration that cannot be made backward-compatible needs two releases**, not one clever one:
  ship the additive half, wait for the fleet to finish rolling, ship the cleanup half.

This codebase has not needed this discipline yet — every migration to date has been additive
(section 3's migration list is all `CREATE TABLE` / `ADD COLUMN`, nothing has renamed or dropped a
column in production use). Writing the rule down now is cheaper than relearning it during an
incident the first time that stops being true.

## If a migration fails

Kysely's `Migrator` runs each migration in its own transaction (the default for
`migrateToLatest`/`migrateDown`), so a migration that throws partway through rolls back cleanly —
the schema is left exactly as it was after the last successfully applied migration, never
half-applied. `npm run migrate` (`db/migrate.ts status`) reports which one that is:

```bash
docker compose -f docker-compose.deploy.yml run --rm migrate node apps/api/dist/db/migrate.js status
```

From there:

1. **Fix the migration file, do not hand-edit the database.** The failure already rolled back
   cleanly; write a corrected version (or a new migration that finishes what the broken one
   started) and re-run `migrate`.
2. **If the failure was transient** (a lock timeout, a dropped connection), re-running `migrate`
   is safe — Kysely will skip everything already applied and retry only what is not.
3. **Roll back one step** if the migration itself was wrong and the previous schema needs to come
   back before a fix ships:

   ```bash
   docker compose -f docker-compose.deploy.yml run --rm migrate node apps/api/dist/db/migrate.js down
   ```

   This undoes exactly the most recently applied migration, not everything — run it again to go
   back further. Every migration in this codebase has a real `down()` (see any file in
   `db/migrations/`), and CI's "Migration rollback round-trip" step proves the full chain rolls
   back and forward again cleanly on every push — but `down()` scripts are not exercised against
   *production data shapes* the way `up()` is by ordinary use, so treat a rollback as a genuine
   incident action, not a routine one: read the migration's own `down()` before running this
   against real data, and prefer restoring from a backup (`scripts/restore.sh`, section 5q) over a
   rollback if the migration has already written data the `down()` script does not know how to
   undo (a backfilled column, say).
4. **The API and worker will not start against a schema `migrate` has not reached** — that is the
   `depends_on: service_completed_successfully` gate working, not a separate thing to check.

## What this runbook does not cover

Provisioning a real orchestrator, a load balancer, or a second box is out of scope for a single
application repository — see "Deliberately not built" in `docs/decisions.md`. This document
describes the rule the *migrations themselves* have to follow so that a future rolling deploy is
safe when that infrastructure exists, not how to build the infrastructure.
