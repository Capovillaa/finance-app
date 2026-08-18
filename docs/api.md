# API reference

Base URL: `http://localhost:4000/api/v1`

All requests and responses are JSON unless noted. Authenticated endpoints take
`Authorization: Bearer <accessToken>`.

> **There is a generated companion to this file: [`openapi.json`](./openapi.json).**
>
> It is produced from the running Express app by `npm run generate:openapi`, and
> the same document is served at `/openapi.json`. Because it is generated, it is
> the authority on **which paths exist, what they accept, and who may call
> them** — a route cannot be added or a bound changed without the spec moving
> too, and CI fails if the committed copy is stale.
>
> **Responses are in the spec too, all 104 of them**, so it is now the authority
> on what an endpoint returns as well — and unlike prose, those descriptions are
> checked against real responses by the integration suite, which is what makes
> them trustworthy. The client's TypeScript types are generated from the same
> file. See `docs/decisions.md`, "Response schemas live beside the service, and
> the test suite proves them".
>
> This file remains the place for the things a schema cannot carry: what an
> endpoint is *for*, when to reach for it, and the per-type keys inside an alert
> rule's free-form `config`.

## Conventions

**Money** is always a decimal string with four places (`"1250.0000"`). Never send a float.

**Dates** are calendar dates, `YYYY-MM-DD`. Timestamps are ISO 8601 with a timezone.

