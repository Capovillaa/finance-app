# CLAUDE.md

Working notes for the personal finance management platform in `D:\finance_app`,
published at **https://github.com/Capovillaa/finance-app**. Read this before
touching the codebase — it captures decisions and environment quirks that are
expensive to rediscover.

**The repository is public.** Nothing secret belongs in a tracked file: the real
`.env` is ignored, `.env.example` carries only placeholders, and the JWT values
in the CI workflow are deliberately fake. Check before adding anything that
looks like a credential, a personal address, or a real customer's data.

---

## 1. What was done in the first session

The **entire backend** was designed and built from an empty directory, then
verified against real Postgres and Redis. The frontend had not been started.

Delivered:

- npm-workspaces monorepo, Docker Compose infrastructure, TypeScript API package
- 7 migrations covering 27 tables, with a hand-rolled migration runner
- Platform layer: config, logging, errors, money, dates, recurrence, email, Redis
- Auth (register/login/refresh/logout, password reset, email verification)
- Workspaces with owner/admin/editor/viewer RBAC and email invitations
- Multi-currency accounts, 3-level categories, transactions (transfers, splits,
  comments, tags, search, CSV **export**, reconciliation) — import came much
  later, in the session described in section 2d
- Budgets with subcategory roll-up, audited mid-period revisions, rollover
- Recurring transactions, financial goals with contributions
- Eight alert rule types including z-score anomaly detection, plus notifications
- Analytics and reporting endpoints
- BullMQ worker with four queues and repeatable schedules
- 148 tests (10 files), seed data, and four documents under `docs/`

Roughly 13,000 lines of source and 2,300 lines of tests.

### Verified end to end, not just typechecked

All 148 tests pass against real Postgres in ~16s — the suite has since grown to
222; see section 4 for the current command. The compiled `dist/server.js`
and `dist/worker.js` both boot; a login against a seeded demo account returned a
correct dashboard (multi-currency total, category roll-up, budget at 87.53%
flagged `warning`), and the worker processed all four queues with zero failures
and delivered an alert email into MailHog.

### Three real bugs the test suite caught

Worth knowing about, because two of them are patterns that can recur:

1. **The refresh-token replay defence was inert.** It revoked the compromised
   token family and *then* threw — inside the same transaction, so the rollback
   undid the revocation and the stolen token's replacement stayed valid. Fixed
   in `modules/auth/tokens.ts`: the transaction now returns an outcome and the
   rejection is raised after the commit. **Never throw from inside a transaction
   when the write must survive.**
2. **`GET /transactions` returned 500 unconditionally.** An `async` helper
   resolved to a Kysely query builder. Builders are deliberately thenable and
   throw when awaited, so the async machinery detonated. **Never return a query
   builder from an `async` function** — wrap it in an object.
3. **`z.coerce.boolean()` inverted every boolean query flag.** `"false"` is a
   truthy string, so `?includeSubcategories=false` meant `true`. Fixed across
   seven route files; use `booleanQuerySchema` / `booleanQueryWithDefault` from
   `modules/shared/schemas.ts` for any boolean read from a query string.

---

## 2. What was done in the web client

The React client in `apps/web` now covers **every** screen from the original
"core client screens" plan: **Dashboard, Accounts, Transactions, Budgets,
Goals, Recurring, Alerts, Reports, Settings.** Nothing in the nav is a
placeholder any more — `PlannedPage` and the `planned` flag on `NavItem` were
deleted along with the last two stubs, so re-add them if a future screen needs
to be stubbed.

Stack, as decided in session one and followed throughout: Vite, Material-UI,
Redux Toolkit (RTK Query), Recharts, React Hook Form with Zod. Every screen
mirrors the API's own layering: a `features/<domain>/` folder holds schemas,
dialogs and cards, `api/endpoints/<domain>.ts` holds the RTK Query module (one
file per backend module, same names), and a thin `pages/<Domain>Page.tsx` owns
data-fetching and dialog state. `lib/permissions.ts` mirrors the server's
`requireEditor` / `requireAdmin` checks to hide controls the API would reject
anyway — the server is still the authority.

Per-screen notes:

- **Accounts** — grid of cards, create/edit dialog, archive toggle, role-gated
  delete. Reconciliation and per-account statement history are not built yet.
- **Transactions** — filterable/searchable ledger with pagination, a
  create/edit dialog for income/expense rows, **transfers** (own dialog, with a
  destination-amount field that appears only across currencies), **tags**
  (manager dialog, assignment on the form, chips on each row, a filter in the
  bar), and a **detail drawer** carrying the row's tags, its **split** and its
  **comment thread**. The splits editor covers the server's three modes — even,
  weighted, and exact amounts that must add up to the total.
  **CSV import** is now built — see section 2d.
  Still unbuilt from this screen, all backed by the API: bulk categorise,
  confirming a scheduled row, and restoring a deleted one.
- **Budgets** — per-line progress meters, create dialog with dynamic category
  lines, audited mid-period limit revisions, add/remove lines, rollover.
- **Goals** — progress cards, a contributions dialog (add/list/delete), and
  status transitions (pause/resume/mark achieved).
- **Recurring** — schedule cards; the schedule shape (frequency, weekday,
  day-of-month) is only editable at creation, matching the server's PATCH
  schema, which has no way to change it.
- **Alerts** — one section per alert rule type (the eight from `docs/api.md`),
  config fields per type, channel and scope selection, an on-demand scan
  button. Requires admin, not just editor, matching the server.
- **Reports** — a monthly statement (closing balance leading, opening balance
  as context, income/expenses/net tiles, a ranked category table, per-account
  closing balances, budget performance), a year-over-year section with a
  grouped-bar chart and a figures table, and two CSV exports. The month and
  year pickers are deliberately independent.
- **Settings** — four tabs split by *whose* setting it is: **Profile** (name,
  locale, timezone, default currency, avatar, plus change-password),
  **Workspace** (name/base currency/timezone, admin-gated; archive, owner-only),
  **Members** (role changes, removal, ownership transfer, plus an admin-only
  invitations panel), **Data** (JSON export, sign-out-everywhere, account
  deletion). Tab state is local, not in the URL, matching the rest of the app.

Three shared presentational pieces — `StatTile`, `ChartTooltip` and
`SeriesLegend` — moved from `features/dashboard/` to `components/` when Reports
needed them, following the rule `ConfirmDialog` already states: anything used by
more than one screen lives in `components/`.

---

## 2b. The visual redesign

The client was rebuilt on a real design language in a later session. It is a
**presentation-layer change only** — nothing in `api/`, the Zod schemas,
`lib/permissions.ts` or the routes was touched, and the stack decision was not
reopened. The full reasoning is a new entry in `docs/decisions.md`, "Visual
redesign: theme, tokens, and the statement-line motif". The short version and
the things that will bite you:

**The idea: a well-set financial statement.** Money is the content; everything
else is chrome. Typography carries hierarchy, not elevation.

- **Three type families, three jobs.** `Fraunces` (variable serif, `opsz` axis)
  for hero balances and page titles; `Instrument Sans` for all UI; **`IBM Plex
  Mono` with `tabular-nums` for every figure in a list or table**. All three are
  self-hosted via Fontsource and imported in `main.tsx`; Fraunces comes from
  `@fontsource-variable/fraunces/opsz.css`, not `index.css`, because only that
  file carries the optical-size axis. `theme.ts` exports `FONT_DISPLAY`,
  `FONT_UI` and `FONT_MONO` for the few places that need a family directly.
