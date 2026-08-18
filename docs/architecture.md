# Architecture

## Shape of the system

```
   Web / Mobile client
            │  REST, JSON, bearer tokens
            ▼
  ┌───────────────────┐        ┌──────────────────┐
  │  API (Express)    │        │  Worker (BullMQ) │
  │  routes → service │        │  scheduled jobs  │
  └─────────┬─────────┘        └────────┬─────────┘
            │                            │
            ├────────────┬───────────────┤
            ▼            ▼               ▼
      PostgreSQL 16    Redis 7        SMTP
      (source of      (cache,        (invitations,
       truth)          queues,        alerts)
                       rate limits)
```

The API and the worker are the **same codebase and the same container image**, started with
different entrypoints (`server.js` / `worker.js`). They share every service module, so a bill
materialised by the worker goes through exactly the same code as one created from the API. The
migration runner (`db/migrate.js`) is the third entrypoint of that same image, and in the `app`
compose profile it runs to completion before either of the others starts — so a failed migration
stops the rollout rather than leaving a new binary talking to an old schema. See `decisions.md`,
"One image, three entrypoints, and a migration that gates the rollout".

## Layers

Each domain lives in `src/modules/<domain>/` and is split in three:

- **`service.ts`** — all business logic and database access. Framework-free: no `req`, no `res`.
  This is what the worker calls, and what makes the same behaviour reachable from a job, a
  script, or a future GraphQL layer.
- **`routes.ts`** — HTTP concerns only: validation schemas, role requirements, status codes.
- **`responses.ts`** — the Zod description of what the module returns, beside the query that
  builds it, because the change that invalidates a response schema is a change to that query.

Cross-cutting concerns sit in `src/lib` (money, dates, recurrence, errors, logging, redis, email)
and `src/middleware` (auth, RBAC, validation, rate limiting, error translation). `src/openapi`
generates the API's own description by walking the router — see "The API describes itself" below.

## Request lifecycle

1. `requestId` assigns a correlation id, echoed as `x-request-id` and attached to every log line.
2. `httpLogger` logs the request, with authorization headers and anything password-shaped redacted.
3. `globalRateLimit` consumes two Redis token buckets: the calling address, and — when the bearer
   token verifies — the signed-in user. It has to verify the token itself, because it is mounted
   above every `requireAuth` and `req.user` does not exist yet at this point.
4. `requireAuth` verifies the JWT **and reloads the user**, so a suspended account, or one whose
   sessions have been revoked, stops working immediately rather than at token expiry.
5. `withWorkspace` resolves `:workspaceId` and proves membership, attaching the caller's role.
6. `requireViewer` / `requireEditor` / `requireAdmin` / `requireOwner` narrow by role.
7. `validate({ params, query, body })` parses with Zod and *replaces* the request parts with the
   typed, coerced output.
8. The route calls a service function, which filters every query by `workspace_id`.
9. `errorHandler` maps the thrown error — application, Zod, or Postgres — onto one status code and
   one response envelope.

Steps 4–6 are what enforce tenant isolation. Because they are mounted once in `src/routes.ts`
rather than repeated per route, a new endpoint cannot forget them.

Step 3 depends on `req.ip` being real, which depends on `TRUST_PROXY`. `X-Forwarded-For` is a
client-supplied header, so it is believed only when the deployment says something is in front to
send it; the default is to trust nothing, and every address-keyed budget is otherwise resettable by
changing a string. Credential endpoints add a second limiter charging the *account* being
attempted, on its own longer window, which is the bound that survives an attacker with addresses to
spare. When Redis is unreachable both fall back to a per-process counter carrying
`1/RATE_LIMIT_INSTANCES` of the budget, log that they have done so, and — on credential endpoints
only — fail closed if even that cannot answer.

## The API describes itself

`docs/openapi.json` is generated from the Express app that actually boots, not from a list kept by
hand, so it cannot drift from the code. `src/openapi/` walks the router; the metadata it needs is
recorded on the way in by `src/lib/route-metadata.ts`, because none of it survives inspection:
`validate(...)` and `requireRole(...)` return anonymous closures, and Express keeps a mount prefix
only as a compiled `RegExp`.

Two rules follow, and both are load-bearing:

- **Mount every router with `mount()`**, not `.use()`. The walker throws on a router it cannot
  place, rather than publishing a path assembled from a guess. Adding a module is one `mount(...)`
  line in `src/routes.ts` and nothing else — the tag, the security requirement, the required role
  and the 429 all follow from the middleware already on the route.