**Errors** share one envelope:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Request validation failed",
    "details": [{ "path": "body.amount", "message": "Enter an amount greater than zero" }],
    "requestId": "3f9c…"
  }
}
```

**Language.** `message` and every `details[].message` are rendered in the locale
resolved from `Accept-Language` (`en`, `pt-BR`, `es`; English otherwise), or from
the signed-in user's stored `locale` once a request is authenticated. The one
exception is a field rejected by a rule with no authored message of its own — a
plain length cap, say — which falls back to Zod's own English wording.

| Code | Status | Meaning |
| --- | --- | --- |
| `bad_request` | 400 | Malformed request |
| `unauthorized`, `invalid_credentials` | 401 | Missing, expired or wrong credentials |
| `forbidden` | 403 | Authenticated, but not allowed (includes non-membership) |
| `not_found` | 404 | No such resource in this workspace |
| `conflict` | 409 | Violates a uniqueness or state rule |
| `validation_failed`, `unprocessable` | 422 | Well-formed but rejected |
| `rate_limited` | 429 | Too many requests; see `retry-after` |
| `internal_error` | 500 | Logged with `requestId`; message is generic |

**Rate limiting.** Every response under `/api/v1` carries `x-ratelimit-limit`,
`x-ratelimit-remaining` and `x-ratelimit-reset` (seconds) for whichever budget is closest to
running out; a 429 additionally carries `retry-after`. All four are exposed through CORS, so a
browser client can read them. Requests are charged to **two** budgets at once — the signed-in user
and the calling address — and credential endpoints are charged to the calling address *and* the
account being attempted, independently, so rotating addresses does not reset an account's budget.

**Paginated** responses:

```json
{ "items": [], "page": 1, "pageSize": 50, "total": 128, "totalPages": 3, "hasMore": true }
```

Accept `?page=` and `?pageSize=` (max 200).

**Roles.** Every `/workspaces/:workspaceId/*` route requires membership. Beyond that:
`viewer` reads, `editor` writes financial data, `admin` manages members and alert rules,
`owner` transfers ownership and archives the workspace.

---

## Auth — `/auth`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/register` | Creates the user **and** their personal workspace with default categories and alert rules. Returns tokens and `defaultWorkspaceId`. |
| POST | `/login` | Rate limited per address and, separately, per account. |
| POST | `/refresh` | Rotates the refresh token. Reusing a rotated token revokes the whole family. |
| POST | `/logout` | Revokes the presented refresh token. Other sessions keep working. |
| POST | `/logout-all` | Revokes every session for the user, **immediately** — access tokens included. |
| POST | `/change-password` | Requires the current password; signs all sessions out immediately. |
| POST | `/forgot-password` | Always answers 204, whether or not the address has an account — never an oracle for which emails are registered. Rate limited as a credential endpoint. |
| POST | `/reset-password` | Body `{"token": "…", "newPassword": "…"}`. Consumes the emailed link, revokes every other session, and signs the caller in — same response shape as `/login`. |
| POST | `/verify-email` | Body `{"token": "…"}`. Unauthenticated: the token is the proof. Sets `user.emailVerifiedAt`. |
| POST | `/resend-verification` | Requires auth. No-op if already verified. |
| GET | `/me` | Current user, including `emailVerifiedAt`. |

The refresh token is returned in the body *and* set as an HttpOnly cookie scoped to `/api/v1/auth`,
so a browser client never has to store it in JavaScript.

Registration sends a verification email; nothing else currently requires `emailVerifiedAt` to be
set **except accepting a workspace invitation** — see the Workspaces section below. A forgotten
password recovers through `/forgot-password` + `/reset-password`, both HMAC-token flows following
the same shape `workspaces/invitations.ts` established, but signed with their own
`EMAIL_TOKEN_SECRET` rather than `JWT_REFRESH_SECRET`.

Revocation reaches the access token too, not just the refresh token: `logout-all`, a password
change and account deletion all move the user's `tokens_valid_from` forward, and an access token
issued before that instant is refused on its next request rather than surviving until it expires.
Signing straight back in works immediately, including within the same second.

```bash
curl -X POST localhost:4000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"ana@example.com","password":"Sup3rSecret123","fullName":"Ana Souza"}'
```

Passwords must be at least 10 characters and contain both letters and digits.

## Users — `/users`

| Method | Path | Notes |
| --- | --- | --- |
| PATCH | `/me` | Name, avatar, locale, timezone, base currency. |
| GET | `/me/export` | GDPR export: full JSON download. |
| DELETE | `/me` | GDPR erasure, **scheduled rather than performed**. Body `{"confirm": true, "currentPassword": "…"}`; rate limited as a credential endpoint. Revokes every session and answers `{"deletionScheduledFor": "…"}`. Signing in before that date cancels it; otherwise a daily job anonymises the account, deletes solely-owned workspaces and archives shared ones. |

## Currencies — `/currencies`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Supported currencies. |
| GET | `/rate?from=BRL&to=USD&asOf=2026-01-15` | Rate on a date, resolving direct, inverse or cross pairs. |

Rates are refreshed daily by the `refresh_rates` maintenance job from whichever provider
`EXCHANGE_RATE_PROVIDER` selects: `static` (indicative values baked into the code, the default),
`frankfurter` (the ECB's daily reference rates, no API key) or `openexchangerates` (needs
`EXCHANGE_RATE_API_KEY`). A rate is stored under the date its **provider** published it, so
`asOf` resolves to the rate that was really in force that day rather than to the day it was
fetched — an ECB feed asked on a Sunday answers with Friday's. A currency the provider does not
quote keeps whatever rate it last had.

## Workspaces — `/workspaces`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/` | — |
| POST | `/` | — |
| GET | `/:workspaceId` | viewer |
| PATCH | `/:workspaceId` | admin |
| DELETE | `/:workspaceId` | owner (archives; refuses your only workspace) |
| GET | `/:workspaceId/members` | viewer |
| PATCH | `/:workspaceId/members/:userId` | admin |
| DELETE | `/:workspaceId/members/:userId` | admin |
| POST | `/:workspaceId/transfer-ownership` | owner |
| GET/POST | `/:workspaceId/invitations` | admin |
| DELETE | `/:workspaceId/invitations/:id` | admin |
| GET | `/:workspaceId/activity` | viewer (`?includeAudit=true` needs admin) |
| POST | `/invitations/accept` | authenticated; body `{"token": "…"}` |

An invitation can only be accepted by an account whose email matches the address it was sent to,
**and that account's `emailVerifiedAt` must be set**. Matching the address alone would let anyone
who learns a victim is about to be invited register that address first and accept the invitation
themselves, before the real owner ever proves control of it — see `auth.emailNotVerified` /
`POST /auth/verify-email` above.

## Accounts — `/workspaces/:workspaceId/accounts`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/` | viewer — also returns `totalBalance` and `balanceByCurrency` |
| POST | `/` | editor |
| GET | `/:id` | viewer |
| PATCH | `/:id` | editor |
| DELETE | `/:id` | admin — 409 if it has transactions; archive instead |
| GET/POST | `/:id/reconciliations` | viewer / editor |

Types: `checking`, `savings`, `credit_card`, `investment`, `cash`, `loan`.

Reconciliation compares your statement against the computed balance. A match completes and marks
those transactions reconciled (which freezes them); a mismatch stays `open` with the difference.
`difference` is the statement minus the ledger, so a positive figure is money the ledger has not
been told about. A second `POST` for a statement date already on record **replaces** that
reconciliation rather than adding another.

## Categories — `/workspaces/:workspaceId/categories`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/?shape=tree\|flat&kind=&includeArchived=` | viewer |
| GET | `/template` | viewer — the default starter tree |
| POST | `/` | editor |
| PATCH | `/:id` | editor |
| DELETE | `/:id` | editor — 409 if used by transactions or budgets |

Three levels maximum. A child inherits its parent's `kind`; moving a category into its own subtree
is rejected.

## Transactions — `/workspaces/:workspaceId/transactions`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/` | viewer |
| POST | `/` | editor |
| POST | `/transfers` | editor |
| POST | `/bulk-categorize` | editor |
| GET | `/:id` | viewer — includes splits and comments |
| PATCH | `/:id` | editor |
| DELETE | `/:id` | editor — soft delete |
| POST | `/:id/restore` | editor |
| POST | `/:id/confirm` | editor — marks a scheduled bill paid |
| PUT | `/:id/splits` | editor |
| POST | `/:id/splits/:splitId/settle` | editor |
| POST | `/:id/comments` | editor |
| DELETE | `/:id/comments/:commentId` | own comment, or admin |

Filters on `GET /`: `from`, `to`, `accountIds`, `categoryIds`, `includeSubcategories`, `tagIds`,
`types`, `statuses`, `minAmount`, `maxAmount`, `search`, `createdBy`, `isReconciled`,
`includeDeleted`, `sortBy` (`occurredOn|amount|createdAt`), `sortDirection`. List parameters
accept `a,b,c`.

`includeDeleted=true` also returns soft-deleted rows, each carrying a non-null `deletedAt`.
It is the only way to reach `POST /:id/restore`: without it nothing can name the row to restore.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "localhost:4000/api/v1/workspaces/$WS/transactions?from=2026-01-01&to=2026-01-31&search=superm"
```

Create with a **positive** `amount` plus `type` (`income` or `expense`); the sign is derived.
`status` may be `cleared` (default), `pending` or `scheduled` — only `cleared` affects the balance.

Splits accept explicit `shareAmount` per person (must total the transaction), or `weight`, or
neither for an even split. Rounding remainders are distributed so the parts always reconcile.

## Tags — `/workspaces/:workspaceId/tags`

`GET /` (viewer, with usage counts), `POST /` and `DELETE /:id` (editor).

## Imports — `/workspaces/:workspaceId/imports`

CSV import, modelled as **preview then commit**. The preview parses, maps, converts and checks
for duplicates and writes nothing to the ledger; only the commit inserts, and it inserts every
selected row or none of them.

| Method | Path | Role |
| --- | --- | --- |
| GET | `/?limit=` | viewer — committed and reverted batches, newest first |
| POST | `/preview` | editor — parses and returns a preview; writes no transactions |
| POST | `/:batchId/commit` | editor — inserts the selected rows in one transaction |
| DELETE | `/:batchId` | editor — undoes a whole batch |

`POST /preview` takes the file as text in a JSON body:

```jsonc
{
  "accountId": "…",
  "content": "Data;Histórico;Valor\r\n01/03/2026;Padaria;-10,50\r\n",
  "filename": "extrato.csv",
  // Every field below is optional; omitted ones are inferred from the file.
  "delimiter": ";",              // , ; \t |
  "hasHeader": true,
  "mapping": { "date": 0, "description": 1, "amount": 2 },
  "dateFormat": "dmy",           // iso | dmy | mdy
  "decimalSeparator": ",",
  "signConvention": "signed",    // signed | debit_credit | direction_flag
  "invertAmounts": false
}
```

Limits: 512 KB and 2000 data rows. Mappable columns are `date`, `description`, `amount`,
`debit`, `credit`, `direction`, `merchant`, `notes`, `category`, `externalId`.

The response echoes the resolved `options` alongside the rows, so nothing about how the file
was read is implicit:

```jsonc
{
  "preview": {
    "batchId": "…",              // also the id you commit and later undo with
    "headers": ["Data", "Histórico", "Valor"],
    "options": { /* every field above, resolved */ },
    "mappingRecalled": false,    // reused from this account's last import
    "dateFormatAmbiguous": false,// true when the file reads either way round
    "rows": [{
      "lineNumber": 2,           // 1-based, header included
      "occurredOn": "2026-03-01",
      "description": "Padaria",
      "amount": "-10.5000",      // signed, in the account's currency
      "type": "expense",
      "categoryId": null,
      "errors": [{ "field": "date", "message": "…" }],
      "duplicateOfTransactionId": null,
      "duplicateOfLineNumber": null,
      "raw": ["01/03/2026", "Padaria", "-10,50"]
    }],
    "counts": { "total": 1, "ready": 1, "invalid": 0, "duplicate": 0 },
    "totals": { "inflow": "0.0000", "outflow": "10.5000", "net": "-10.5000" },
    "expiresAt": "…"             // previews live two hours, then are swept
  }
}
```

Row `errors` are rendered in the request's locale; a row that has any cannot be committed.
Duplicates are **flagged, not dropped** — same account, same date, same amount and a similar
description, or a matching `externalId` — because two identical charges on one day are a real
pair. Each existing ledger row can only absorb one file row.

Commit takes the lines to keep, optionally re-categorising as it goes:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"rows":[{"lineNumber":2},{"lineNumber":3,"categoryId":"…"}]}' \
  "localhost:4000/api/v1/workspaces/$WS/imports/$BATCH/commit"
```