- **New typography variants**: `display` (the one dramatic step — a hero
  balance), `amount` (mono, tabular, for a figure in a row) and `eyebrow` (small
  uppercase label). Use `<Typography variant="amount">` or `components/Amount.tsx`
  for money in a table; do not hand-roll `fontVariantNumeric` any more.
- **`components/LedgerRow.tsx` is the signature form.** Hairline rule beneath,
  mono figure right-aligned, 3px status spine on the left, and a documented fold
  to a stacked layout on a narrow screen. Transactions, budget lines, recurring
  schedules, recent activity and upcoming bills all use it. Wrap a run of them in
  `components/LedgerList.tsx`, which owns the loading / empty / full states and
  the entry stagger. **Anything that is a list of money should be built from
  these two, not from a `<Table>`.**
- **`lib/tone.ts`** maps a domain status onto a spine tone, and gives the
  *ordinary* states (`cleared`, `on_track`) no spine at all — a ledger where
  every line is marked is a ledger where nothing is.
- **Shared shells**: `PageHeader` (every screen's masthead), `Panel` (a titled
  region — pass `padded={false}` when the content is `LedgerRow`s, or the rules
  stop short of the panel edge), `EmptyState`, `Brandmark`.
- **Cards are flat with a hairline.** Shadow is reserved for things that float —
  dialogs, menus, tooltips — and for the dashboard's `StatTile`s.
- **Motion** (`lib/motion.ts`) says "this updated" and nothing else: a stat-tile
  counter on arrival, a ~45ms stagger on statement lines, and the nav's active
  spine sliding via a shared `layoutId`. No bounce, no parallax, no hover
  flourish. `prefers-reduced-motion` is honoured both globally in `CssBaseline`
  and per component via `useReducedMotion()`.

### Three traps this redesign hit, all found by looking rather than reasoning

1. **A global `:focus-visible` rule needs `!important`.** MUI's `ButtonBase` and
   `InputBase` set `outline: 0`, and an emotion class beats a bare
   `:focus-visible` on both specificity and sheet order. Before the fix, a
   Playwright pass that tabbed through 22 controls and read the computed
   `outline` found **zero** of them showing a ring, despite the rule being
   present and valid in the stylesheet. Chrome additionally never matches
   `:focus-visible` on the inner `<input>` of a date field — those are covered by
   the focused `OutlinedInput`'s 2px accent border instead, which is fine.
2. **A `1fr` grid track still has `min-width: auto`.** A wide table inside one
   pushes the whole page sideways no matter how many `overflow-x: auto` wrappers
   sit beneath it. Every multi-column grid in `apps/web` uses `minmax(0, 1fr)`;
   Reports overflowed a 390px viewport by 15px until it did. **Use
   `minmax(0, 1fr)`, never bare `1fr`, in any grid that can contain a table.**
3. **Inside `styleOverrides`, read palette values as `var(--mui-palette-*)`.**
   The callback receives the *default* colour scheme's literal values, so
   `theme.palette.divider` there bakes the light hairline into dark mode. There
   is a `v()` helper at the top of `theme.ts` for exactly this. (`sx` props and
   `useTheme()` inside components are fine — those do follow the active scheme.)

Two palette hexes from the redesign brief could not clear AA as *text* on a
light surface — `verde-claro #1E9E63` at 3.43:1 and `ouro-velho #C68A2E` at
2.97:1 — so light mode uses a darker step of each hue (`#157A4E`, `#8A5A16`) and
the nominal values survive as the dark-mode steps. Every text colour and
coloured figure clears 4.5:1 against all three surfaces in both schemes; every
graphical mark clears 3:1. **If you add a colour, check it against the surface
it actually renders on rather than trusting the token name.**

**A later session added a second, softer register for controls specifically**
— pill buttons, softly rounded fields with a focus glow instead of a hard
ring, a `scale()` press — on top of the flat statement language above, which
stays untouched for cards and ledger rows. Icons moved from `@mui/icons-material`
to **Phosphor** at the same time, for a thinner, more consistent stroke.
`src/icons.tsx` is the one file every icon in the app now goes through — it
wraps each Phosphor glyph in MUI's `Box` with `component={Glyph}` specifically
so the full `sx` engine (spacing shorthands, theme tokens, `verticalAlign`)
still works at every call site exactly as it did against MUI's own `SvgIcon`.
Full reasoning, including a `ToggleButtonGroup` radius trap this hit, is in
`docs/decisions.md` ("Soft controls, a distinct icon set"). **Any new icon
goes in `icons.tsx`, imported from `@phosphor-icons/react`, never straight
from `@mui/icons-material`.**

---

## 2c. Languages

The client ships in **English, Português (Brasil) and Español**. Reasoning is in
`docs/decisions.md` ("The client is translated; the API is not"); this is what
you need in order to not break it.

- **`src/i18n/`** holds it: `languages.ts` (the shipped list and
  `resolveLanguage`, which maps any tag onto one of them), `index.ts` (i18next
  init, detection, `setLanguage`), `useLanguage.ts` (the hook the pickers use),
  and `locales/{en,pt-BR,es}.json`.
- **The picker lives in two places, deliberately not three.** Settings → Profile
  (where it replaced the old free-text "Locale" field) is where a signed-in user
  changes it — there is no app-bar picker any more, on request, since a
  standing preference belongs in settings rather than next to the notification
  bell. It also still appears on the signed-out screens (`AuthLayout`), because
  someone who cannot read the login page has no Settings screen to reach yet.
- **Detection order**: an explicit choice in this browser's `localStorage` →
  `navigator.languages` → English. The signed-in profile's `locale` is adopted
  only if this browser has no choice of its own.
- **`lib/format.ts` follows the picker.** Every money/date helper defaults to
  `appLocale()` instead of `navigator.language`, so one setting governs the
  words *and* the numbers.

**The three rules to follow when adding anything:**

1. **Every user-visible string goes through `t()`.** A hardcoded one looks fine
   in English and silently stays English in the other two.
2. **A module evaluated at import holds a catalogue key, not a label.**
   `navItems.ts`, `lib/tone.ts`, `alertMeta.ts`, every `*_LABEL_KEYS` table and
   every Zod message in `features/*/*Schemas.ts` are built once when the bundle
   loads, before any language is settled, so they carry keys and the render site
   calls `t()`. Form fields go through `fieldMessage()` from `lib/validation.ts`,
   which resolves a known key and passes a server-sent sentence through
   untouched.
3. **Add the key to all three catalogues.** A missing key falls back to English
   without complaining. This checks it, including that the `{{placeholders}}`
   match — a translation that drops one loses a number, not just a word:

**One namespace is not in these files.** `validation.*` lives in
`packages/schemas/src/translations.ts`, because the API rejects a field with the
very same key and the wording would otherwise be maintained in two catalogues.
Both i18n layers merge it in at init. Its completeness is enforced by the
compiler rather than by the script below (`Record<ValidationLocale,
Record<ValidationMessageName, string>>` will not build with a language missing),
and its placeholders are checked by `tests/unit/shared-schemas.test.ts`.