- **A rule restated for the specification goes in `.meta()`**, never in a real check. Publishing
  what a field accepts must not change what it accepts; see `decisions.md` for the two ways that
  went wrong when tried the obvious way.

The document describes **requests and responses**. Requests were always describable — they are
Zod schemas already. Responses were not: handlers return database rows straight from Kysely, so
each shape had to be authored, in `modules/<domain>/responses.ts`, and declared on its route with
`responds()`. That declaration is enforced rather than decorative — under `NODE_ENV=test` every
outgoing body is parsed against it and a mismatch fails the request, which is the only reason to
trust a hand-authored schema. The web client's types are generated from the result.

## Web client

`apps/web` is a Vite + React + TypeScript client, added after the API. It mirrors the API's own
module layering rather than inventing a different shape:

```
apps/web/src/
  api/
    api.ts                   single RTK Query service, tag types declared once
    baseQuery.ts             fetch base query + transparent single-flight refresh
    schema.d.ts              GENERATED from docs/openapi.json — never edited
    types.ts                 names for what is in schema.d.ts; value sets from @finance/schemas
    endpoints/                one file per API module (accounts.ts, budgets.ts, ...)
  features/<domain>/          form schemas built on @finance/schemas, dialogs,
                               cards — one folder per API module
  pages/<Domain>Page.tsx      owns data-fetching and dialog open/close state
```

## Shared package

`packages/schemas` (`@finance/schemas`) holds the validation rules the API and the client have to
agree on: every bound, every closed set of values, the shapes of money, dates and passwords, and the
catalogue key and wording each rejection carries. Both apps import it; neither declares those rules
itself.

The Zod schemas are *not* shared, deliberately. The API parses a JSON body and normalises amounts
through `decimal.js`; the client parses form text and stores nothing. Each builds its own parser on
top of the shared rules. See `docs/decisions.md`, "The validation rules are shared; each side still
builds its own parser".

It is consumed as compiled output, so its `dist` must exist before either app typechecks — every
root npm script builds it first, and `npm ci` does too via the package's `prepare`.

**State** is Redux Toolkit: a small hand-written slice for auth/session and workspace selection,
everything else is RTK Query cache. There is deliberately no second client-side cache or
normalized store — RTK Query's tag invalidation is the only cache-consistency mechanism, and every
workspace-scoped tag carries the workspace id in its own `id` field (e.g. `{ type: 'Account', id:
\`LIST:${workspaceId}\` }`) so switching workspaces cannot serve another workspace's cached rows.
Switching workspaces also calls `api.util.resetApiState()` outright, rather than trusting tag
invalidation alone to catch every case.

**Auth** keeps the access token in Redux (in memory, not persisted) and relies on the API's
HttpOnly refresh cookie for the rest. `baseQuery.ts` retries a request once after a 401 by calling
`/auth/refresh`, and single-flights concurrent refresh attempts — since the refresh token rotates
on every use (see "Refresh tokens are opaque..." in `decisions.md`), five simultaneous 401s each
attempting their own refresh would revoke the whole token family and log the user out.

**Forms** are React Hook Form plus Zod. They are no longer a hand-kept mirror of the server's
schema: every bound, value set, pattern and rejection message comes from `@finance/schemas`, and
each side composes its own parser on top — the API over a JSON body, the client over form text
(see `decisions.md`, "The validation rules are shared; each side still builds its own parser").
Do not write a literal bound into a `features/*/…Schemas.ts` file; if a number is not in
`packages/schemas/src/limits.ts` yet, put it there. MUI's
`Select` needs an explicit `value` prop alongside `register()` — see the "MUI's Select needs a
controlled value" decision log entry for the specific pattern and why it is easy to get wrong.

**Money and dates on the client follow the same rules as the server:** amounts are passed to
`Intl.NumberFormat` as decimal *strings*, never coerced through `Number` first, to avoid the same
float-precision loss `NUMERIC(19,4)` and `decimal.js` exist to prevent server-side; calendar dates
(`YYYY-MM-DD`) are parsed as `new Date(year, month - 1, day)` rather than `new Date(dateString)`, to
avoid the same UTC-midnight shift described under "Calendar dates are strings, never `Date`" below.

**Permissions** are checked client-side by `lib/permissions.ts` purely to hide controls the API
would reject anyway (`canEdit` mirrors `requireEditor`, `canAdminister` mirrors `requireAdmin`) —
the server remains the sole authority, so stale role state client-side degrades to a 403, not a
security hole.

