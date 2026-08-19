# Release runbook

Finding **P-4** in `AUDIT_REPORT.md`: CI tests a migration up/down round-trip, which is more than
most projects have, but nothing documented *where* `npm run migrate` runs in a real release, *who*
runs it, how to roll back, or the rule a migration has to follow for the length of a rolling
deploy. This is that document. It assumes the deployment `docker-compose.deploy.yml` describes —
one image, three entrypoints — written up in `decisions.md` under "One image, three entrypoints,
and a migration that gates the rollout" and "Development and deployment are two files".

## The single-instance release (what this repository's own compose file does)

This is the deployment `docker-compose.deploy.yml` actually describes today, and it needs no
separate runbook step — the file already gates the rollout correctly:

```bash
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d --build
```

`migrate` runs to completion first; `api` and `worker` start only once it exits 0
(`depends_on: service_completed_successfully`). A failed migration stops the release
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

## The Render release (the chosen path)

`render.yaml` at the repository root is a Blueprint describing all five services — client, API,
worker, Postgres, key value. Render creates them from it and redeploys on every push, so there is
no deploy command to run by hand. Reasoned about in `decisions.md` under "Render, and the hostname
you cannot know until it exists".

### First deploy only

1. In Render, **New → Blueprint**, point it at this repository. It reads `render.yaml` and shows
   what it will create.
2. It will prompt for every value marked `sync: false`: `SMTP_HOST`, `SMTP_USER`,
   `SMTP_PASSWORD`, `MAIL_FROM`, and `API_BASE_URL`/`WEB_BASE_URL`. **You cannot know the last two
   yet** — Render has not created the client's URL. Put a placeholder in, or leave them, and expect
   the API not to boot.
3. Once `finance-web` exists, copy its URL (`https://finance-web-xxxx.onrender.com`) and set
   **both** `API_BASE_URL` and `WEB_BASE_URL` to that exact string, on **both** `finance-api` and
   `finance-worker`. They must be identical, including scheme and any port — `production-policy.ts`
   compares origins and refuses to start when they differ, because a split origin ends every
   session at the first token refresh.
4. Redeploy `finance-api`. The `preDeployCommand` runs the migrations; a failure stops the deploy
   rather than letting a new binary serve against an old schema.

The three signing secrets are `generateValue: true`, so Render generates a distinct high-entropy
value for each and never shows them in the repository. The worker copies the API's three by
reference (`fromService` + `envVarKey`) rather than generating its own — a second, different set
would look like it worked and reject every token the API signed. If a boot is refused for length or
entropy, replace them by hand:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Every release

Push to the tracked branch. Render rebuilds and redeploys what changed. To confirm:

- `finance-api` → Logs: the pre-deploy output, then the boot lines.
- `finance-worker` → Logs: `Worker started` with its four queues.
- `curl -fsS https://<your-web-url>/healthz` → `ok` (nginx itself).
- `curl -si https://<your-web-url>/api/v1/auth/login -H 'content-type: application/json' -d '{}'`
  → **422** with a `validation_failed` body proves the proxy reached the API. A 502 is nginx
  failing to reach it; a 200 with HTML means the path fell through to the SPA.

### What costs money, and what the free tiers do to you

Private services and background workers have **no free instance type** — `finance-api` and
`finance-worker` are on `starter` because that is the smallest that exists. `finance-web` is on
`free`, which **spins down after 15 minutes idle**: the first visit after a quiet period waits for a
cold start, which reads as the site being broken. Move it to `starter` before showing it to anyone.
The free Postgres plan **expires**; move it to a paid plan before it holds anything you would mind
losing, and note that the free key value store has no persistence, so BullMQ's queued jobs do not
survive a restart there.

### Looking at the database

Render Postgres has two connection strings and the difference matters. The **internal** one is what
`render.yaml` wires into the API over the private network. The **external** one, in the dashboard
under Connect, is the one to paste into DBeaver, pgAdmin or psql from your own machine — it is
reachable from anywhere and TLS-only. Use the external string, and keep its SSL parameters.

## The Fly release (an alternative, not the chosen path)

Retained because it works and is a genuine fallback if Render's per-service pricing bites, but
**Render is what this repository deploys to** — treat the section above as the one kept honest.

The hosted deployment, described by `fly/api.toml` and `fly/web.toml` and reasoned about in
`decisions.md` under "Two apps on Fly, a managed Postgres, and a promise the compose file was not
keeping". **Every command runs from the repository root**, because both Dockerfiles need it as
their build context.

### First deploy only

```bash
fly apps create finance-api
fly apps create finance-web

# The API is private. This is the step that keeps it that way: a plain
# `allocate-v6` would publish it, and `[[services]]` in api.toml is what it
# would publish.
fly ips allocate-v6 --private --app finance-api

fly secrets set --app finance-api \
  JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... EMAIL_TOKEN_SECRET=... \
  DATABASE_URL='postgres://user:pass@host/db?sslmode=verify-full' \
  REDIS_URL='rediss://default:pass@host:6379' \
  SMTP_HOST=... SMTP_USER=... SMTP_PASSWORD=...
```