```bash
# from apps/web/src — compares key sets and placeholders across en/pt-BR/es
node -e "const f=(d,p='')=>Object.entries(d).flatMap(([k,v])=>typeof v==='object'?f(v,p+k+'.'):[[p+k,v]]);const L=c=>Object.fromEntries(f(require('./i18n/locales/'+c+'.json')));const en=L('en');for(const c of ['pt-BR','es']){const o=L(c);const miss=Object.keys(en).filter(k=>!(k in o));const ext=Object.keys(o).filter(k=>!(k in en));console.log(c,'missing',miss.length,'extra',ext.length,[...miss,...ext].join(' '))}"
```

**Server text is translated too, for the three things a user reads: API error
messages, alert notifications (and the emails built from them), and the
workspace-invitation email.** `apps/api` has its own `i18next` instance and
catalogue (`apps/api/src/i18n/locales/`), independent of the client's — see
`docs/decisions.md` ("The API gets its own i18n layer") for the locale-
resolution rules and the `AppError` key/param design. **Field-validation messages
are translated too now**, which that entry originally left undone — the shared
schema package (section 5c) made every authored rejection carry a catalogue key,
so `error.details[].message` in a 422 comes back in the caller's language. What
is still English is only Zod's own *built-in* wording for a bare `.max(120)`,
which nobody wrote and the client translates before a request is ever sent.
The client sends its current `i18n.language` as `Accept-Language` on every
request (`api/baseQuery.ts`) so the two pickers agree before sign-in too.

### Verified against the real backend, not just typechecked

A clean `tsc --noEmit`, a Vite dev-server transform check, and a passing
production `vite build` prove the code parses and bundles — they do not prove
the app works. This session also brought up the real backend (Docker Desktop,
Postgres, Redis, the API process) and drove the actual UI with a real browser
against seeded demo data. See "End-to-end / visual verification" under
section 4 for exactly how, since neither piece of tooling is obviously
available in this environment by default.

That verification caught real bugs that typechecking could not:

1. **The Recurring screen showed "R$ NaN" for every expense schedule.** The
   client assumed `RecurringTransaction.amount` was an unsigned magnitude,
   like the create/update input contract. It isn't: the API returns the
   **signed, stored** value (negative for expenses), the same convention
   transactions use (see docs/decisions.md). Fixed in `RecurringCard.tsx` —
   since the redesign, `RecurringRow.tsx` — and
   `RecurringFormDialog.tsx`; the type in `api/types.ts` now says so.
2. **Every MUI `<TextField select>` bound only via react-hook-form's
   `register()` rendered visually blank**, even though the underlying value
   was correct — confirmed by inspecting the hidden input directly. MUI's
   `Select` needs a controlled `value` prop; `register()`'s uncontrolled ref
   binding sets the DOM value but never tells React (and therefore MUI) what
   to display. Fixed by adding `value={watch('field')}` alongside `register()`
   on every affected select, across the Accounts, Transactions, Budgets,
   Goals and Recurring dialogs. **Any new form with a `TextField select` needs
   both `register()` and `value={watch(...)}`, or it will look empty on open
   and on edit.**
3. **A related MUI quirk:** a placeholder `<MenuItem value="">Uncategorised</MenuItem>`
   does not render even with a matching controlled value, unless the `Select`
   also gets `SelectProps={{ displayEmpty: true }}` — and once that's added,
   the field's label needs `InputLabelProps={{ shrink: true }}` or it overlaps
   the displayed text, because MUI treats an empty-string value as "no label
   shrink" by default.

The Reports/Settings session drove both new screens the same way (login, both
screens as owner *and* as editor, all three downloads, a profile save,
a role change, an invitation create/revoke, light and dark). Two more things
turned up that only looking at the rendered page could show:

4. **`StatTile` never rendered its `deltaCaption` unless a `deltaPercent` was
   also passed**, so the dashboard's "savings rate 42.1%" footnote under *Net
   this month* had silently never appeared. The footer now renders for a
   caption alone; `deltaCaption` no longer defaults to `'vs last month'` except
   when there is a delta, so a tile with neither still shows no footer.
5. **The year-over-year table reported a green "−100.0%" for months that have
   not happened yet.** The figure is arithmetically right — zero spending
   against last year's real total — but it reads as an achievement rather than
   as an empty month. `YearOverYearTable` now withholds the comparison for any
   month later than today, alongside the existing guard for a zero baseline.
   **A percentage change is only worth printing when both sides are real.**

The Transactions session (transfers, tags, splits, comments) added two more:

6. **A dialog that seeds itself from a lazily-fetched list will seed itself
   from nothing.** The splits editor defaulted its participants to "everyone in
   the workspace", but the member list was only requested when the dialog
   opened, so the seeding effect ran against an empty array and left Save
   permanently disabled. Two fixes, both wanted: the page now fetches members
   with the page rather than on open, and the effect waits for data and seeds
   exactly once per opening, tracked in a ref so it can never undo the user's
   own deselections. **Any "default to all of X" in a dialog needs to survive X
   arriving late.**
7. **An even split of an odd amount displays as if it does not add up.**
   `123.45` split two ways stores `61.7250` each — exact at `NUMERIC(19,4)`,
   and they do sum to the total — but both render as `R$ 61,73` at two decimal
   places, so the drawer appears to show `61,73 + 61,73 = 123,46`. The stored
   figures are right and nothing is lost; only the display rounds. Fixing it
   properly means deciding whether an even split should round to the currency's
   minor unit server-side, which is a money-semantics decision rather than a UI
   tweak — left alone deliberately.

Conventions worth keeping for anything similar:

- **An authenticated file download cannot be an `<a href>` or `window.open`** —
  the browser sends that request without the `Authorization` header and gets a
  401. Fetch the body through the normal RTK Query base query (which attaches
  and refreshes the token), then hand it to `lib/download.ts`. CSV endpoints
  additionally need `responseHandler: 'text'`, or `fetchBaseQuery`'s default
  JSON parse fails before the caller ever sees the body.
- **Exports are modelled as RTK Query mutations even though they are GETs.**
  They are triggered by a button rather than by a component mounting, and
  caching a CSV that is written straight to disk would only pin megabytes of
  text in memory.
- **An array form field is driven by `watch`/`setValue`, never `register()`.**
  The ref binding that already needs a controlled `value` on a scalar MUI
  `Select` cannot express a multiple selection at all. `tagIds` on the
  transaction form is the reference example.

---

## 2d. CSV import

Built in a later session, backend first. Full reasoning is in `docs/decisions.md`
("CSV import is preview-then-commit"); the endpoint reference is in
`docs/api.md`. What you need in order not to break it:

- **`modules/imports`** is `routes.ts` + `service.ts` + **`mapping.ts`**, which
  holds the pure inference — header-synonym guessing in three languages, amount
  parsing, date-layout inference, description normalisation. Everything in
  `mapping.ts` is a pure function precisely so the hard parts are unit-testable
  without a database; 37 unit tests cover it.
- **`lib/csv.ts` now owns both directions.** `csvField` and `toCsv` *moved here*
  from `modules/reports/service.ts` when the reader was written — if you are
  looking for the CSV writer, it is no longer in the reports module, and
  `tests/unit/csv.test.ts` imports from `lib/csv.js`.
- **Migration `008_imports`** adds `import_batches` and
  `transactions.import_batch_id`. A batch goes `preview → committed → reverted`;
  the preview holds the parsed rows in `preview_rows` and the commit clears them.
  `tests/setup.ts`'s `TABLES` list needs `import_batches` between `transactions`
  and `recurring_transactions` — it is there; keep it there if you touch that list.
- **A preview writes nothing to the ledger.** Do not "optimise" it into an
  upsert. The whole guarantee is that a file failing on row 147 leaves no trace.