`DELETE /:batchId` soft-deletes every transaction the batch created, which unwinds the account
balance through the same trigger a one-row delete uses. It refuses if any imported row has since
been reconciled.

## Budgets — `/workspaces/:workspaceId/budgets`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/?activeOn=&includeInactive=` | viewer |
| POST | `/` | editor |
| GET | `/:id` | viewer — full progress |
| PATCH | `/:id` | editor |
| DELETE | `/:id` | editor |
| PUT | `/:id/lines` | editor — upsert one line |
| DELETE | `/:id/lines/:lineId` | editor |
| POST | `/:id/lines/:lineId/revise` | editor — mid-period change, audited |
| POST | `/:id/rollover` | editor — clone into the next period |

Periods: `monthly`, `quarterly`, `yearly` snap to the calendar from `startDate`; `custom` requires
`endDate`. Budgets apply to expense categories only.

Each line reports `spentAmount`, `remainingAmount`, `percentUsed` and
`status` (`on_track` | `warning` | `exceeded`), plus `periodProgressPercent` on the budget so the
UI can compare spend against pace.

## Recurring — `/workspaces/:workspaceId/recurring`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/` | viewer |
| POST | `/` | editor |
| GET | `/:id` | viewer — includes the next 12 occurrences |
| PATCH | `/:id` | editor |
| DELETE | `/:id` | editor |
| POST | `/:id/materialize` | editor — generate now instead of waiting for the job |