## Data model

Full DDL lives in `src/db/migrations`. The tables group into:

| Group | Tables |
| --- | --- |
| Identity | `users`, `user_identities`, `refresh_tokens`, `push_devices` |
| Tenancy | `workspaces`, `workspace_members`, `workspace_invitations` |
| Money | `accounts`, `account_reconciliations`, `transactions`, `transaction_splits`, `transaction_comments`, `transaction_tags`, `tags`, `import_batches` |
| Structure | `categories` (3 levels), `currencies`, `exchange_rates` |
| Planning | `budgets`, `budget_lines`, `budget_revisions`, `recurring_transactions`, `financial_goals`, `goal_contributions` |
| Intelligence | `alert_rules`, `notifications`, `notification_deliveries` |
| Audit | `activity_events` |

### Invariants the database enforces itself

Application code can have bugs; these constraints mean a bug cannot corrupt the ledger.

- `transactions_sign_matches_type` — an expense must be negative, income positive. Reporting can
  therefore `SUM` directly instead of branching on `type`.
- `categories_hierarchy_trg` — computes `depth` from the parent, blocks a fourth level, and blocks
  a parent in another workspace.
- `workspace_members_single_owner_idx` — a partial unique index allowing exactly one owner row,
  so two concurrent ownership transfers cannot both win.
- `notifications_dedupe_unique` — one notification per user per dedupe key, which is what makes
  repeated alert scans idempotent.
- `transactions_external_id_unique` — per-workspace import idempotency, ready for CSV import.

### Balances

`accounts.current_balance` is maintained by an `AFTER` trigger on `transactions` that applies the
delta of every insert, update and delete, plus a `BEFORE` trigger on `accounts` for opening-balance
edits. Recomputing `SUM(amount)` per account on read is correct but does not survive millions of
rows; the trigger runs inside the same transaction, so the balance can never drift from the ledger.

Only `cleared` rows count. `scheduled` bills and `pending` charges are visible in the API as
`availableBalance` without touching the real balance.

### Money

`NUMERIC(19,4)` in Postgres, decimal **strings** in JavaScript, arithmetic through `decimal.js` in
`src/lib/money.ts`. `NUMERIC` deliberately keeps node-postgres's default string parser — a float
would silently lose cents. `DATE` columns get a custom parser that returns `YYYY-MM-DD` verbatim,
because the default builds a `Date` at local midnight and shifts a transaction into the previous
day for anyone west of UTC.

Splitting helpers (`splitEvenly`, `splitByWeights`) distribute the rounding remainder so the parts
always add back to the whole.

### Multi-currency

Each transaction stores `amount` in the account's currency plus `base_amount` in the workspace's
base currency and the `exchange_rate` used. Historical rows keep the rate that applied on their own
date. Analytics aggregate `base_amount`, so a workspace mixing BRL and USD accounts still produces
one coherent total.

Rates themselves come from whichever provider `EXCHANGE_RATE_PROVIDER` names — `static` (indicative
values in the code, the default and what a network-less checkout gets), `frankfurter` (the ECB's
daily reference rates, no API key) or `openexchangerates` (a key, USD-quoted on the free plan).
`modules/currencies/providers.ts` holds one `RateProvider` interface, an injectable `fetch` and a
pure `rebase()` that re-expresses a provider's quote against our own base and drops any currency
the `currencies` table does not know. Rows carry the **provider's** date, not the day of the
refresh, which is what makes a historical conversion genuinely historical. A refresh that cannot
reach its provider is logged and dropped rather than being papered over with static values — see
`decisions.md`, "Live exchange rates: one provider interface, and a fallback that cannot do harm".

## Background work

BullMQ over Redis, with stable repeat keys so restarts re-use the existing schedule.

| Queue | Cadence | Work |
| --- | --- | --- |
| `recurring-materialization` | hourly | Create transactions due within the next 7 days |
| `alert-evaluation` | every 3 h | Run every enabled rule for every workspace |
| `notification-delivery` | every 2 min | Send queued emails, bounded retries |
| `maintenance` | daily + hourly | Purge expired tokens, expire invitations, refresh rates; hourly, sweep abandoned CSV-import previews |

Materialisation looks ahead so bills exist *before* they are due — that is what gives the
`bill_due` alert its lead time. It is idempotent: an occurrence that already produced a
transaction is skipped, so a retry cannot double-charge.

## Alerting