- **The commit inserts in chunks of 500** because Postgres caps a statement at
  65535 bind parameters and each row spends eighteen.
- **Undo is a bulk `deleted_at` update**, which unwinds balances through the same
  trigger a single delete uses. It refuses when any imported row is reconciled.
- **Abandoned previews are swept hourly** by a new `purge_import_previews`
  maintenance task in `jobs/processors.ts`. If you add a maintenance task,
  remember it needs an entry in `MaintenanceJobData`'s union *and* a repeatable
  registration in `jobs/queues.ts`.

Client: `features/transactions/ImportDialog.tsx` (choose → review → done), with
`ImportMappingEditor.tsx` and `ImportPreviewRows.tsx` beside it, opened from a
role-gated button on the Transactions header. The preview rows are built from
`LedgerRow`/`LedgerList` rather than a `<Table>`, following the rule in section
2b — which also means the preview already looks like the ledger it is about to
become.

Two things worth knowing before extending it:

- **The file is read as UTF-8** via `File.text()`. A Latin-1 bank export will
  mangle accented descriptions. Deliberate, and called out in the decision log.
- **The preview is posted as JSON, not multipart.** The payload is capped at
  512 KB and 2000 rows, well under the app-level 1 MB `express.json` limit, and
  keeping one content type means the request rides the same authenticated
  `baseQueryWithReauth` path as everything else. Raising the row cap means
  raising the body limit too, and at that point multipart becomes the right call.

---

## 3. Project structure

```
D:\finance_app
├── apps/
│   ├── api/                         # @finance/api
│   │   ├── src/
│   │   │   ├── server.ts            # HTTP entrypoint
│   │   │   ├── worker.ts            # background job entrypoint
│   │   │   ├── app.ts               # express app factory (used by tests too)
│   │   │   ├── config/              # env parsing and typed config
│   │   │   ├── db/
│   │   │   │   ├── migrations/      # 001..008, plus index.ts registry
│   │   │   │   ├── migrate.ts       # runner: up | down | status
│   │   │   │   ├── seed.ts          # demo dataset
│   │   │   │   ├── client.ts        # Kysely instance
│   │   │   │   └── types.ts         # generated-style DB types
│   │   │   ├── i18n/locales/        # en.json, pt-BR.json, es.json — server catalogue
│   │   │   ├── lib/                 # money, dates, recurrence, email, redis,
│   │   │   │                        # errors, http, logger, i18n,
│   │   │   │                        # csv (reader + writer, both directions)
│   │   │   ├── middleware/          # auth, validate, error handling, locale
│   │   │   ├── jobs/                # queues.ts, processors.ts
│   │   │   └── modules/             # one folder per domain, each routes.ts +
│   │   │                            # service.ts: accounts, activity, alerts,
│   │   │                            # analytics, auth, budgets, categories,
│   │   │                            # currencies, goals, imports, notifications,
│   │   │                            # recurring, reports, shared, tags,
│   │   │                            # transactions, users, workspaces
│   │   │                            # (imports also has mapping.ts: pure
│   │   │                            #  column/date/sign inference)
│   │   ├── scripts/copy-assets.mjs  # build step: copies i18n/locales into dist
│   │   └── tests/
│   │       ├── unit/                # money, dates, recurrence, detectors, csv,
│   │       │                        # import-mapping
│   │       └── integration/         # auth, workspaces, transactions, imports,
│   │                                # budgets-analytics, recurring-alerts
│   └── web/                         # @finance/web — React client (Vite)
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx             # entrypoint: store, theme, router
│           ├── App.tsx              # routes
│           ├── theme.ts             # MUI theme, light/dark, money palette
│           ├── icons.tsx            # every icon in the app; wraps @phosphor-icons/react
│           │                        # behind MUI's SvgIcon prop surface (fontSize/color/sx)
│           ├── app/                 # store.ts, hooks.ts
│           ├── api/
│           │   ├── api.ts           # the single RTK Query service + tag types
│           │   ├── baseQuery.ts     # fetch base query + transparent refresh
│           │   ├── types.ts         # hand-written mirror of API response shapes
│           │   └── endpoints/       # one file per backend module: accounts.ts,
│           │                        # alerts.ts, analytics.ts, auth.ts,
│           │                        # budgets.ts, categories.ts, goals.ts,
│           │                        # imports.ts, notifications.ts, recurring.ts,
│           │                        # reports.ts, tags.ts, transactions.ts,
│           │                        # users.ts, workspaces.ts
│           ├── components/          # Amount, AppLayout, Brandmark,
│           │                        # ChartTooltip, ConfirmDialog, EmptyState,
│           │                        # ErrorState, LanguageMenu, LedgerList,
│           │                        # LedgerRow, NotificationsMenu, PageHeader,
│           │                        # Panel, SeriesLegend, StatTile, UserMenu,
│           │                        # navItems.ts
│           ├── i18n/               # index.ts (init + detection), languages.ts,
│           │                        # useLanguage.ts, locales/{en,pt-BR,es}.json
│           ├── features/            # one folder per domain: accounts, alerts,
│           │                        # auth, budgets, dashboard, goals,
│           │                        # recurring, reports, settings,
│           │                        # transactions, workspace — each holds its
│           │                        # *Schemas.ts (client mirror of the
│           │                        # server's Zod schemas), dialogs and cards
│           ├── pages/               # AccountsPage, AlertsPage, BudgetsPage,
│           │                        # DashboardPage, GoalsPage, RecurringPage,
│           │                        # ReportsPage, SettingsPage,
│           │                        # TransactionsPage
│           └── lib/                 # apiError.ts, chartTokens.ts, currencies.ts,
│                                     # download.ts (authenticated file saves),
│                                     # format.ts (money/date formatting),
│                                     # money.ts (exact add/compare, display only)
│                                     # motion.ts (shared Framer Motion variants)
│                                     # permissions.ts (client-side role checks)
│                                     # tone.ts (domain status -> ledger spine)
│                                     # validation.ts (resolves Zod message keys)
├── packages/
│   └── schemas/                     # @finance/schemas — the rules both apps share
│       ├── package.json             # builds to dist/; `prepare` runs that build
│       ├── tsconfig.json            # NodeNext + declarations (apps/api is stricter)
│       └── src/
│           ├── limits.ts            # every bound, in one table
│           ├── enums.ts             # every closed set of values
│           ├── patterns.ts          # predicates: money, date, password, ranges
│           ├── messages.ts          # ValidationKey union + interpolation params
│           ├── translations.ts      # the wording, en/pt-BR/es, typed complete
│           └── fields.ts            # the API's request fields (no transforms)
├── docs/
│   ├── architecture.md              # system design
│   ├── api.md                       # endpoint reference
│   ├── decisions.md                 # decision log (see section 6)
│   └── finance_management_project_prompt.md   # original brief
├── infra/postgres/init/             # container init SQL
├── .github/workflows/ci.yml         # typecheck + build + full suite
├── .gitignore
├── .gitattributes                   # LF in the repo, native in the tree
├── docker-compose.yml               # postgres, redis, mailhog
└── package.json                     # workspace root; also pins `vite` to
                                     # dedupe it — see "Environment quirks"
```

**API module convention:** every domain folder in `apps/api` is exactly
`routes.ts` (Express router, Zod validation, no business logic) plus
`service.ts` (all logic, owns its own SQL). Follow this when adding domains.