Frequencies: `daily`, `weekly` (`byWeekday`, 0 = Sunday), `monthly` (`dayOfMonth`; 31 means the
last day of the month), `yearly` (`monthOfYear` + `dayOfMonth`), `custom` (`intervalCount` days).
Bound with `endDate` or `occurrenceLimit`.

`autoPost: true` creates `cleared` transactions; `false` creates `scheduled` ones awaiting
`POST /transactions/:id/confirm`. Generation is idempotent.

`amount` is asymmetric like transactions': `POST`/`PATCH` bodies take a positive magnitude and the
sign is derived from `type`, but `GET` responses return the **signed, stored** value (negative for
`expense`). A client that reuses a `GET` response's `amount` as-is when building a write body, or
re-derives the sign on a value that is already signed, will double up the sign.

## Goals — `/workspaces/:workspaceId/goals`

`GET /`, `POST /`, `GET /:id` (with contributions), `PATCH /:id`, `DELETE /:id`,
`POST /:id/contributions`, `DELETE /:id/contributions/:contributionId`.

Each goal reports `progressPercent`, `remainingAmount`, `daysRemaining`,
`requiredMonthlyContribution` and `offTrack`. Reaching the target flips the status to `achieved`
automatically.

## Alerts — `/workspaces/:workspaceId/alerts`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/` | viewer |
| PUT | `/` | admin — upsert a rule by type |
| DELETE | `/:id` | admin |
| POST | `/evaluate` | admin — run the scan now |