Three separately generated secrets — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` —
because `config/production-policy.ts` refuses to boot on a repeated value, on anything this public
repository has ever printed, and on anything still shaped like a placeholder. Setting secrets
restarts the app; that is expected.

### Every release

```bash
fly deploy --config fly/api.toml     # migrations run first, and gate this
fly deploy --config fly/web.toml     # only if the client changed
```

`release_command` runs `migrate up` in a temporary machine built from the new image *before* any
machine running the old one is replaced, and a non-zero exit stops the deploy — the same gate
`service_completed_successfully` gives the compose file. Confirm:

```bash
fly logs --app finance-api                         # the release command's output
fly status --app finance-api                       # every machine on the new version, checks passing
fly logs --app finance-api --process-group worker  # the worker specifically
curl -fsS https://finance-web.fly.dev/healthz      # nginx is up and serving
```

**`/health` and `/health/ready` are not reachable from the public origin, and that is not an
oversight.** They are mounted at the API's root while nginx proxies only `/api/`, so the public
surface of this deployment is the client, `/api/v1/*` and nothing else. Note *how* they are
unreachable, because it is easy to misread: the SPA fallback catches every unmatched path, so
`curl https://…/health/ready` answers **200 with `index.html`**, not a 404. Anything scripted
against those paths from outside is checking that nginx serves a web page. `/metrics` and
`/openapi.json` sit at that same root — `/openapi.json` is public *by decision* in the compose
deployment, and on Fly it stops being reachable from outside, which is a tightening rather than a
regression. What watches `/health` is Fly's own check in `api.toml`, which reaches port 4000 on the
private network; `fly status` is where its result shows up. To see readiness by hand:

```bash
fly ssh console --app finance-api -C \
  "node -e \"fetch('http://127.0.0.1:4000/health/ready').then(r=>r.text()).then(console.log)\""
```

Proving the *proxy* reaches the API needs a route that is actually published, so use a public one
and read the shape of the rejection. **422** with a `validation_failed` body is proof the request
reached the API and its validator answered; a 502 is nginx failing to reach it, and 200 with HTML
means the path fell through to the SPA and never went near the API at all:

```bash
curl -si https://finance-web.fly.dev/api/v1/auth/login \
  -H 'content-type: application/json' -d '{}' | head -1
```

Deploy the API before the client when a release changes both: the API tolerates an older client,
and the reverse — a new bundle calling an endpoint that is not there yet — is a broken screen.

### Verify `TRUST_PROXY` after the first deploy, and after any change in front of the app

**Do this once, deliberately.** `fly/api.toml` sets `TRUST_PROXY=2` for the two hops it expects —
Fly's proxy, then the `web` app's nginx — but the number is a claim about someone else's
infrastructure, and being wrong is silent in both directions: too low and every request appears to
come from the nginx container, so the per-address rate limit becomes one bucket shared by the whole
internet; too high and a client can invent addresses to escape it.

Signing in writes `clientIp(req)` into `refresh_tokens.ip_address`, which is what makes this
checkable from the outside — and it is the first useful thing to do with a database you can open in
a GUI:

1. Find your own public address: `curl -fsS https://api.ipify.org`.
2. Sign in to the deployed app from that same machine.
3. Read the row back, in DBeaver or psql:

   ```sql
   select ip_address, user_agent, created_at
   from refresh_tokens
   order by created_at desc
   limit 5;
   ```

Your own address in the newest row means the number is right. An address belonging to Fly, or a
private `fdaa:` address belonging to the nginx machine, means `TRUST_PROXY` is one too low: raise
it in `fly/api.toml`, `fly deploy --config fly/api.toml`, then repeat from step 2 with a **fresh
sign-in** — an existing row is a record of what was believed at the time and does not change.

No UI shows this; the client has no active-sessions screen, only "sign out everywhere". The table is
the instrument.

### Looking at the database

The managed provider's connection string works directly from a laptop in DBeaver, pgAdmin or psql —
that is the reason it is managed rather than a container. Use the provider's own read-only or
non-owner role for browsing where one is offered, and keep `sslmode=verify-full` on the string you
paste in: it is what makes the certificate, and therefore the host on the other end, actually
checked.

For the self-hosted compose deployment there is no such connection, on purpose. Add the debug
overlay for as long as you need one, and reach it through an SSH tunnel rather than by widening a
bind address:

```bash
docker compose -f docker-compose.deploy.yml -f docker-compose.debug.yml \
  --env-file .env.deploy up -d          # publishes pg/redis/api on 127.0.0.1 only
ssh -N -L 5432:127.0.0.1:5432 you@your-server
```

A plain `up -d` without the overlay takes those ports back down.

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
(the migration list is all `CREATE TABLE` / `ADD COLUMN`, nothing has renamed or dropped a
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
   against real data, and prefer restoring from a backup (`scripts/restore.sh`) over a
   rollback if the migration has already written data the `down()` script does not know how to
   undo (a backfilled column, say).
4. **The API and worker will not start against a schema `migrate` has not reached** — that is the
   `depends_on: service_completed_successfully` gate working, not a separate thing to check.

## What this runbook does not cover

Provisioning a real orchestrator, a load balancer, or a second box is out of scope for a single
application repository — see "Deliberately not built" in `docs/decisions.md`. This document
describes the rule the *migrations themselves* have to follow so that a future rolling deploy is
safe when that infrastructure exists, not how to build the infrastructure.