**Web feature convention:** every domain folder in `apps/web/src/features` mirrors
the API module it talks to — schemas first, then dialogs, then cards.
Data-fetching and dialog open/close state live in the `pages/<Domain>Page.tsx`,
not in the feature components themselves, so a card or dialog can be reused
without knowing where its data came from.

A `features/<domain>/*Schemas.ts` file is **no longer a hand-written copy** of
the server's rules. It reads every bound, value set and pattern from
`@finance/schemas` and adds only the form's own half: fields that arrive as text
rather than as numbers, `''` where the API would see `undefined`, and
confirmation fields the API never sees. **Do not write a literal bound into one
of these files** — if a number is not in `packages/schemas/src/limits.ts` yet,
put it there.

**Shared-package convention:** `@finance/schemas` is consumed as **compiled
output**, so `packages/schemas/dist` must exist before either app typechecks.
Every root script (`npm run typecheck`, `build`, `test`, `test:unit`, `dev`)
builds it first, `npm ci` builds it through the package's own `prepare` script,
and both CI jobs build it explicitly. If you edit the package and then run a
workspace script *directly* (`npm run typecheck --workspace=@finance/web`), run
`npm run build:schemas` first or you are typechecking against stale declarations.

---

## 4. How to run

Requires Docker Desktop running, and Node >= 22.

```bash
npm install
cp .env.example .env          # defaults already match docker-compose
npm run infra:up              # postgres + redis + mailhog
npm run migrate               # apply migrations
npm run seed                  # demo data (optional but recommended)
npm run dev                   # API on http://localhost:4000
```

The web client is a separate process, in `apps/web`:

```bash
npm run dev --workspace=@finance/web    # Vite on http://localhost:5173
```

The worker is a separate process too:

```bash
npm run dev:worker --workspace=@finance/api
```

| What | Where |
| --- | --- |
| API | http://localhost:4000 (`/health`, `/health/ready`) |
| Web client | http://localhost:5173 |
| Postgres | localhost:5432, db `finance` / `finance_test`, user+pass `finance` |
| Redis | localhost:6379 |
| MailHog UI | http://localhost:8025 (SMTP on 1025) |

**Demo accounts** (after `npm run seed`): `ana@demo.local` and
`bruno@demo.local`, password `Demo1234567` for both.

### Tests

```bash
npm test                 # all 242 — needs Postgres, and only Postgres
npm run test:unit        # 131 pure units, no infrastructure at all
npm run typecheck        # all three workspaces
npm run build:schemas    # @finance/schemas alone; the others depend on it
npm run build --workspace=@finance/api
npm run build --workspace=@finance/web
```

Each of the root scripts above builds `@finance/schemas` first — see the
shared-package convention in section 3 for why, and for the one case where you
have to build it yourself.

The suite creates and migrates `finance_test` itself on first run. It should
finish in well under a minute — if it takes many minutes, see the TRUNCATE note
in section 6.

**The suite does not need Redis or MailHog.** Under `NODE_ENV=test` the cache
helpers short-circuit, `invalidateWorkspaceCache` is a no-op and the rate
limiter uses `RateLimiterMemory`, so nothing reaches either service. Verified by
stopping both containers and running the full suite — not inferred from reading.

**Both builds and both typechecks now pass.** Earlier versions of this file
documented `npm run build --workspace=@finance/web` as permanently broken by a
`vite.config.ts` type error; that error is **fixed** — see "Environment quirks"
below for what it was. Any output from these commands is now a real failure.

### CI

`.github/workflows/ci.yml`, on push to `main`, on pull requests, and on demand.
Two jobs run in parallel: **check** (typecheck, both builds, unit tests — no
services) and **test** (the full suite against a `postgres:16` service
container, then a migration rollback round-trip). Green on the first run, in
about a minute.

The workflow declares **no repository secrets**: the JWT values in it are
deliberately fake and the test database is created and discarded within the run.
Do not "improve" this by moving them into GitHub secrets — there is nothing to
protect, and it would only add a setup step before CI could work for anyone else.

If you add a step, run it locally first with CI's own environment rather than
your `.env` — `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` are the only variables without defaults:

```bash
DATABASE_URL=postgres://finance:finance@localhost:5432/finance \
TEST_DATABASE_URL=postgres://finance:finance@localhost:5432/finance_test \
JWT_ACCESS_SECRET=ci-access-secret-not-a-real-key-000000 \
JWT_REFRESH_SECRET=ci-refresh-secret-not-a-real-key-00000 \
npm test
```

### Git

The repository is **https://github.com/Capovillaa/finance-app** — public, one
remote (`origin`), default branch `main`.

- **Commits use a noreply author**, `160801041+Capovillaa@users.noreply.github.com`,
  set as `user.email` in this repository's own config so a fresh clone or a
  changed global identity cannot leak a personal address into a public history.
  If you ever rewrite history, keep it that way.
- **`.gitattributes` normalises line endings** (`* text=auto`, LF in the
  repository, native in the working tree). Development happens on Windows with
  `core.autocrlf=true` while CI runs on Linux; without this every file would
  show as wholly changed the first time it was touched from the other platform.
  It was added before the first commit deliberately, so there is no
  normalisation churn in the history.
- The `gh` CLI is installed at `C:\Program Files\GitHub CLI\gh.exe` and is
  **not on Git Bash's PATH** in an already-open shell — invoke it by full path,
  or from PowerShell.

### End-to-end / visual verification

Typechecking and a production build prove the code parses; they do not prove a
screen renders correctly against real data, or that a create/edit dialog
actually round-trips through the API. Section 2's three bugs were only found
this way. Neither piece of tooling below is obviously present by default, so
this is worth writing down.

**Docker Desktop is a GUI app but starts fine headlessly.** From this repo's
shell (PowerShell), it does not need a user to click anything:

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

The daemon (`docker info`) is typically ready within 5–10 seconds. Poll it
instead of sleeping a fixed amount — a bounded loop checking every few seconds
is enough; it does not need minutes.

**There is no `chromium-cli` in this environment.** For a real browser check,
install Playwright in a scratch directory outside the repo (so it never
touches `apps/web/package.json` or the lockfile) and drive the machine's
already-installed Chrome directly — this skips downloading Playwright's own
bundled Chromium entirely:

```bash
mkdir -p /path/to/scratch/pw && cd /path/to/scratch/pw
npm init -y && npm install playwright
```

```js
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:5173/login');
await page.fill('input[type="email"]', 'ana@demo.local');
await page.fill('input[type="password"]', 'Demo1234567');
await page.click('button[type="submit"]');
await page.waitForSelector('text=Dashboard', { timeout: 15000 });
await page.screenshot({ path: 'dashboard.png', fullPage: true });
// The driver script is deliberately not checked in — it is scratch, and it
// belongs outside the repo along with the Playwright install. Rebuild it fresh
// each time; it's a dozen lines.
```

**Three selector traps, learned the slow way while driving the forms:**

1. **A dialog's submit button often has the same label as the button that opened
   it.** `t('recurring.create')` is "New schedule" on both the page header and
   the dialog's submit, so `getByRole('button', { name: 'New schedule' })` is
   ambiguous the moment the dialog is open. Use
   `page.locator('[role="dialog"] button[type="submit"]')`, which is unambiguous
   and survives a label change.
2. **The nav items are buttons.** MUI's `ListItemButton` carries
   `role="button"`, so a loose name regex like `/account/i` matches the sidebar
   link before the "Add account" button and quietly navigates instead of opening
   the dialog. Match exactly.