`src/modules/alerts/detectors.ts` holds the detection maths as pure functions — no database, no
IO — so each rule is unit-tested against hand-written series. `engine.ts` supplies real data and
turns findings into notifications.

Unusual spending uses a z-score against the category's **own** trailing months, excluding the month
under test so the outlier cannot drag the mean toward itself. A perfectly flat history has zero
standard deviation, so it falls back to a relative test. Large-transaction detection combines an
absolute floor with a multiple of the workspace's own average, so it adapts across income levels.

Every finding carries a dedupe key naming what it is about (`budget_exceeded:<lineId>:<periodStart>`).
Scans can run as often as we like without spamming anyone.

## Caching

Redis caches the dashboard for 60 seconds under a `ws:<workspaceId>:` namespace; every write path
calls `invalidateWorkspaceCache`. Cache failures are logged and fall through to Postgres — a Redis
outage degrades latency, not correctness. Caching is bypassed entirely under `NODE_ENV=test`.

## Security

- bcrypt password hashing; failed logins burn equivalent CPU so timing cannot enumerate accounts
- Short-lived access tokens; opaque refresh tokens stored only as keyed hashes, rotated on use
- Refresh-token replay revokes the entire token family
- Invitation tokens likewise stored only as hashes, single-use, expiring
- Every workspace-scoped query filters on `workspace_id`; non-members get 403 rather than a hint
  that a resource exists
- `helmet`, CORS locked to the web origin in production, 1 MB body cap
- CSV export escapes leading `=`/`+`/`-`/`@` so a transaction description cannot become a formula
- An error body is `code`, a sentence from the translation catalogue, the rejected fields, and
  `requestId` — never a stack, and never text written by Postgres or by a trigger, both of which
  name columns, constraints and other rows' values. All of that stays in the log under the same
  request id

## How it ships

`apps/api/Dockerfile` produces **one image with three commands**, matching the shape at the top of
this document: `dist/server.js`, `dist/worker.js` and `dist/db/migrate.js`. It is built from the
repository root, because the API consumes `@finance/schemas` as a workspace — the build compiles
the shared package first, then the API, then prunes to production dependencies.

`docker compose -f docker-compose.deploy.yml up -d` is the deployment in miniature:

```
postgres (healthy) ──▶ migrate (runs to completion) ──┬──▶ api
                                                      └──▶ worker
```

That is a **separate file** from `docker-compose.yml`, which holds development infrastructure and
nothing else. It used to be a `profiles: ["app"]` section of the same file, which did not work as a
boundary: a service without a `profiles:` key starts unconditionally, so selecting the profile
added the application containers to the development stack — MailHog's open UI, unauthenticated
Redis and a default-password Postgres included. The deployment file publishes no data-store port
and defaults no credential; see `decisions.md`, "Development and deployment are two files".

`api` and `worker` wait on `service_completed_successfully`, so the schema is always current before
anything serves traffic or picks up a job, and a failed migration stops the rollout instead of
leaving a new binary talking to an old schema. The API's container healthcheck probes `/health`
(liveness, no dependencies) rather than `/health/ready`, because a container is not unhealthy
merely because a database it does not own is briefly unavailable.

CI builds this image on every push and then imports the compiled app factory inside it, which
loads every route, service and library without opening a socket. That is what stops the image
rotting: the previous Dockerfile was broken for several sessions purely because nothing built it.
The traps involved — npm running a linked workspace's `prepare` regardless of `--ignore-scripts`,
`--workspace` not scoping *installs*, and npm nesting a dependency where only the root tree was
being copied — are written up in `decisions.md`, "One image, three entrypoints, and a migration
that gates the rollout".

What is deliberately not decided here: where this runs, how images reach a registry, where TLS
terminates, and where production secrets come from. The compose profile is a working local
rehearsal of the rollout order, not a hosting plan.

## Scaling notes

- Time-ordered UUIDv7 primary keys keep inserts on the right edge of the index instead of
  fragmenting it the way random v4 keys do.
- Partial indexes (`WHERE deleted_at IS NULL`) match the shape of the queries the app actually runs.
- The API is stateless; sessions live in Postgres and Redis, so instances scale horizontally.
- Analytics run as single aggregate queries with dense series generated in SQL, not row-by-row.
- Heavy and periodic work is already off the request path in the worker.

Next steps for real scale: read replicas for analytics, TimescaleDB or a rollup table for very
long histories, and per-tenant partitioning of `transactions`.
