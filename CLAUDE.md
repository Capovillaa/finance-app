# CLAUDE.md

Working notes for the personal finance platform in `D:\finance_app`, published at
**https://github.com/Capovillaa/finance-app**. This file is the *operating manual*: how to run
things, the conventions a change has to follow, and the traps that cost real time to rediscover.

**The reasoning is not here.** Every significant choice is written up in
[`docs/decisions.md`](docs/decisions.md) — 54 entries, chronological, each titled. When this file
says "see the decision log", that is where to look, and it is worth looking before reversing
anything.

**The repository is public.** Nothing secret belongs in a tracked file: the real `.env` is ignored,
`.env.example` carries only placeholders, and the JWT values in CI are deliberately fake. Check
before adding anything that looks like a credential, a personal address, or a real customer's data.
`gitleaks` scans the whole history on every push.

---

## 1. Where this stands

Both halves are built, verified against real infrastructure, and green.

| | |
| --- | --- |
| API | Express + Kysely over Postgres 16, BullMQ worker. 110 endpoints, 28 tables, 12 migrations |
| Web | React + Vite, nine screens, three languages, no placeholder routes |
| Shared | `@finance/schemas` — every bound, enum, pattern and rejection message both sides use |
| Tests | **457 passing** (274 of them pure units), against real Postgres, ~32s |
| CI | Three workflows, all green: build/test, gitleaks, CodeQL |
| Audit | A pre-deployment security audit ran; **all four phases are closed.** Nothing is half-finished |

The audit's own untracked report is still `AUDIT_REPORT.md` in the working tree. Whether to commit
it, rewrite it into something publishable, or drop it is an open decision for whoever picks this
up — not something to do by default.

**Deliberate gaps, not oversights.** An error tracker and tracing (both need a subscription to be
worth wiring), a real SMTP account, and certificates for the compose-internal Postgres/Redis (a
private bridge is the boundary there — `.env.deploy.example` documents what a *remote* managed
store needs). No payment or bank integration.

**Hosting is described but not yet provisioned.** `render.yaml` is the target: a Blueprint of five
services — the client public, the API private behind its nginx, the worker, Render Postgres and a
key value store — with migrations as `preDeployCommand`. `fly/` describes the same shape on Fly and
is kept as an alternative; **only Render is the chosen path, and only it will be verified.** Nothing
is created on either yet, and `TRUST_PROXY` on both is an expectation with a verification procedure
rather than a measured number. The managed Postgres is also what replaces the missing PITR — the
`pg_dump` pair remains for the self-hosted compose shape. `docs/runbook.md` has both sequences.

The whole stack *has* been rehearsed locally in its production configuration
(`docker-compose.deploy.yml`, built images, `NODE_ENV=production`) and driven through a browser: see
the decision log's "Rehearsed against the real stack before any of it was hosted".

Smaller product gaps: per-account statement history beyond the reconciliation list; the workspace
settings screen cannot create a workspace (the switcher does); a revoked invitation cannot be
re-sent, because the token only ever existed in the email; CSV import is UTF-8 only and reads no
OFX/QIF; form dialogs are never `fullScreen` on `xs`, which a real iPhone's URL bar makes worth
doing; and an even split of an odd amount displays as if it does not add up (the stored figures are
exact — fixing the display means deciding money semantics server-side).

---

## 2. Project structure

```
D:\finance_app
├── apps/
│   ├── api/                          # @finance/api
│   │   ├── src/
│   │   │   ├── server.ts             # HTTP entrypoint
│   │   │   ├── worker.ts             # job entrypoint; writes the heartbeat file
│   │   │   ├── worker-healthcheck.ts # the container HEALTHCHECK; reads the heartbeat,
│   │   │   │                         #   opens no connection of its own
│   │   │   ├── worker-healthcheck-shared.ts  # the path/interval/staleness constants
│   │   │   ├── app.ts                # express app factory (the tests use it too)
│   │   │   ├── config/               # env.ts, and production-policy.ts: the pure rules
│   │   │   │                         #   production refuses to boot on
│   │   │   ├── db/                   # migrations/ 001..012 + index.ts, migrate.ts,
│   │   │   │                         #   seed.ts, client.ts, types.ts
│   │   │   ├── i18n/locales/         # en, pt-BR, es — the server catalogue
│   │   │   ├── lib/                  # money, dates, recurrence, email, redis, errors, http,
│   │   │   │                         #   logger, i18n, csv (both directions), metrics,
│   │   │   │                         #   route-metadata (stampRoute + mount), subkey (HKDF)
│   │   │   ├── middleware/           # auth, validate, error-handler, locale, responds,
│   │   │   │                         #   rate-limit + rate-limit-policy (the pure half),
│   │   │   │                         #   request-timeout, request-context, metrics
│   │   │   ├── openapi/              # walk.ts, schema.ts, document.ts, service-responses.ts
│   │   │   ├── jobs/                 # queues.ts, processors.ts
│   │   │   ├── modules/              # one folder per domain (see the convention below)
│   │   │   └── types/                # context.ts, express.d.ts
│   │   ├── Dockerfile                # one image, three entrypoints. Build from the REPO ROOT
│   │   ├── scripts/                  # copy-assets.mjs, generate-openapi.ts (--check for CI)
│   │   └── tests/{unit,integration}/
│   └── web/                          # @finance/web
│       ├── Dockerfile, nginx.conf.template   # the deployed client: bundle, /api proxy, CSP/HSTS
│       ├── scripts/                  # generate-types.mjs, check-i18n.mjs (both --check in CI)
│       └── src/
│           ├── main.tsx, App.tsx, theme.ts
│           ├── icons.tsx             # EVERY icon; wraps @phosphor-icons/react
│           ├── api/                  # api.ts, baseQuery.ts, schema.d.ts (GENERATED),
│           │                         #   types.ts (names only), endpoints/<domain>.ts
│           ├── components/           # shared shells and primitives
│           ├── features/<domain>/    # schemas, dialogs, cards
│           ├── pages/<Domain>Page.tsx
│           ├── i18n/                 # index.ts, languages.ts, locales/{en,pt-BR,es}.json
│           └── lib/                  # format, money, moneyInput, permissions, tone, motion,
│                                     #   validation, download, chartTokens, currencies, apiError
├── packages/schemas/src/             # limits, enums, patterns, messages, translations, fields
├── docs/                             # architecture.md, api.md, openapi.json (GENERATED),
│                                     #   decisions.md, runbook.md, the original brief
├── infra/                            # postgres/init/, prometheus/alerts.example.yml (unwired)
├── fly/                              # an alternative host, not the chosen one
├── render.yaml                       # THE deployment: web + pserv + worker + pg + keyvalue
├── scripts/                          # backup.sh, restore.sh
├── .github/workflows/                # ci.yml, gitleaks.yml, codeql.yml
├── docker-compose.yml                # DEVELOPMENT ONLY: postgres, redis, mailhog, on 127.0.0.1
├── docker-compose.deploy.yml         # the deployed shape: web, api, worker, migrate, pg, redis
├── docker-compose.debug.yml          # OVERLAY on the above: pg/redis/api on 127.0.0.1, opt-in
├── .env.example / .env.deploy.example
└── package.json                      # workspace root; pins `vite` to force a dedupe
```

