# Finance App — Backend

Backend and database foundation for a personal finance management platform: multi-workspace
budgeting, multi-currency accounts, recurring bills, anomaly-aware alerting and analytics.

This phase delivers the **API and data layer**. The web client (React + TypeScript, Material-UI,
Redux Toolkit, Recharts) is the next phase and consumes the REST API documented in
[`docs/api.md`](docs/api.md).

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

In a second terminal, for scheduled work (recurring bills, alert scans, email delivery):

```bash
npm run dev:worker --workspace=@finance/api
```

Check it is alive:

```bash
curl http://localhost:4000/health/ready
```

| Service | URL |
| --- | --- |
| API | http://localhost:4000/api/v1 |
| Health / readiness | http://localhost:4000/health, `/health/ready` |
| MailHog (catches all outbound email) | http://localhost:8025 |
| Postgres | `localhost:5432`, database `finance` |
| Redis | `localhost:6379` |

`npm run seed` creates two demo logins, `ana@demo.local` and `bruno@demo.local`, both with the
password `Demo1234567`.

### Running everything in Docker

```bash
docker compose --profile app up --build
```

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
| `npm run typecheck` | Type check both workspaces without emitting |
| `npm run infra:up` / `infra:down` / `infra:reset` | Manage local containers |

---

## What is implemented

**Identity & access**
- Registration, login, JWT access tokens plus rotating refresh tokens with replay detection
- Password change (revokes every session), GDPR data export and account erasure
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
  exchange-rate refresh
- Structured logging with redaction, request correlation ids, graceful shutdown, Docker build

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
infra/postgres/    container init scripts
docs/              architecture, API reference, decision log
```

---

## Configuration

Every variable is documented in `.env.example` and validated at boot — the process refuses to
start on a bad configuration rather than failing later under load.

Before deploying anywhere real, replace `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

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
| **Typecheck, build, unit tests** | nothing | `npm run typecheck`, both workspace builds, `npm run test:unit` |
| **Full suite (real Postgres)** | a `postgres:16` service container | `npm test`, then a migration rollback round-trip |

Splitting them means a type error reports in about a minute rather than waiting on a database.

**Only Postgres is provisioned.** Under `NODE_ENV=test` the cache helpers short-circuit,
workspace cache invalidation is a no-op and the rate limiter uses an in-memory store, so nothing
in the suite reaches Redis; MailHog is not involved either. This was verified by stopping both
containers and running the full suite, not assumed from reading the code.

The JWT secrets in the workflow are deliberately fake, checked-in values. Nothing they sign
outlives the job, and the test database is created and thrown away in the same run — so there is
no repository secret to configure to make CI work.
