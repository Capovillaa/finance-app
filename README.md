# Finance App

[![CI](https://github.com/Capovillaa/finance-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Capovillaa/finance-app/actions/workflows/ci.yml)

A personal finance management platform: multi-workspace budgeting, multi-currency accounts,
recurring bills, anomaly-aware alerting, analytics, and CSV import/export.

Both halves are built and run against each other:

- **`apps/api`** — TypeScript/Express over Postgres 16 with Kysely, plus a BullMQ worker.
  28 tables across 11 migrations, 109 endpoints. Reference in [`docs/api.md`](docs/api.md),
  with a generated [`docs/openapi.json`](docs/openapi.json) beside it.
- **`apps/web`** — React + Vite client (Material-UI, Redux Toolkit, Recharts, React Hook Form
  and Zod) covering nine screens.
- **`packages/schemas`** — the bounds, value sets and rejection messages both sides must agree
  on, declared once so they cannot drift apart.

The interface ships in **English, Português (Brasil) and Español**; so do the API's error
messages, alert notifications and invitation emails.

Money is `NUMERIC(19,4)` in the database and a decimal string in TypeScript — never a JS
number — and every transaction stores the exchange rate that applied on the day it happened.
The reasoning behind this and every other significant choice is in
[`docs/decisions.md`](docs/decisions.md).

---

## Quick start

Requires Node 22+ and Docker.

```bash
cp .env.example .env          # defaults work for local development
npm install
npm run infra:up              # Postgres 16, Redis 7, MailHog
npm run migrate               # create the schema
npm run seed                  # optional: demo workspace with 12 months of history
npm run dev                   # API on http://localhost:4000
```

In a second terminal, the web client:

```bash
npm run dev --workspace=@finance/web    # http://localhost:5173
```

And in a third, if you want scheduled work (recurring bills, alert scans, email delivery):

```bash
npm run dev:worker --workspace=@finance/api
```

Check it is alive:

```bash
curl http://localhost:4000/health/ready
```

| Service | URL |
| --- | --- |
| Web client | http://localhost:5173 |
| API | http://localhost:4000/api/v1 |
| Health / readiness | http://localhost:4000/health, `/health/ready` |
| MailHog (catches all outbound email) | http://localhost:8025 |
| Postgres | `localhost:5432`, database `finance` |
| Redis | `localhost:6379` |

`npm run seed` creates two demo logins, `ana@demo.local` and `bruno@demo.local`, both with the
password `Demo1234567`.

### Running the built system

`docker-compose.yml` is development infrastructure only — Postgres, Redis and MailHog, each
published on `127.0.0.1`. Everything that ships lives in `docker-compose.deploy.yml`: the client
behind nginx, the API, the worker, the migration runner, and their own Postgres and Redis. No mail
sink, no published database or cache ports, and no default for anything that is a credential.

```bash
cp .env.deploy.example .env.deploy   # then fill in every REQUIRED value
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d --build
```

The whole app is then on one port — `127.0.0.1:8080` by default — because the nginx serving the
client also proxies `/api` to the API container. That is a requirement, not a convenience: the
refresh token is a `SameSite=Lax` cookie, which a browser will not send cross-site, so the API
refuses to start in production if `API_BASE_URL` and `WEB_BASE_URL` disagree. Put TLS in front of
it; the cookie is `Secure`.

It brings up its own Postgres and Redis, so it does not share the development database.

---

## Common commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API with hot reload |
| `npm run build` | Compile TypeScript to `apps/api/dist` |
| `npm test` | Full suite (needs Postgres; uses a separate `finance_test` database) |
| `npm run test:unit` | Pure-logic tests only — no database required |
| `npm run migrate` / `migrate:down` / `migrate:status` | Schema migrations |
| `npm run seed` | Demo dataset |
| `npm run typecheck` | Type check all three workspaces without emitting |
| `npm run check:openapi` | Fail if the generated spec or client types are stale |
| `npm run check:i18n` | Catalogue parity, and every `t()` key resolves |
| `npm run backup` / `restore` | `pg_dump` / `pg_restore` through the running container |
| `npm run infra:up` / `infra:down` / `infra:reset` | Manage local containers |

---

## What is implemented

**Identity & access**
- Registration, login, JWT access tokens plus rotating refresh tokens with replay detection
- Password reset and email verification by emailed single-use token; a password already known to
  be breached is refused, checked by k-anonymity so the password never leaves the process
- Neither registration nor password reset discloses whether an address already has an account
- Password change (revokes every session), GDPR data export, and account erasure that is scheduled
  rather than immediate — it costs the account password, and signing back in cancels it
- Redis-backed rate limiting, per-IP *and* per-email on credential endpoints

**Workspaces**
- Personal and shared workspaces, created with default categories and alert rules
- Roles: owner, admin, editor, viewer — enforced by middleware on every scoped route
- Email invitations with hashed single-use tokens, revocation and expiry
- Ownership transfer, activity feed, separate audit log

**Money**
- Accounts: checking, savings, credit card, investment, cash, loan — each in its own currency
- Transactions with signed amounts, full-text and trigram search, filters, pagination, soft delete
- Transfers as two linked legs, including cross-currency
- Reconciliation against bank statements, which freezes the matched transactions
- Expense splitting that always reconciles to the cent; comments; tags
- Three-level category hierarchy, enforced by a database trigger

**Planning**
- Budgets by category and period, with subcategory roll-up, thresholds and mid-period revisions
- Recurring income and bills with daily/weekly/monthly/yearly/custom rules, idempotent materialisation
- Savings goals with contributions, progress, required monthly pace and off-track detection

**Intelligence**
- Alert rules per workspace: budget threshold and overrun, large transactions, unusual spending
  (z-score against the category's own history), duplicate detection, bills due, goal milestones,
  low balance
- Notifications with per-user deduplication, in-app plus email delivery

**Analytics & reporting**
- One-call dashboard, category breakdown at any hierarchy depth, dense trend series,
  net-worth history, savings rate, budget variance, period-over-period comparison, plain-language
  insights, monthly statements, year-over-year, CSV export

**Operations**
- BullMQ worker: recurring materialisation, alert sweeps, email dispatch, token/invitation cleanup,
  exchange-rate refresh — with a file heartbeat as its liveness signal, since it opens no port
- Structured logging with redaction, request correlation ids, graceful shutdown that waits for
  in-flight requests, statement and request timeouts, Docker build
- Prometheus metrics at `/metrics`, labelled by route pattern, with example alert rules
- A `pg_dump`/`pg_restore` pair that runs through the container, with the restore actually
  exercised rather than assumed

See [`docs/architecture.md`](docs/architecture.md) for how it fits together and
[`docs/decisions.md`](docs/decisions.md) for why the important choices were made.

---

## Project layout

```
apps/api/
  src/
    config/        environment parsing and validation
    db/            Kysely client, typed schema, migrations, seed
    lib/           money, dates, recurrence, errors, logging, redis, email
    middleware/    auth, RBAC, validation, rate limiting, error handling
    modules/       one folder per domain: service.ts + routes.ts
    jobs/          queue definitions and processors
    app.ts         Express wiring    server.ts  API entrypoint    worker.ts  jobs entrypoint
  tests/
    unit/          pure logic, no database
    integration/   HTTP-level tests against a real Postgres
apps/web/
  src/
    api/           RTK Query service, one endpoint file per backend module
    components/    shared shells: LedgerRow, Panel, PageHeader, StatTile…
    features/      one folder per domain, mirroring the API's modules
    pages/         one file per screen, owning data-fetching and dialog state
    i18n/          en, pt-BR, es catalogues
    lib/           formatting, permissions, money, motion, chart tokens
packages/schemas/  bounds, enums, patterns and messages shared by both apps
scripts/           backup and restore
.github/workflows/ CI, secret scanning, CodeQL
infra/             Postgres init scripts, example Prometheus alert rules
docs/              architecture, API reference, decision log, release runbook
```

---

## Configuration

Every variable is documented — `.env.example` for development, `.env.deploy.example` for a
deployment — and validated at boot, so the process refuses to start on a bad configuration rather
than failing later under load.

**The JWT secrets in `.env.example` are public** — this repository is public, so those exact bytes
are known to everyone, and anyone holding them can forge an access token for any user. They exist
so a fresh clone runs locally and for nothing else.

`NODE_ENV=production` therefore refuses to boot on them, on anything under 32 characters, on
anything that still looks like a placeholder, and on one value used for both variables
(`apps/api/src/config/production-policy.ts`). Generate a separate secret per variable and supply it
through the deployment environment or a secret store — not through a copy of `.env.example`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`docker-compose.deploy.yml` requires both to be set explicitly and stops before starting anything
if they are not — along with `POSTGRES_PASSWORD`, `REDIS_PASSWORD` and a real `SMTP_HOST`, which
production also refuses to substitute a development default for.

---

## Testing

```bash
npm test          # unit + integration (Postgres only; no Redis needed)
npm run test:unit  # unit only, no infrastructure at all
```

Integration tests run against `finance_test`, created and migrated automatically. The suite
refuses to run unless the database name contains `test`, so it can never truncate your
development data.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main`, on every pull request, and on demand.
Two jobs run in parallel:

| Job | Needs | Runs |
| --- | --- | --- |
| **Typecheck, build, unit tests** | nothing | The runtime-dependency advisory gate, `npm run typecheck`, both workspace builds, the generated-file and translation checks, `npm run test:unit`, both container images — and what those images *refuse* to boot on |
| **Full suite (real Postgres)** | a `postgres:16` service container | `npm test`, then a migration rollback round-trip |

Splitting them means a type error reports in about a minute rather than waiting on a database.

Two more workflows run alongside: `gitleaks.yml` scans the full git history for committed secrets
on every push, and `codeql.yml` runs GitHub's static analysis weekly and on every change. Both use
the open-source tooling directly, so neither needs an account or a key.

**Only Postgres is provisioned.** Under `NODE_ENV=test` the cache helpers short-circuit,
workspace cache invalidation is a no-op and the rate limiter uses an in-memory store, so nothing
in the suite reaches Redis; MailHog is not involved either. This was verified by stopping both
containers and running the full suite, not assumed from reading the code.

The JWT secrets in the workflow are deliberately fake, checked-in values. Nothing they sign
outlives the job, and the test database is created and thrown away in the same run — so there is
no repository secret to configure to make CI work.