| Type | Config keys |
| --- | --- |
| `budget_threshold` | `thresholdPercent` |
| `budget_exceeded` | — |
| `large_transaction` | `minAmount`, `multipleOfAverage`, `lookbackDays` |
| `unusual_spending` | `sigma`, `lookbackMonths`, `minMonths`, `minAmount` |
| `duplicate_transaction` | `windowDays` |
| `bill_due` | `daysBefore` |
| `goal_milestone` | `milestones` (array of percentages) |
| `low_balance` | `minBalance` |

`channels` is any of `in_app`, `email`, `push`. Rules can be scoped with `scopeCategoryId` or
`scopeAccountId`.

## Notifications — `/notifications`

User-scoped, spanning every workspace. `GET /` (with `unreadCount`),
`POST /:id/read`, `POST /read-all`, `DELETE /:id`.

## Analytics — `/workspaces/:workspaceId/analytics`

All viewer, all in the workspace base currency, all excluding transfers.

| Path | Returns |
| --- | --- |
| `/dashboard` | Balances, accounts, month totals, month-over-month, top categories, budget status, recent transactions, upcoming bills, goals, unread count |
| `/summary?from=&to=` | Income, expenses, net, savings rate |
| `/categories?from=&to=&type=&depth=&limit=` | Breakdown rolled up to hierarchy `depth` (0–2) |
| `/trends?months=&unit=` | Dense series; empty periods appear as zeros |
| `/net-worth?months=` | Running balance at each month end |
| `/savings-rate?months=` | Saved amount and rate per month |
| `/budget-variance?asOf=` | Budgeted vs actual per category |
| `/compare?unit=&anchor=&offset=` | Period-over-period comparison |
| `/insights` | Plain-language observations |

## Reports — `/workspaces/:workspaceId/reports`

| Path | Returns |
| --- | --- |
| `/statement?month=` | Opening and closing balance, totals, categories, budgets |
| `/year-over-year?year=` | This year against last, month by month |
| `/export/transactions.csv?from=&to=&accountIds=&categoryIds=` | CSV download |
| `/export/statement.csv?month=` | CSV summary |

CSV is UTF-8 with a BOM and CRLF endings so Excel reads accented text correctly, and fields
starting with `=`, `+`, `-` or `@` are escaped against formula injection.

## Health

`GET /health` — liveness, no dependencies. `GET /health/ready` — checks Postgres and Redis,
503 when degraded.

The container healthcheck uses `/health`, not `/health/ready`: a container is not unhealthy
merely because a database it does not own is briefly unavailable, and restarting it would not
help. Point an orchestrator's *readiness* probe at `/health/ready` and its *liveness* probe at
`/health`.