Untracked on purpose (see `.gitignore`): `AUDIT_REPORT.md`, `to_do.txt`, `backups/`, the installed
agent skills under `.agents/` and `.claude/skills/`.

---

## 3. How to run

Requires Docker Desktop running and Node >= 22.

```bash
npm install
cp .env.example .env          # defaults already match docker-compose
npm run infra:up              # postgres + redis + mailhog
npm run migrate               # apply migrations
npm run seed                  # demo data (optional, recommended)
npm run dev                   # API on http://localhost:4000

npm run dev --workspace=@finance/web    # Vite on http://localhost:5173
npm run dev:worker --workspace=@finance/api
```

| What | Where |
| --- | --- |
| API | http://localhost:4000 (`/health`, `/health/ready`, `/metrics`, `/openapi.json`) |
| Web client | http://localhost:5173 |
| Postgres | 127.0.0.1:5432, db `finance` / `finance_test`, user+pass `finance` |
| Redis | 127.0.0.1:6379 |
| MailHog UI | http://localhost:8025 (SMTP on 1025) |

**Demo accounts** after `npm run seed`: `ana@demo.local` and `bruno@demo.local`, password
`Demo1234567`.

To run the **built** system — the same image a deployment uses, with migrations gating startup —
use the other compose file. It runs as `NODE_ENV=production`, brings up its own Postgres and Redis,
and therefore shares nothing with the development stack above, demo data included:

```bash
cp .env.deploy.example .env.deploy   # then fill in every REQUIRED value
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d --build
```

**Backups:**

```bash
npm run backup                                            # -> ./backups/finance-<timestamp>.dump
npm run restore backups/finance-<timestamp>.dump --yes    # DESTRUCTIVE; refuses without --yes
```

Point `COMPOSE_FILE=docker-compose.deploy.yml` at either to operate on the deployed stack.

### Two seed-script quirks that look like failures and are not

- **`npm run seed` never exits.** It prints `Seed complete` with its counts and then sits holding
  the pool open. The work is done at that line — watch for it rather than for the process to
  return, or you will burn a long timeout.
- **Re-running it against a database that already has demo data fails** with a foreign-key
  violation on `workspaces_owner_id_fkey`. That is a bug in its own idempotent-reset step, not a
  sign anything is broken. `npm run migrate` is always safe to re-run.

---

## 4. Tests, checks and CI

```bash
npm test                 # all 431 — needs Postgres, and only Postgres
npm run test:unit        # 259 pure units, no infrastructure at all
npm run typecheck        # all three workspaces
npm run check:i18n       # catalogue parity + every literal t() key resolves
npm run check:openapi    # fail if docs/openapi.json or schema.d.ts is stale (the CI step)
npm run generate:openapi # rewrite both of those
npm run build:schemas    # @finance/schemas alone; the others depend on it
npm audit --omit=dev --audit-level=high   # the CI gate: runtime deps only
```

The suite creates and migrates `finance_test` itself on first run and finishes in about half a
minute. **It needs neither Redis nor MailHog** — under `NODE_ENV=test` the cache short-circuits,
`invalidateWorkspaceCache` is a no-op, the rate limiter is `RateLimiterMemory`, the breached-password
check is a no-op and `sendEmail` never opens a socket. Verified by stopping both containers.