3. **A form needs its `<Select>`s filled or it fails on those instead.** Click
   the `[role="combobox"]` and then `li[role="option"]` — the field you are
   actually testing never gets to report anything until the required selects hold
   a value.

**You do not need seed data to reach a signed-in screen.** Registering through
the UI takes four fills and a click, gives a clean workspace, and avoids the
seed's re-run problem below entirely. Force the language first with
`localStorage.setItem('finance.language', 'en')` so assertions do not depend on
whatever this machine's browser prefers — it is pt-BR here, which will silently
break an English string match.

**If `npm run seed` fails with a foreign-key violation on `workspaces_owner_id_fkey`
when re-run against a database that already has demo data**, that's a bug in the
seed script's own idempotent-reset step (it deletes from `users` before the
`workspaces` rows that reference them are gone) — not a sign anything is
broken. Check whether `ana@demo.local` / `bruno@demo.local` already exist
before treating a seed failure as real; `npm run migrate` is always safe to
re-run.

**`npm run seed` also does not exit when it finishes.** It prints
`Seed complete` with its counts and then sits there holding the database pool
open, which reads exactly like a hang and will burn a long timeout if you wait
for it. The work is already done at that point — the demo accounts exist and
the transactions are inserted. Watch for the `Seed complete` line rather than
for the process to return, and stop it yourself.

### Environment quirks on this machine

These are not preferences, they are workarounds for real failures observed here:

- **Postgres image must be Debian `postgres:16`, not `postgres:16-alpine`.** The
  musl build cannot exec its own entrypoint under this Docker Desktop/WSL2 setup
  (`exec format error` on `/bin/sh`). `docker-compose.yml` carries a comment.
- **Docker's data lives on `D:\DockerData`**, reached through a directory
  junction at `%LOCALAPPDATA%\Docker\wsl\disk`. `C:` had filled to zero bytes and
  the 5.1 GB `docker_data.vhdx` was moved off it. Do not delete that junction.
  Setting `dataFolder` in Docker's `settings-store.json` did **not** work.
- Keep an eye on free space on `C:` before large image pulls.
- ~~**`apps/web`'s `tsc --noEmit` reports a `vite.config.ts` type error.**~~
  **Fixed** in the CI session, because a CI job cannot gate on a step that
  always fails. The cause was two `vite` copies: root got 5.x (pulled in by
  `apps/api`'s `vitest`), `apps/web` got its own nested 6.x, and
  `@vitejs/plugin-react` hoisted to root — so `react()` returned root-vite-5's
  `Plugin` while `defineConfig` in `apps/web` wanted web-vite-6's
  `PluginOption`. The fix is one line: **`vite` is now a root `devDependency`**
  pinned to `^6.4.3`. npm then hoists vite 6 to the root (where
  `plugin-react` and `apps/web` both resolve it) and nests vite 5 under
  `node_modules/vitest/`, so the test runner is completely untouched — the
  suite was 222-green before and after. **Do not remove `vite` from the root
  `package.json` thinking it is unused; it is there to force that dedupe.**

---

## 5. Next tasks, in priority order

1. ~~**Web client scaffold.**~~ **Done.** Vite, Material-UI, Redux Toolkit and
   Recharts, with React Hook Form and Zod for forms. Auth, workspace switching,
   and the API client are wired.
2. ~~**Core client screens.**~~ **Done** (section 2). All nine screens exist:
   Dashboard, Accounts, Transactions, Budgets, Goals, Recurring, Alerts,
   Reports, Settings.
3. ~~**Finish the Transactions screen.**~~ **Done** (section 2), except CSV
   import, which is now task 4. Bulk categorise, confirm and restore are still
   UI-less but are one button each, not a project.
4. ~~**CSV import.**~~ **Done** (section 2d). Preview-then-commit, with undo,
   duplicate flagging and per-account mapping recall. The design that guided it
   is kept after this list, annotated with what changed in the building.
5. ~~**Share the request schemas.**~~ **Done.** `packages/schemas`
   (`@finance/schemas`) now owns every bound, value set, pattern and rejection
   message the two apps have to agree on, and both build their own parser on
   top — see section 5c for what shape that took and why the Zod schemas
   themselves are deliberately *not* shared. Four real divergences were found
   and fixed in the process, and the API's field-validation errors are now
   translated as a direct consequence.
6. **OpenAPI generation** from the Zod schemas, which also gives the client
   generated types for free. This is now the next thing to build, and it has a
   package to generate into: the request *bodies* are still described twice, as
   a Zod object on the server and as a hand-written interface in the client's
   `api/types.ts`. The value sets in that file already come from
   `@finance/schemas`; the structures are what is left.
7. ~~**CI**~~ **Done.** `.github/workflows/ci.yml` — see section 4. The
   `vite.config.ts` type error it would have tripped over was fixed rather than
   worked around, so the client's own `npm run build` is on the critical path.
   The repository was initialised, published and verified in the same session:
   **https://github.com/Capovillaa/finance-app** (public, `main`). The first
   push triggered the workflow and **both jobs passed in about a minute** —
   including the Postgres container coming up, `finance_test` being created
   from nothing, all 8 migrations applying and 222 tests passing. It is not a
   workflow that merely looks right; it has run.
8. **Live exchange rates.** Today there is no live provider anywhere in the
   app — `modules/currencies/service.ts`'s `refreshStaticRates()` re-inserts
   the same hardcoded `STATIC_BRL_RATES` table (indicative BRL-based rates,
   e.g. `USD: '0.1850'`) every time the `refresh_rates` maintenance job runs;
   nothing is ever fetched from the internet. `env.EXCHANGE_RATE_PROVIDER`
   already has an `'openexchangerates'` option in its Zod schema, but
   `jobs/processors.ts`'s `processMaintenance` only logs a warning ("Live rate
   provider not implemented; using static rates") when it sees that value and
   falls back to the static table regardless — the option is a placeholder,
   not a working path. Building this means: an HTTP client for a real
   provider (Open Exchange Rates, exchangerate.host, or similar — pick one
   with a free tier, this is a demo-scale app), a `fetchLiveRates()`
   alternative to `refreshStaticRates()` in `currencies/service.ts`, wiring
   `processMaintenance`'s `refresh_rates` case to call whichever the env var
   selects, and an API key in `.env`. No schema change needed — the
   `exchange_rates` table's `source` column already distinguishes `'static'`
   rows from a real provider's. Every transaction already stores the rate that
   applied on the day it happened (`docs/decisions.md`), so once real rates
   are being written, that historical correctness becomes genuine rather than
   only structurally supported.
9. **Rate-limit and auth hardening review** before any real deployment: the
   limiter falls back to in-memory when Redis is absent, and that fallback is
   per-process.
10. **Deployment story**: production Dockerfile for API and worker, plus a
    migration step that runs before rollout.

Not started, deliberately: deployment, and any real payment or bank
integration. Smaller known gaps, none of them oversights: bulk categorise,
confirm and restore have no UI though the API has them; account reconciliation
and per-account statement history have no UI; the workspace settings screen
cannot create a workspace (the switcher does that); a revoked invitation cannot
be re-sent, because the token only ever exists in the email; CSV import reads
files as UTF-8 only, and supports no other statement format (OFX, QIF).

One real gap found while building the import dialog and left alone as out of
scope: **`features/transactions/SplitsDialog.tsx` still has four hardcoded
English strings** — the even-split explainer and the three "Allocated …"
sentences in the exact-amounts alert. They break the section 2c rule that every
user-visible string goes through `t()`, and they silently stay English in
Portuguese and Spanish. Fixing it is four keys in three catalogues.

---

## 5b. CSV import — the design it was built from

**This is now built** (section 2d); the design below is kept because it explains
*why* the feature has the shape it does, and it was followed almost exactly. The
few places the implementation diverged are marked **[built as]** inline. For the
reasoning as shipped, read `docs/decisions.md`, "CSV import is preview-then-commit".

The shape of the problem: a user downloads a statement from their bank and
wants those rows in a workspace, without typing them. Every bank names its
columns differently, the file says nothing about which account it belongs to,
and re-importing an overlapping month must not double the balances.

**Do it as preview-then-commit.** Parsing and validating everything up front,
showing the user what will happen, and only then writing — rather than
streaming rows straight into the ledger — is the whole design. A file that
fails on row 147 must leave nothing behind.

Proposed API, as a new `modules/imports` following the usual `routes.ts` +
`service.ts` split:

- `POST /workspaces/:id/imports/preview` — multipart or a raw text body, plus
  `accountId` and an optional column mapping. Parses, applies the mapping,
  converts, runs duplicate detection, and returns a preview: the resolved rows,
  per-row errors with line numbers, a proposed mapping when none was given, and
  counts. Writes nothing.
  **[built as]** a JSON body carrying the file's text, not multipart — see the
  reasoning at the end of section 2d. The preview also persists as an
  `import_batches` row with status `preview`, which is where the batch id comes
  from.
- `POST /workspaces/:id/imports/commit` — takes the preview's id plus the rows
  the user kept, and inserts them in a single transaction, tagged with an
  `import_batch_id`.
  **[built as]** `POST /imports/:batchId/commit`, since the preview id *is* the
  batch id; the body is `{ rows: [{ lineNumber, categoryId? }] }`, so a row can
  be re-categorised on the way in.
- `DELETE /workspaces/:id/imports/:batchId` — undo a whole batch. Cheap to
  build once the batch id exists, and the thing a user will want within
  30 seconds of a bad import.
  **[built as]** exactly this, plus a `GET /imports` listing recent batches so
  the dialog can offer undo for an earlier import too, not only the last one.

Pieces to get right:

- **A real CSV parser, not `split(',')`.** Quoted fields containing commas and
  newlines, `""` escapes, a UTF-8 BOM, and CRLF endings all occur in bank
  exports. `lib/csv.ts` currently only *writes*; the reader belongs beside it
  with its own unit tests.
- **Column mapping with a sensible guess.** Match header names
  case-insensitively against a per-locale synonym list (`date`/`data`,
  `amount`/`valor`, `description`/`histórico`/`descrição`), let the user
  override every column, and remember the mapping per account so the second
  import of the same bank is one click.
- **Sign convention.** Some banks emit a signed amount, others separate
  debit/credit columns, others a positive amount plus a `D`/`C` flag. Support
  all three and make the choice explicit in the preview — getting this wrong
  inverts someone's whole statement.
- **Dates.** `DD/MM/YYYY` and `MM/DD/YYYY` are indistinguishable for the first
  twelve days of a month. Infer from the file where a day > 12 appears, and ask
  when it does not. Never guess silently.
- **Money stays a string end to end.** Parse into `Decimal` via `lib/money.ts`;
  a `Number` anywhere in this path defeats the point of the rest of the stack.
- **Duplicate detection**, against both the existing ledger and the file
  itself: same account, same `occurred_on`, same amount, and a similar
  description. Flag rather than drop, and let the user decide per row — a
  genuine pair of identical coffees on one day is not a duplicate.
- **Limits.** Cap the file size and row count, and reject a preview whose rows
  are not all valid before commit is allowed.
  **[built as]** 512 KB and 2000 rows. The commit rejects any *selected* row
  that has errors rather than the whole preview — a statement with four bad
  lines out of six is still worth importing the other two of, and the broken
  rows simply cannot be ticked.

Client: an import dialog on the Transactions screen — drop a file, choose the
account, confirm or fix the guessed mapping, review a table of rows with the
duplicates and errors called out, then commit. It should show the batch id
afterwards with an undo button.

Tests: unit tests for the parser (quoting, BOM, CRLF, ragged rows), for the
mapping guesser, and for date and sign inference; an integration test that
previews and commits a small file, re-imports the same file and sees every row
flagged as a duplicate, and undoes a batch.

---

## 5c. The shared schema package

Built as task 5. Full reasoning is in `docs/decisions.md`, "The validation rules
are shared; each side still builds its own parser". What you need in order not to
break it:

**What is in `@finance/schemas`** — six files, no framework, no I/O:

| File | Holds |
| --- | --- |
| `limits.ts` | every numeric bound and length, in one `LIMITS` table |
| `enums.ts` | every closed set, as `as const` tuples → Zod enum *and* TS union |
| `patterns.ts` | predicates a form can use on text: money, date, password, ranges |
| `messages.ts` | the `ValidationKey` union and the params a message interpolates |
| `translations.ts` | the wording for those keys in en / pt-BR / es |
| `fields.ts` | the API's request fields as Zod schemas, stopping before any transform |

**The Zod schemas themselves are not shared, on purpose.** The API parses a JSON
body (a number may arrive, absent is `undefined`, `moneySchema` transforms into
the `NUMERIC(19,4)` string via `decimal.js`); a form parses text (absent is `''`,
nothing is transformed). Sharing the objects would mean shipping `decimal.js` to
the browser or draining the server schema of its transform. **Do not "finish the
job" by merging them** — read the decision entry first.

**Money never transforms in the package.** `moneyField` validates and stops;
`apps/api/src/modules/shared/schemas.ts` adds `.transform(money)`. That module is
the API's adapter onto the package and is where server-only concerns
(query-string booleans, CSV arrays, the money transform) live.

**A rejection carries a catalogue key, never a sentence.** A Zod message is fixed
at import, before either process knows the request's language. Both resolvers
render it late: `apps/web/src/lib/validation.ts` and
`apps/api/src/middleware/error-handler.ts`. **This means the API's 422 details
are now translated** — a change from what section 2c used to say. Zod's own
built-in wording for a bare `.max(120)` is still English, deliberately.

**A message that quotes a bound gets the number from `LIMITS`.** The catalogue
entry says `{{min}}`/`{{max}}`; `VALIDATION_PARAMS` supplies the values. Never
type a bound into a translation — a unit test fails if a placeholder has no value
behind it, but nothing can catch a hardcoded number that has gone stale.

**Adding a rule:** put the bound in `limits.ts`, the key in the `ValidationKey`
union, the wording in all three locales in `translations.ts` (the compiler
insists), then use it from both sides. The four divergences this package was
built to end — `occurrenceLimit`, `leadTimeDays`, `intervalCount` and the budget
line cap — are covered by boundary tests in
`apps/api/tests/unit/shared-schemas.test.ts`, which check the server's field and
the client's text predicate against each other rather than each in isolation.

**Build ordering is the one operational cost.** See the shared-package convention
at the end of section 3.

### Two things only the browser found

Typechecks, both builds and 242 green tests all passed before either of these
was known. Both were caught by registering a fresh account through the real UI
and driving the Recurring and Budgets forms.

1. **A new rule on a field with no error binding fails silently.** Giving
   `occurrenceLimit` its 1–1000 bound made the Recurring form refuse to submit —
   correctly — while showing nothing at all, because that `TextField` was the one
   in the dialog with no `error` / `helperText` wired to it. It had never needed
   them: the field previously had no rule to break. **When you add a rule to a
   field, check that the field can actually say so.**
2. **Three budget-line helper texts rendered the raw catalogue key.**
   `BudgetFormDialog` passed `errors.lines?.[index]?.categoryId?.message`
   straight to `helperText` instead of through `fieldMessage()`, so a user saw
   `validation.categoryRequired` where a sentence belonged. That predates this
   work — the messages have been keys since the i18n session — and it survived
   because nothing renders a nested field-array error unless you make the array
   invalid on purpose. **Every `helperText` carrying a Zod message goes through
   `fieldMessage()`**; the sweep that finds violations is
   `grep -rn "helperText={.*\.message}" apps/web/src --include=*.tsx | grep -v fieldMessage`.

---

## 6. Architectural decisions

The full log with reasoning lives in `docs/decisions.md`. The ones that most
constrain future work:

**Money is `NUMERIC(19,4)` in Postgres and `Decimal`/string in TypeScript.**
Never `number`. `lib/money.ts` owns all arithmetic and rounds half-even. Amounts
cross the API as strings. Every transaction also stores a `base_amount` in the
workspace's base currency, converted at write time, so analytics never has to
join rates at read time.

**Kysely over an ORM.** The reporting queries (recursive category ancestry,
window functions for net-worth series) are the hard part of this domain, and a
query builder keeps them readable and typed. There is no repository layer —
services own their SQL on purpose.

**Import `{ Decimal }` from `decimal.js`, not the default export.** The package
merges a class with a same-named namespace; under NodeNext resolution the
default import resolves to the namespace and the build breaks.

**The API's two tsconfigs use NodeNext resolution.** They were split once
(`bundler` for `tsconfig.json`, `NodeNext` for `tsconfig.build.json`) and
`npm run typecheck` passed while `npm run build` failed. Keep them aligned so
typecheck is a real gate. `apps/web` is a separate case and correctly uses
`bundler`, because Vite bundles it; `packages/schemas` uses NodeNext, because
`apps/api` resolves it through Node's own resolver and NodeNext is the stricter
of the two to satisfy.

**Validation rules live in `@finance/schemas`; the parsers do not.** Every bound,
value set, pattern and rejection message both apps must agree on is declared once
in `packages/schemas` and each side composes its own Zod schema on top — the API
over a JSON body, the client over form text. They were duplicated by hand before
and had drifted in four places, all letting the client accept what the API
refuses. Because a rejection now carries a catalogue key rather than an English
sentence, the API's field-validation errors are translated. See section 5c and
`docs/decisions.md`.

**Auth uses short-lived JWT access tokens plus rotating opaque refresh tokens,
tracked in families.** Replaying a rotated token revokes the whole family. See
the bug in section 1 — the revocation must outlive the rejection.

**RBAC is resolved once per request** by `withWorkspace` middleware into a
workspace context, then checked by `requireViewer`/`requireEditor`/
`requireAdmin`/`requireOwner`. Route handlers never re-query membership. The
web client mirrors this with `lib/permissions.ts`'s `canEdit`/`canAdminister`,
which only hide controls the API would reject anyway — the server remains the
authority if role state is ever stale client-side.

**Categories are a 3-level tree with recursive roll-up.** Budgets, analytics and
transaction filters all roll subcategories into their parent by default, via a
recursive CTE that buckets each category to its ancestor at the requested depth.

**Alerts are configured per workspace as rules with a JSON config**, deduplicated
by a `dedupe_key` on a partial unique index, so a scan that runs every few
minutes cannot spam. Anomaly detection is a z-score over at least three months
of history.

**The alert-rule upsert matches the scope explicitly instead of using
`ON CONFLICT DO UPDATE`,** because the uniqueness rule is an expression index
over `COALESCE(scope_*, <sentinel>)` and Postgres cannot infer a conflict target
from one.

**Tests run against real Postgres, not mocks**, and reset state with `DELETE`
rather than `TRUNCATE`. TRUNCATE forces an fsync per relation; across every table
before every test it took the suite from 16 seconds to over 25 minutes on Docker
Desktop. The test database also sets `synchronous_commit = off`, and bcrypt
drops to 4 rounds under `NODE_ENV=test`. Do not "fix" any of these back.

**Frontend stack: Material-UI, Redux Toolkit, Recharts, React Hook Form and
Zod** — chosen over a lighter Tailwind + Zustand alternative that was offered
as the recommendation. Built out in the web client session (section 2); build
on it rather than re-litigating the choice. The redesign session added
**Framer Motion** and three self-hosted Fontsource families inside that
stack rather than replacing any of it.

**MUI's `<TextField select>` needs an explicit controlled `value`, not just
react-hook-form's `register()`.** `register()` sets the underlying DOM input
uncontrolled, which is enough for a plain text input but not for MUI's
`Select`, which renders its displayed value from React props. Every select in
the web client passes both `{...register('field')}` and `value={watch('field')}`.
A placeholder option whose value is `''` (e.g. "Uncategorised") additionally
needs `SelectProps={{ displayEmpty: true }}` and
`InputLabelProps={{ shrink: true }}`, or it renders blank / with an overlapping
label. See section 2 for how this was found.

**CSV import is preview-then-commit, and never guesses silently.** A preview
parses the whole file and writes nothing; a commit inserts every kept row or
none. The three inferences that can corrupt a whole statement — direction
convention, decimal mark, date layout — are resolved by the server, echoed back
in the preview, and shown as editable controls; an unresolvable day-first /
month-first file sets `dateFormatAmbiguous` and the UI asks rather than picking.
Duplicates are flagged, never dropped. See section 2d and `docs/decisions.md`.

**File downloads go through the RTK Query base query, never through a link.**
Every export endpoint is authenticated, and a browser-initiated navigation
(`<a href>`, `window.open`) carries no `Authorization` header, so it earns a
401. `lib/download.ts` takes a body already fetched through `baseQueryWithReauth`
— which attaches the token and single-flights its refresh — and turns it into a
save. Non-JSON endpoints must also set `responseHandler: 'text'` on the query,
or `fetchBaseQuery` tries to parse CSV as JSON and fails first.

**Chart colours come from `lib/chartTokens.ts` and are validated, not chosen.**
Categorical slots are assigned in fixed order and never cycled; magnitude
comparisons use one flat hue; the four status steps are reserved for state and
always ship with an icon and a word beside them. The file documents the
validation results for slots 1–2 against this app's own light and dark
surfaces. A new chart reuses those slots rather than picking a hue. Since the
redesign the two categorical slots are *semantic* — slot 1 is the income green,
slot 2 the expense brick — which is the pair red-green colour blindness
collapses, so they are separated by a full lightness step rather than by hue
alone, on top of the legend and direct labelling that were already there.

**The interface is flat; typography and a hairline carry the hierarchy.** The
whole visual language, its palette, and the statement-line motif that
`components/LedgerRow.tsx` implements are described in section 2b and in
`docs/decisions.md` ("Visual redesign"). Three rules that constrain future work:
every figure in a list or table is set in `IBM Plex Mono` with `tabular-nums`
(use `variant="amount"` or `components/Amount.tsx`); a card gets a hairline, not
a shadow, unless it genuinely floats; and a colour is only added after checking
its contrast against the surface it actually renders on.