**Run `npm run generate:openapi` after any route or response-schema change**, or CI fails on the
stale committed files — as will `tests/unit/openapi.test.ts`. It writes **two** files in a chain
(the spec from the booted router, then the client's `schema.d.ts` from that spec) and they are one
command precisely so they cannot be regenerated apart. Neither step needs a database.

### CI

`.github/workflows/ci.yml` runs two jobs in parallel, in about a minute. **check**: the advisory
gate, typecheck, both builds, the generated-file and i18n checks, unit tests, both container
images, and what those images *refuse* to do. **test**: the full suite against a `postgres:16`
service container, then a migration rollback round-trip.

Four `check` steps are about the deployed artefacts and are easy to break from the source side:
the API image still builds; the web image builds and `nginx -t` parses; the image can import the
whole app graph (which is what catches a missing dependency an existence check would miss); and the
image refuses a published secret, a development mail sink and a split origin.

**A new refusal in `config/production-policy.ts` owes the last two steps a variable.** The positive
step boots the image with a complete production environment, so a rule it does not satisfy fails it
for a reason unrelated to the module graph. Each negative case likewise supplies valid values for
every rule it is *not* testing, or it passes on the wrong refusal and asserts nothing.

The advisory gate is deliberately narrow — high/critical in a **runtime** dependency only. A bare
`npm audit` blocks unrelated pull requests whenever a build tool publishes a dev-server advisory,
and a gate nobody accepts gets deleted.

`gitleaks.yml` and `codeql.yml` run alongside, both on the open-source tooling directly, needing no
account. **`.gitleaks.toml` allowlists exactly the placeholder strings `production-policy.ts`'s
`PUBLISHED_SECRETS` already tracks, plus `apps/api/tests/` wholesale** (the suite hardcodes fake
passwords on purpose). Add a new placeholder to *both* lists together, or the scan starts failing
on your own dev secrets. **A CodeQL alert that is not one of the seven known false-positive
patterns is a real finding** — the table is in the decision log under L-6 and L-7.

The workflow declares **no repository secrets** and should not gain any: the JWT values in it are
fake, the test database is created and discarded in the run, and moving them to GitHub secrets
would only add a setup step before CI works for anyone else. To reproduce CI locally, use its own
environment rather than your `.env` — these five have no defaults, and the values below are
**exactly** the ones `PUBLISHED_SECRETS` denylists, so do not change them casually:

```bash
DATABASE_URL=postgres://finance:finance@localhost:5432/finance \
TEST_DATABASE_URL=postgres://finance:finance@localhost:5432/finance_test \
JWT_ACCESS_SECRET=ci-access-secret-not-a-real-key-000000 \
JWT_REFRESH_SECRET=ci-refresh-secret-not-a-real-key-00000 \
EMAIL_TOKEN_SECRET=ci-email-token-secret-not-a-real-key-0 \
npm test
```

### Git

Public, one remote (`origin`), default branch `main`.

- **Commits use a noreply author** (`160801041+Capovillaa@users.noreply.github.com`), set as this
  repository's own `user.email` so a fresh clone or a changed global identity cannot leak a
  personal address into a public history. If you rewrite history, keep it that way.
- **`.gitattributes` normalises line endings** (LF in the repository, native in the tree). It was
  added before the first commit deliberately, so there is no normalisation churn in the history.
- The `gh` CLI is at `C:\Program Files\GitHub CLI\gh.exe` and is **not on Git Bash's PATH** in an
  already-open shell — invoke it by full path, or from PowerShell.

---

## 5. Conventions

### An API module

Exactly three files: **`routes.ts`** (Express router, Zod validation, no business logic),
**`service.ts`** (all logic, owns its own SQL — there is no repository layer, on purpose) and
**`responses.ts`** (the Zod description of what it returns, beside the query that builds it).
Four rules, each enforced by something that fails loudly:

1. **Import Zod from `zod/v4`**, not `'zod'`. `apps/api` and `packages/schemas` are on v4;
   `apps/web` is still on v3.
2. **Mount with `mount()`** from `lib/route-metadata.ts`, never a bare `.use()` — the OpenAPI
   walker throws on a router whose path it cannot recover.
3. **Declare what each route returns with `responds()`**, between `validate()` and the handler.
   Under `NODE_ENV=test` it parses every outgoing body against the declaration and fails the
   request on a mismatch — including on a success status the route does not declare.
4. **Run `npm run generate:openapi` afterwards.** The tag, the role, the security requirement and
   the 429 all follow from the middleware already on the route; nothing else is needed.

**A response schema describes the wire, not the row** — a `timestamp` column is a `Date` in the
service and an ISO string in the response. Build fields from `modules/shared/responses.ts`
(`money`, `dateOnly`, `timestamp`, `uuid`, `integer`, `currencyCode`, `percent`, `jsonObject`,
`dateRange`, `periodTotals`, `page(item)`) and wrap anything a caller has a *word* for in
`component('Account', …)` — name the concepts, not the packaging. **Reach matters as much as
strictness**: a schema no test succeeds against is an assertion nobody made.
`RESPONSE_REACH=1 npx vitest run 2>&1 | grep -o "REACH .*" | sort -u` lists what the suite
exercises; anything missing belongs in `tests/integration/response-contracts.test.ts`. It is
110/110 today, and "all of them" is the invariant — not the number.

### A web feature

`features/<domain>/` mirrors the API module it talks to: schemas first, then dialogs, then cards.
`api/endpoints/<domain>.ts` is the RTK Query module, one per backend module, same name. Data
fetching and dialog open/close state live in `pages/<Domain>Page.tsx`, never in the feature
components, so a card can be reused without knowing where its data came from. Anything used by more
than one screen moves to `components/`.

A `features/<domain>/*Schemas.ts` file is **not** a hand-written copy of the server's rules: it
reads every bound, value set and pattern from `@finance/schemas` and adds only the form's own half
(text instead of numbers, `''` where the API sees `undefined`, confirmation fields the API never
sees). **Never write a literal bound into one of these files** — if a number is not in
`packages/schemas/src/limits.ts` yet, put it there.

`lib/permissions.ts` mirrors `requireEditor`/`requireAdmin` to hide controls the API would reject
anyway. The server is still the authority.

### The shared package

`@finance/schemas` is consumed as **compiled output**, so `packages/schemas/dist` must exist before
either app typechecks. Every root script builds it first and `npm ci` builds it through the
package's own `prepare`. If you edit the package and then run a workspace script *directly*
(`npm run typecheck --workspace=@finance/web`), run `npm run build:schemas` first or you are
typechecking against stale declarations.

**The Zod schemas themselves are deliberately not shared** — the API parses a JSON body and
transforms money through `decimal.js`; a form parses text and transforms nothing. Do not "finish
the job" by merging them; read the decision log first. Money never transforms in the package:
`moneyField` validates and stops, and `modules/shared/schemas.ts` adds `.transform(money)`.

**A rejection carries a catalogue key, never a sentence** — a Zod message is fixed at import,
before either process knows the request's language. **A message that quotes a bound gets the number
from `LIMITS`**, via `VALIDATION_PARAMS`; never type a bound into a translation.

### i18n

Three languages: English, Português (Brasil), Español. Three rules:

1. **Every user-visible string goes through `t()`.** A hardcoded one looks fine in English and
   silently stays English in the other two.
2. **A module evaluated at import holds a key, not a label.** `navItems.ts`, `lib/tone.ts`,
   `alertMeta.ts`, every `*_LABEL_KEYS` table and every Zod message are built before any language
   is settled — they carry keys and the render site calls `t()`. Form fields go through
   `fieldMessage()` from `lib/validation.ts`.
3. **Add the key to all three catalogues and check it resolves** (`npm run check:i18n`).

`validation.*` is the one namespace that lives elsewhere — `packages/schemas/src/translations.ts`,
because the API rejects a field with the same key. Its completeness is enforced by the compiler.

The API has its own catalogue (`apps/api/src/i18n/locales/`) for the three things a user reads:
error messages, alert notifications, and the invitation email. The client sends its current
language as `Accept-Language` on every request. Note when writing tests: registration defaults a
user's `locale` to **pt-BR**, and `requireAuth` overwrites `Accept-Language` with the stored value.

### Money

`NUMERIC(19,4)` in Postgres, `Decimal`/string in TypeScript, **never `number`**. `lib/money.ts`
owns all arithmetic and rounds half-even; amounts cross the API as strings. Every transaction also
stores a `base_amount` in the workspace's base currency, converted at write time, so analytics
never joins rates at read time.

On the client, **no form binds a raw `TextField` to a money field.** Use `components/MoneyField.tsx`
(or `AmountHero.tsx` where the amount is the subject of the dialog), which model an in-progress
amount as a digit string in the currency's minor unit — keystrokes accumulate from the right, so
the caret is never a problem and one rule (strip every non-digit) covers typing, deleting and
pasting alike. **Decimal places come from the currency, never a constant**: JPY has none and KWD
has three, so `currencyFractionDigits` asks `Intl`.

### The visual language

Flat; typography and a hairline carry the hierarchy. Full description in the decision log
("Visual redesign", "Soft controls", "Glass on floating surfaces", "The phone is a first-class
target"). The rules that constrain new work:

- **Three type families, three jobs**: Fraunces (display), Instrument Sans (UI), **IBM Plex Mono
  with `tabular-nums` for every figure in a list or table**. Use `<Typography variant="amount">`
  or `components/Amount.tsx`; never hand-roll `fontVariantNumeric`.
- **Anything that is a list of money is built from `LedgerRow` + `LedgerList`, not a `<Table>`.**
  Wrap them in `Panel` with `padded={false}`, or the hairlines stop short of the panel edge.
- **`lib/tone.ts` gives the ordinary states no spine at all** — a ledger where every line is marked
  is a ledger where nothing is.
- **Cards get a hairline, not a shadow.** Shadow and glass are for what genuinely floats: dialogs,
  menus, popovers, the transaction detail drawer. Never cards, `LedgerRow` or `Panel`.
- **Every icon goes through `src/icons.tsx`**, imported from `@phosphor-icons/react`, never
  straight from `@mui/icons-material`.
- **Motion says "this updated" and nothing else.** No bounce, no parallax, no hover flourish;
  `prefers-reduced-motion` is honoured globally and per component.
- **Check a new colour against the surface it actually renders on**, not against its token name.
  Two brief hexes could not clear AA as text on a light surface, so light mode uses darker steps.
- **Chart colours come from `lib/chartTokens.ts` and are validated, not chosen.** The two
  categorical slots are semantic (income green, expense brick) — the pair red-green colour
  blindness collapses — so they are separated by a full lightness step, plus legend and labelling.

---

## 6. Traps that will bite

Each of these was found the hard way. Most typecheck perfectly.

### Data, transactions and schemas

- **Never throw from inside a transaction when the write must survive.** The refresh-token replay
  defence revoked the family and *then* threw, inside the same transaction — the rollback undid the
  revocation. Return an outcome and raise after the commit.
- **Never return a query builder from an `async` function.** Wrap it in an object. Kysely 0.28
  removed `preventAwait`, so this no longer throws — it silently resolves to the builder object.
- **`z.coerce.boolean()` inverts every boolean query flag** (`"false"` is truthy). Use
  `booleanQuerySchema` / `booleanQueryWithDefault` from `modules/shared/schemas.ts` for anything
  read from a query string.
- **Import `{ Decimal }` from `decimal.js` as a named import.** The package merges a class with a
  same-named namespace; under NodeNext the default import resolves to the namespace.
- **A rule restated for the spec goes in `.meta()`, never a real check.** Moving a pattern into
  `z.string().regex(...)` looks equivalent: inside a union it replaces the catalogue key with
  `"Invalid input"`, and it changes what the API accepts. Documenting a rule must not do that.
- **`component()` composes with `.extend()`, never `.and()`.** An intersection publishes as `allOf`
  and the component branch carries `additionalProperties: false`, so a strict validator rejects
  every property from the other branch. A recursive schema must be named, or Zod emits `$ref: "#"`.
- **Zod's metadata registry is a process-wide singleton that outlives a source module.** vitest's
  `singleFork` re-evaluates `src/` per test file while `node_modules` stays cached, so the same id
  registers repeatedly. `component()` evicts the stale registration — do not simplify that away.
- **The alert-rule upsert matches the scope explicitly** instead of `ON CONFLICT DO UPDATE`,
  because the uniqueness rule is an expression index over `COALESCE(...)` and Postgres cannot infer
  a conflict target from one.
- **A new maintenance task needs an entry in `MaintenanceJobData`'s union *and* a repeatable
  registration in `jobs/queues.ts`.**
- **`tests/setup.ts`'s `TABLES` list is order-sensitive** — `import_batches` sits between
  `transactions` and `recurring_transactions`. Keep it there.
- **Tests reset with `DELETE`, not `TRUNCATE`.** TRUNCATE forces an fsync per relation; across
  every table before every test it took the suite from 16 seconds to over 25 minutes on Docker
  Desktop. The test database also sets `synchronous_commit = off`, and bcrypt drops to 4 rounds
  under `NODE_ENV=test`. Do not "fix" any of these back.

### Security and configuration

- **A mount's guard middleware cannot be recognised by handler identity.** `requireAuth` is one
  shared object that is *also* ordinary middleware inside three routers; keying the skip on
  identity dropped authentication from those and published two dozen authenticated routes as
  public. The walker matches by position instead. **If you add a shared middleware as a mount
  guard, check the public route list in the generated spec** — exactly twelve operations carry no
  security requirement: `/health`, `/health/ready`, `/metrics`, `/openapi.json`, and auth's
  `register`, `login`, `google`, `refresh`, `logout`, `forgot-password`, `reset-password`,
  `verify-email`. Anything else appearing there is that bug coming back.
- **`TRUST_PROXY` defaults to `false` and must stay that way** unless something really is in front.
  `req.ip` comes from a header the *client* sends; setting this with nothing in front lets six
  invented addresses defeat a limit of three. The deployed composition sets `TRUST_PROXY=1`
  because nginx is genuinely there.
- **The credential limiter's two buckets must stay separate.** A single `ip:email` key is not two
  dimensions, it is weaker than either alone — a new address is a new key, so rotating addresses
  hands back the whole budget against the same account.
- **`globalRateLimit` verifies the bearer token itself.** It is mounted above every `requireAuth`,
  so `req.user` is always `undefined` there; the old `req.user?.id ?? req.ip` had been a pure IP
  limiter for its whole life. Do not "simplify" it back.
- **`enableOfflineQueue: false` on the shared Redis client is not a style choice.** With it on, a
  command issued during an outage parks behind the reconnect backoff — the first request after
  Redis stopped hung for two minutes instead of hitting the fallback that exists for it. BullMQ's
  own connection keeps the queue, and must, because it blocks across reconnects.
- **An error response says only what this codebase wrote.** Four fields: `code`, `message`,
  `details`, `requestId`. `AppError.internalDetail` reaches the log and never a response — a
  Postgres `detail` names columns, constraints and *other rows' values*, and `expose` being
  `status < 500` meant every 409 and 422 published them. Text you did not write belongs in that
  fifth argument; the sentence a client sees comes from `i18n/locales/`.
- **A `.env` variable that exists but is empty is `''`, not `undefined`, and `??` will not save
  you.** Use `blankAsUndefined` for any optional string read from the environment.
- **A boot-time refusal belongs in `config/production-policy.ts`**, which imports nothing — that is
  what lets it be unit-tested. Its placeholder regexes run against legitimately random values, so a
  new pattern must be improbable in 64 random characters; the published throwaways are caught by an
  exact list instead. **If you publish a new placeholder anywhere, add it to `PUBLISHED_SECRETS`**
  and to `.gitleaks.toml`.
- **`GOOGLE_CLIENT_ID` is optional and must stay optional.** It is the one piece of
  configuration "Sign in with Google" needs on the server (there is no client *secret* — the
  browser-side GIS flow returns a signed ID token, which `modules/auth/google.ts` verifies against
  this value as the audience). Unset means `/auth/google` refuses with `auth.googleNotConfigured`
  and the client renders no button, which is a supported configuration rather than a broken one —
  so it gets no `production-policy.ts` rule, and adding one would break every password-only
  deployment. The client's copy is `VITE_GOOGLE_CLIENT_ID`, **compiled into the bundle by Vite**:
  it is a Docker build argument, not a container variable, so changing it needs a rebuild.
- **A Google identity is linked onto an existing address only when `email_verified` is true.**
  `decideGoogleAccount` in `modules/auth/google.ts` is a pure function for exactly this reason.
  Some Workspace and federated configurations pass an address through without vouching for it;
  linking on the address alone hands whoever can type a victim's address into such an account the
  victim's whole ledger. A matching `sub` is checked first and wins over the address, because
  Google promises the `sub` is stable and an address is not.
- **The suite's `GOOGLE_CLIENT_ID` lives in `vitest.config.ts`'s `test.env`, not in
  `tests/setup.ts`.** A `process.env` assignment at the top of a setup file runs *after* that
  file's own hoisted imports, by which time `config/env.ts` has already parsed the environment —
  so it silently has no effect and every Google test 401s on the wrong refusal. Tests replace
  `verifyGoogleIdToken.verify`, the single seam into `google-auth-library`; nothing reaches Google.
- **Any new sign-in path owes `cancelAccountDeletion` a call.** `login` and `resetPassword` both
  make it; a magic link or OAuth callback that skipped it would let a pending erasure run after the
  user has demonstrably come back.
- **Do not simplify registration back to a 409 on a known address.** The whole point is that the
  response is indistinguishable; the client follows a successful register with an ordinary `login`.

### The client

- **MUI's `<TextField select>` needs `value={watch('field')}` alongside `register()`**, or it
  renders visually blank while holding the right value. A placeholder option with `value=""`
  additionally needs `SelectProps={{ displayEmpty: true }}` and
  `InputLabelProps={{ shrink: true }}`. An array field is driven by `watch`/`setValue` and never
  by `register()` — the ref binding cannot express a multiple selection at all.
- **`slotProps.input` is not the `<input>`.** That slot is the `InputBase` *wrapper*, so
  `inputMode` set there lands on a `div` and `aria-label` names a wrapper. **HTML attributes go in
  `slotProps.htmlInput`.** This typechecks and looks right on a desktop.
- **Never reuse an `injectEndpoints` key across modules.** Two files named a mutation
  `deleteAccount` on the same shared `api` singleton; `injectEndpoints` silently keeps whichever
  registered first, so clicking Delete on a financial account fired the **GDPR erasure endpoint**
  and reported success. Nothing enforces uniqueness across files and the failure is silent.
- **Compare colours with `sameColour`, never `===`.** `#B23A2E` and `#b23a2e` are the same colour
  and different strings, which left every swatch unselected.
- **A high-frequency control must absorb its own churn locally.** A native colour input emits a
  continuous stream of `input` events; bound straight to a form field that re-renders a
  fifteen-field dialog per event — the "freezing" a user reported.
- **Use `minmax(0, 1fr)`, never bare `1fr`,** in any grid that can contain a table. A `1fr` track
  still has `min-width: auto`, so a wide table pushes the whole page sideways regardless of how
  many `overflow-x: auto` wrappers sit beneath it.
- **Inside `styleOverrides`, read palette values as `var(--mui-palette-*)`** via the `v()` helper
  in `theme.ts`. The callback receives the *default* scheme's literal values, so
  `theme.palette.divider` there bakes the light hairline into dark mode. `sx` and `useTheme()`
  inside components are fine.
- **A global `:focus-visible` rule needs `!important`** to beat MUI's `outline: 0` — but it is
  scoped to exclude fields, because an outline follows the element's own `border-radius` and the
  native `<input>` has none, so the ring drew a hard square around a rounded control. Fields state
  themselves with a 2px accent notch plus a halo. **A control that suppresses the ring owes the
  user a replacement indicator.**
- **Any field that overrides its own font size owes itself the 16px floor below `sm`.** Anything
  smaller zooms iOS Safari in on focus and never zooms back out.
- **A new `<Table>` needs an `overflowX: 'auto'` wrapper *and* a `minWidth`.** A MUI `Card` clips
  overflow, so a page-width check passes while the Actions column is simply unreachable — which is
  how an admin lost the ability to remove a member on a phone.
- **Touch minimums are keyed on `pointer: coarse`, never a width breakpoint** (`COARSE_TARGET` in
  `theme.ts`) — the input device decides, so a touchscreen laptop gets big targets and a narrow
  desktop window does not. `LedgerRow`'s `xs` grid is sized around those targets; the `md`
  template is untouched, so check both widths if you touch that grid.
- **An authenticated download cannot be an `<a href>` or `window.open`** — the browser sends no
  `Authorization` header and gets a 401. Fetch through the RTK Query base query, then hand the body
  to `lib/download.ts`. CSV endpoints also need `responseHandler: 'text'`. Exports are modelled as
  mutations even though they are GETs, so a megabyte of text is not pinned in the cache.
- **`RecurringTransaction.amount` is the signed, stored value**, not an unsigned magnitude like the
  create/update input. Assuming otherwise printed "R$ NaN" for every expense schedule.
- **A dialog that seeds itself from a lazily-fetched list will seed itself from nothing.** Fetch
  with the page, and let the effect wait for data and seed exactly once per opening, tracked in a
  ref so it can never undo the user's own deselections.
- **`npm run check:i18n` structurally cannot see a hardcoded English string, or a key that is
  rendered without `t()`.** It checks that the key a `t()` call names resolves — and a string that
  never calls `t()` names nothing. Both shipped: a button reading `common.apply`, and Reports
  printing the literal `budgets.status.warning`. **Grep for JSX text and string-literal props when
  touching a component.** The sweep for the other half is
  `grep -rn "helperText={.*\.message}" apps/web/src --include=*.tsx | grep -v fieldMessage`.
- **When you add a rule to a field, check the field can actually say so.** A new bound made a form
  refuse to submit while showing nothing, because that one `TextField` had no `error`/`helperText`
  wired — it had never needed them.

### Build and tooling

- **`vite` is a root `devDependency` pinned to `^6` to force a dedupe.** Do not remove it thinking
  it is unused: without it `apps/web` nests its own copy, `@vitejs/plugin-react` hoists to the
  root, and `apps/web`'s typecheck fails on a `vite.config.ts` type mismatch. The tree now holds
  exactly one vite.
- **`vitest` stays on 3.x deliberately.** Vitest 4 removes `poolOptions` and maps `singleFork` onto
  `maxWorkers: 1, isolate: false`, which is *not* what `singleFork` meant — and the registry
  eviction above is written around exactly that behaviour.
- **`@finance/schemas` is ESM-only and its error says something else.** Resolving it from CommonJS
  fails with `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined`, which reads like a
  malformed `package.json`. Add `{"type":"module"}` next to a scratch script rather than a CJS
  build to the package.
- **`@finance/schemas` declares `sideEffects: false`**, which is what keeps `fields.ts` and its Zod
  4 build out of the client bundle. Removing it silently adds ~40 kB of duplicate Zod.
- **The API's two tsconfigs both use NodeNext.** They were split once and `typecheck` passed while
  `build` failed. `apps/web` correctly uses `bundler`, because Vite bundles it.
- **`npm audit fix` fixes nothing here.** All nine historical advisories needed explicit major
  bumps; expect the same next time.
- **The Dockerfile builds from the repository root**, and three npm behaviours bite in it: a linked
  workspace's `prepare` runs even under `--ignore-scripts`; `--workspace` scopes which *scripts*
  run, not what gets installed (leaving `apps/web/package.json` out of the context is what keeps 58
  MB of icon fonts out of the API image); and npm nests what it cannot hoist, so per-workspace
  `node_modules` must be copied too, not just the root one.

### Deployment

- **`apps/web/nginx.conf.template` is rendered by `envsubst` at container start**, and
  `NGINX_ENVSUBST_FILTER` in `apps/web/Dockerfile` must stay pinned to `API_UPSTREAM` and
  `NGINX_RESOLVER`. Unfiltered, `envsubst` also substitutes nginx's own `$host`, `$uri`, `$scheme`
  and `$remote_addr` — with empty strings, because they are not environment variables — and the
  result **parses cleanly** while proxying to nowhere and forwarding no client address. Do not write
  a worked `${…}` example into a comment in that file either; comments are substituted too. Check a
  change by rendering it, not by reading it: `docker run --rm --entrypoint sh finance-web:x -c
  "/docker-entrypoint.sh nginx -t; cat /etc/nginx/conf.d/default.conf"`.
- **The two variables move together.** `NGINX_RESOLVER` is the resolver's whole argument list, not
  an address, because the compose default ends in `ipv6=off` — right for Docker's embedded DNS and
  fatal on Fly, whose private network is IPv6.
- **"Off" is not a value a compose `ports:` entry can hold.** `${VAR:+…}` expanding to an empty
  string fails validation with `invalid proto:`, which is why the debugging ports live in
  `docker-compose.debug.yml` as an overlay rather than behind a variable.
- **The API's address cannot be written down on Render.** Internal hostnames are generated with a
  suffix that does not exist until the service does (`finance-api-a1b2:4000`), so `render.yaml`
  supplies it with `fromService: property: hostport` — which yields host and port with **no
  scheme**. `apps/web/docker-entrypoint.d/16-upstream-and-resolver.envsh` prefixes `http://` and
  turns `NGINX_RESOLVER=auto` into the container's real nameservers; both are no-ops unless asked
  for, so compose and Fly are untouched. It must stay a `.envsh` (sourced, so exports survive) and
  keep a number below 20, or it runs after the envsubst step it exists to feed.
- **Two services with `generateValue: true` on the same key get two different values.** In
  `render.yaml` the worker copies the API's three signing secrets with `fromService` + `envVarKey`
  for exactly this reason: generating its own would start cleanly, log nothing, and reject every
  token the API signed.
- **The client's CSP names four exact `accounts.google.com/gsi/…` paths**, in all three copies of
  the header in `apps/web/nginx.conf.template` — script, style, connect and frame. They are
  unconditional even where Google sign-in is off: making them conditional would mean a third
  substituted variable, and `NGINX_ENVSUBST_FILTER` is pinned to two names for a reason. Keep the
  three copies identical; the `/assets/` and `/index.html` blocks replace the inherited set rather
  than adding to it.
- **`/health`, `/health/ready`, `/metrics` and `/openapi.json` are mounted at the API's root, not
  under `/api/v1`** — so nginx, which proxies only `/api/`, does not expose them. Anything reaching
  for them through the public origin is reaching for something that is not there.

---

## 7. This machine's quirks

Not preferences — workarounds for real failures observed here.

- **Postgres must be Debian `postgres:16`, not `-alpine`.** The musl build cannot exec its own
  entrypoint under this Docker Desktop/WSL2 setup (`exec format error` on `/bin/sh`). Same reason
  the app image is Debian slim.
- **Docker's data lives on `D:\DockerData`**, reached through a directory junction at
  `%LOCALAPPDATA%\Docker\wsl\disk`. `C:` had filled to zero bytes. Do not delete that junction;
  setting `dataFolder` in Docker's `settings-store.json` did **not** work. Watch free space on `C:`
  before large pulls.
- **Docker Desktop is a GUI app but starts fine headlessly**, from PowerShell:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`. The daemon is usually ready
  within 5–10 seconds — poll `docker info` rather than sleeping a fixed amount.
- **Windows cannot deliver a real SIGTERM to an external process** (`process.kill()` terminates
  rather than invoking the JS handler), so anything about graceful shutdown has to be verified in
  the actual Linux container with `docker stop`.

### Driving a real browser

Typechecking and a production build prove the code parses; they do not prove a screen renders or
that a dialog round-trips. Most of the bugs in section 6 were found this way and by nothing else.

There is no `chromium-cli` here. Install Playwright in a scratch directory **outside the repo** (so
it never touches `apps/web/package.json` or the lockfile) and drive the machine's already-installed
Chrome, which skips downloading Playwright's own Chromium:

```bash
mkdir -p /path/to/scratch/pw && cd /path/to/scratch/pw && npm init -y && npm install playwright
```

```js
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
```

The driver script stays out of the repo — it is a dozen lines, rebuild it fresh each time.

Four things learned the slow way:

1. **Force the language first** with `localStorage.setItem('finance.language', 'en')`. This
   machine's browser prefers pt-BR, which silently breaks an English string match.
2. **A dialog's submit button often has the same label as the button that opened it.** Use
   `page.locator('[role="dialog"] button[type="submit"]')`, which is unambiguous and survives a
   label change.
3. **The nav items are links, not buttons** — `ListItemButton` renders with `component={Link}`, so
   each matches `getByRole('link')`. Match the name exactly: a loose `/account/i` finds the sidebar
   entry before the "Add account" button and quietly navigates instead of opening the dialog.
4. **A form needs its `<Select>`s filled or it fails on those instead** — click the
   `[role="combobox"]`, then `li[role="option"]`.

You do not need seed data to reach a signed-in screen: registering through the UI takes four fills
and a click, gives a clean workspace, and avoids the seed's re-run problem entirely.

---

## 8. Where the reasoning lives

`docs/decisions.md` is the log; these are the entries most likely to matter before a change.

| If you are touching… | Read |
| --- | --- |
| Money, balances, transfers, dates | "Money is `NUMERIC(19,4)`…", "Transactions store a signed amount…", "Account balances are trigger-maintained…" |
| Query layer, migrations, ids | "Kysely rather than Prisma…", "Migrations are registered statically…", "UUIDv7 primary keys" |
| Auth, sessions, rate limits | "Refresh tokens are opaque…", "Rate limiting is two-dimensional…", "'Sign out everywhere'…", "One root secret, two purposes…" |
| Google sign-in | "Sign in with Google verifies an ID token in place…" |
| Registration, reset, verification | "Password reset and email verification…", "Registration stops answering the question…", "A breached-password check…" |
| Errors, disclosure, timeouts | "An error response is written by this codebase…", "A connection is reclaimed by the server…" |
| The OpenAPI chain | "The OpenAPI document is generated…", "Response schemas live beside the service…", "The client's response types are generated…", "`/openapi.json` is public on purpose" |
| Shared validation | "The validation rules are shared; each side still builds its own parser", "A stored URL is only as safe as the schemes it can name" |
| The look of the client | "Visual redesign…", "Soft controls, a distinct icon set", "Glass on floating surfaces…", "The phone is a first-class target…", "Money is typed the way it is read…" |
| Translation | "The client is translated; the API is not", "The API gets its own i18n layer" |
| CSV import | "CSV import is preview-then-commit…" |
| Exchange rates | "Live exchange rates: one provider interface…" |
| Deployment, compose, origin | "One image, three entrypoints…", "Development and deployment are two files…", "One origin, because the cookie says so", "A published secret is refused at boot…", "Two apps on Fly, a managed Postgres…" |
| Ops: backups, metrics, runbook | "A tested restore, not a promise of one…", "A release runbook, and a heartbeat…", "Deliberately not built in this phase" |
| CI and scanning | "CI gates on everything…", "Dependency advisories are fixed by upgrading…", "Secret scanning and SAST run the open-source tools directly" |
| RBAC | "Non-members get 403…", "A table-driven RBAC sweep…" |
| Alerts | "Anomaly detection is explainable statistics…", "Bounding the alert-rule `config`…" |

`docs/architecture.md` is the system view, `docs/api.md` the endpoint reference (with
`docs/openapi.json` as the generated authority on shapes), `docs/runbook.md` the release procedure.

**Four decisions were the user's, not defaults, and should not be quietly reversed:** the
Material-UI / Redux Toolkit / Recharts stack (re-litigated once against shadcn/ui and kept —
every defect on the list had a root cause in this repo and would have survived the migration);
same-origin over `SameSite=None` plus CSRF; a 7-day recoverable erasure over an immediate one; and
`/openapi.json` staying public.
