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
340; see section 4 for the current command. The compiled `dist/server.js`
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
   resolved to a Kysely query builder. Builders were deliberately thenable and
   threw when awaited, so the async machinery detonated. **Never return a query
   builder from an `async` function** — wrap it in an object. Note that the
   *symptom* has changed since: Kysely 0.28 removed `preventAwait`, so awaiting
   a builder no longer throws — it resolves to the builder object. The rule
   stands; breaking it is now silent rather than loud.
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
  delete, and **reconciliation** (`ReconcileDialog`, opened from the card's
  overflow menu): a statement date and balance in, a verdict out, and the
  account's past reconciliations beneath. The card's menu is **no longer gated
  on `canEdit`** — reconciliation history is viewer-readable, so every role has
  at least one item in it and the writing items are gated individually.
  Per-account statement history beyond that list is still unbuilt.
- **Transactions** — filterable/searchable ledger with pagination, a
  create/edit dialog for income/expense rows, **transfers** (own dialog, with a
  destination-amount field that appears only across currencies), **tags**
  (manager dialog, assignment on the form, chips on each row, a filter in the
  bar), and a **detail drawer** carrying the row's tags, its **split** and its
  **comment thread**. The splits editor covers the server's three modes — even,
  weighted, and exact amounts that must add up to the total.
  **CSV import** is now built — see section 2d. So are the three actions that
  used to be listed here as unbuilt: **confirming** a scheduled row (a tick on
  the row itself), **bulk categorise** (a checkbox per row and a
  `BulkActionsBar` inside the ledger card, shown only while something is
  ticked), and **restoring** a deleted one — which needed an API change, since
  the list route had no way to return soft-deleted rows and therefore nothing
  could name the row to restore. A "Show deleted" switch in the filter bar sets
  `?includeDeleted=true`; a deleted row is struck through, keeps its column
  alignment, and offers restore and nothing else.
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

   **Amended later: that rule is now scoped to exclude fields**, because on a
   text box it was drawing a hard green *square* around a 14px-rounded control.
   An `outline` follows the element's own `border-radius`, and the native
   `<input>` inside a field has none — the radius belongs to the notched
   fieldset around it — so the ring could not follow the shape it was drawn
   against. Browsers also match `:focus-visible` on a text input for an ordinary
   mouse click, so it appeared on click and not only on tab. `theme.ts` now
   carries `.MuiOutlinedInput-input:focus-visible { outline: none !important }`
   and the focused field states itself with a 2px accent notch plus a soft halo,
   both of which do follow the radius. **Every other control keeps the ring** —
   verified by tabbing to a button and reading `outline: solid 2px`. If you add
   a control that suppresses the ring, it owes the user a replacement indicator.
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
3. **Add the key to all three catalogues, and check it resolves.**
   `npm run check:i18n` (also a CI step) does both halves:

   - **parity** — every key and every `{{placeholder}}` in `en.json` exists in
     `pt-BR.json` and `es.json`. A missing key falls back to English silently,
     and a translation that drops a placeholder loses a number, not just a word.
   - **resolution** — every literal `t('some.key')` in `src/` resolves against a
     catalogue. This is the failure parity structurally *cannot* see: a key
     missing from **all three** files is perfectly consistent, so parity passes,
     and i18next renders the key itself. That shipped — a bulk-action button
     read `common.apply` — and was only caught by a browser looking for the
     button by its accessible name. Keys built from a template literal or a
     variable are still on you.

**One namespace is not in these files.** `validation.*` lives in
`packages/schemas/src/translations.ts`, because the API rejects a field with the
very same key and the wording would otherwise be maintained in two catalogues.
Both i18n layers merge it in at init. Its completeness is enforced by the
compiler rather than by the script below (`Record<ValidationLocale,
Record<ValidationMessageName, string>>` will not build with a language missing),
and its placeholders are checked by `tests/unit/shared-schemas.test.ts`.

```bash
npm run check:i18n    # apps/web/scripts/check-i18n.mjs; also a CI step
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

## 2e. The entry layer: typing money, and the amount as the subject

A later session worked through a list of UI complaints from real use. Full
reasoning is in `docs/decisions.md` ("Money is typed the way it is read, and the
amount is the subject of the dialog"). The question it opened with was whether
to move the client to **shadcn/ui**; the answer was no, and the reasoning is
worth keeping because it will be asked again. Every complaint on the list traced to this repo's own code rather than to
a limit of MUI — a stalling colour input was a react-hook-form binding, four
English strings in a dialog were English in any component library, and the
focus square was one line of CSS. Swapping the primitive layer would have meant
rewriting 77 files and ~23,000 lines, re-deriving `theme.ts` as Tailwind
variables, and re-verifying nine working screens, and the nine defects would
still have been there afterwards. **The stack decision from session one stands;
do not reopen it on the strength of a rough edge that has a root cause.**

What the work actually added is an *entry* layer, because the design language of
section 2b applied to every figure the app **displays** and nothing it
**accepts**:

- **`lib/moneyInput.ts`** — pure string functions over a "digit string": the
  amount in the currency's minor unit, no separators. Keystrokes accumulate from
  the right the way a card terminal takes an amount, which is what makes the
  caret a non-problem (it is always at the end) and what lets one rule —
  *strip every non-digit from whatever the browser hands back* — cover typing,
  deleting and pasting a formatted amount alike. Nothing here is ever a
  `number`; the canonical form is built by splicing a `.` into the digits.
- **`components/MoneyField.tsx`** — a field that formats live, `1.500,00` in
  pt-BR and `1,500.00` in English, against the **currency in force at that call
  site**. It holds no state: the digit string is recovered from the canonical
  value each render, so reset, server errors and seeding an edit all just work.
  `allowNegative` adds a sign toggle for the two genuinely signed figures — an
  opening balance and a reconciled statement balance, whose schemas use
  `isMoneyText` rather than `isPositiveMoneyText`.
- **`components/AmountHero.tsx`** — the amount set in Fraunces at display size
  with the currency as an eyebrow above and a statement rule beneath, used by
  the transaction and transfer dialogs. The rule is also the focus indicator: it
  thickens and takes the accent, because boxing a deliberately borderless
  control would undo the point of it.
- **`components/ColorSwatchPicker.tsx`** — ten identity swatches on real
  `<input type="radio">` elements, replacing an `<input type="color">`.

**Decimal places come from the currency, never from a constant.** JPY has none
and KWD has three, so a hardcoded `2` invents centavos for a yen amount.
`currencyFractionDigits` asks `Intl` rather than keeping a table that would go
stale in silence.

**The Transactions filter bar reversed an earlier decision.** It used to hold all
nine controls in one grid, on the reasoning that a finance app's filters should
never be a click away; in use that read as spilled rather than arranged. It is
now search out in the open, everything else behind one counted button, and the
active filters spelled out beneath as removable chips — which is the half the old
bar could not do at all.

### Four traps, three of them found only by looking

1. **`slotProps.input` is not the `<input>`.** On a MUI `TextField` that slot is
   the `InputBase` *wrapper*, so `inputMode` set there lands on a `div` and a
   phone keyboard never hears about it; `aria-label` there names a wrapper and
   leaves the field unnamed. **HTML attributes go in `slotProps.htmlInput`**;
   `slotProps.input` is for `startAdornment` and friends. This shipped invisibly
   — it typechecks, and it looks right on a desktop.
2. **`#B23A2E` and `#b23a2e` are the same colour and different strings.** The
   swatch constants are upper case for legibility while `<input type="color">`
   and stored values come back lower case, so comparing them raw left **every**
   swatch unselected and classified each one as "custom". Compare colours with
   `sameColour`, never with `===`.
3. **A native colour input re-renders whatever owns its value.** Dragging in the
   OS wheel emits a continuous stream of `input` events; bound to a form field
   that meant re-rendering a fifteen-field dialog per event, which is the
   "freezing" that prompted the complaint. Any high-frequency control must
   absorb its own churn locally and tell the form once.
4. **`npm run check:i18n` cannot see a hardcoded English string.** It verifies
   that the keys a `t()` call names resolve — and a string that never calls
   `t()` names nothing. This sweep found ten of them across four dialogs,
   including a whole transfer-leg warning paragraph and every transaction status
   name, printed by upper-casing the enum member. **Grep for JSX text and
   string-literal props when touching a component**, because nothing in CI will
   tell you.

Verified by driving the real backend in Chrome, not by typechecking: 30 checks
across two passes covering the focus ring on fields *and* on buttons, live
formatting in both en-US and pt-BR against BRL, the sign toggle, the swatch
picker under rapid clicking, the archived fallback, the hero's tint and type
size, the filter panel and its chips, tag creation and deletion, and a saved
cross-currency transfer showing its implied rate. Traps 1 and 2 were both caught
that way after a clean `tsc`.

---

## 2f. A glass register for floating surfaces, a toast system, and sectioned dialogs

A later session was asked for a general "glassmorphism" pass. The request was
narrowed before any code was written: section 2b's flat, hairline statement
language is a deliberate choice, not a gap, so glass (blur, translucency,
layered shadow) went only onto surfaces that already float — dialogs,
menus, popovers, the transaction detail drawer — and cards, `LedgerRow`,
`Panel` and `StatTile` stayed exactly as documented. Full reasoning is in
`docs/decisions.md`, "Glass on floating surfaces, not on the flat language".

**What changed:**

- **`theme.ts`** gained a `palette.glass` token (`surface`, `border`, `shadow`,
  `backdropDim`, one set per colour scheme, same `color-mix()`-safe pattern as
  `focusGlow()`) and a shared `GLASS_EASE` decelerate curve wired into
  `theme.transitions`. `MuiBackdrop` now blurs the page behind a modal;
  `MuiDialog` (plus a `Grow` entrance), `MuiMenu` and `MuiPopover` all use the
  glass surface; `MuiTooltip` keeps a solid background on purpose — it is small
  and often sits over a coloured figure, where legibility beats consistency —
  but picked up the same layered shadow. **`MuiDrawer` was deliberately left
  flat**, because the permanent nav sidebar shares that override with the
  transaction detail drawer; the drawer gets its glass locally, via
  `PaperProps.sx` in `TransactionDetailDrawer.tsx`, not through the shared
  theme key.
- **`components/Toast.tsx`** (new) is a glass toast stack + `useToast()` hook,
  mounted once in `main.tsx`. It is now wired into the create/edit/delete flows
  on Accounts, Transactions, Transfers, Budgets and Goals — a success toast
  after each, an error toast on a delete that fails silently elsewhere (a
  create/edit failure already shows inline, so it does not also toast).
- **`components/FormSection.tsx`** (new) groups a dialog's fields under a small
  caps eyebrow label — the same treatment `StatTile` uses for "TOTAL BALANCE" —
  rather than a bordered sub-panel, because a second frame inside an already
  glass dialog paper would be one frame too many. Applied to every multi-field
  form dialog: `RecurringFormDialog` (Details / Classification / Recurrence /
  Automation), `TransactionFormDialog` (Details / Classification),
  `TransferFormDialog` (Details / Notes), `AccountFormDialog` (Details /
  Balance / Appearance), `GoalFormDialog` (Details / Target / Appearance), and
  `BudgetFormDialog` (Details / Category limits — the latter also picked up a
  translation key it had never had; the heading was a bare hardcoded string).
  Alongside the regrouping, `MuiOutlinedInput`'s radius dropped from 14 to 10 to
  read closer to a card's 12, and Recurring's day-of-month field now sits
  inline with "Repeats" only when the frequency is monthly, instead of
  standing alone at full width.

**One correctness bug found while testing the toast wiring, unrelated to any
of the above and far more serious:** `apps/web/src/api/endpoints/accounts.ts`
and `apps/web/src/api/endpoints/users.ts` both named an RTK Query mutation
`deleteAccount` on the same `injectEndpoints` — the same shared `api`
singleton. `injectEndpoints` silently keeps whichever of two identically-named
endpoints registers first and drops the other's `query` function, so which one
actually ran depended on unrelated module-load order. In practice, clicking
"Delete" on a financial account in `AccountsPage` fired
`DELETE /api/v1/users/me` — the GDPR erasure endpoint behind Settings → Data
→ "Delete my account" — while the UI reported success, because the request
genuinely *had* succeeded, just against the wrong resource. Caught only by
inspecting the network request the click produced; nothing about it was
visible in the DOM or the toast. Fixed by renaming the `users.ts` side to
`eraseMyAccount` / `useEraseMyAccountMutation`. **Never reuse an
`injectEndpoints` key across modules, even when the two are unrelated in every
other way — nothing enforces uniqueness across files, and the failure is
silent.**

---

## 2g. The phone is a first-class target

Most use of this app is expected to be on a phone, so a later session audited the
client at an iPhone-class viewport (390×844, touch, iOS UA) by driving the real
backend in Chrome. Full reasoning is in `docs/decisions.md` ("The phone is a
first-class target, and the pointer decides the target size").

**The structure already held up and was not changed**: no page-level horizontal
overflow on any of the nine screens or the login screen, the nav collapses to a
temporary drawer below `md`, every multi-column grid already used
`minmax(0, 1fr)`, charts are in `ResponsiveContainer`, and the transaction
detail drawer is already `width: 100%` on `xs`. Four things were wrong:

- **`theme.ts`'s input slot was 15px, which zooms iOS Safari in on focus and
  never zooms back out.** A `max-width: 599.95px` query raises the field and its
  label to 16px; the desktop step is unchanged. **Any new field that overrides
  its own font size owes itself the same floor** — this typechecks, looks right
  on a desktop, and no test in the suite can see it.
- **Settings' Members and Invitations tables were clipped, not scrollable.**
  They sit in a MUI `Card`, which clips overflow, and unlike the Reports tables
  they had no `overflowX: 'auto'` wrapper — so the Actions column was
  unreachable and an admin could not remove a member or revoke an invitation on
  a phone. **A page that does not overflow is not proof a table is readable:**
  the `Card` was absorbing the excess, so the document-width check passed.
  Any new `<Table>` needs the wrapper *and* a `minWidth` so the columns do not
  crush.
- **Touch targets go through `COARSE_TARGET` in `theme.ts`, keyed on
  `pointer: coarse` rather than on a width breakpoint** — the input device
  decides whether 30px is enough, not the viewport, so a touchscreen laptop gets
  the bigger targets and a narrow desktop window does not. It is spread into
  `MuiButton`, `MuiIconButton` and `MuiToggleButton`; `MuiListItemButton` takes
  the height half only. Eight of nine screens went from dozens of sub-44px
  controls to zero, with the desktop layout unchanged.
- **`LedgerRow`'s `xs` grid changed, because sizing the targets broke the
  content.** Three 44px glyphs run to ~110px, and taking that out of the middle
  of the folded row clipped descriptions to "Superm…". `body` now spans the
  actions column, the controls drop onto the second line beside the category,
  and the figure keeps its own line flush right. **The `md` template is
  untouched** — check both widths if you touch that grid.

**One i18n bug found the same way, unrelated to mobile.**
`StatementBudgets.tsx` rendered `{meta.label}` instead of `{t(meta.label)}`, so
Reports printed the literal key `budgets.status.warning` on screen. **`npm run
check:i18n` structurally cannot catch this** — it checks that the key a `t()`
call names resolves, and a key never passed to `t()` names nothing; the key is
valid and three other components render it correctly. Eight hardcoded English
strings in the two Settings tables went with it (`settings.member`,
`settings.joined`, `settings.you`, `settings.invitedBy`, `settings.expires` and
`common.actions` are new keys in all three catalogues).

**Not done, deliberately:** dialogs are still never `fullScreen` on `xs`. The
transaction dialog measures 326×780 in a 390×844 viewport and fits, but a real
iPhone's URL bar takes ~120px, so a long form scrolls to reach its submit
button. Making form dialogs full-screen below `sm` is the obvious next step and
was left out of scope rather than overlooked.

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
│   │   │   │   ├── migrations/      # 001..009, plus index.ts registry
│   │   │   │   ├── migrate.ts       # runner: up | down | status
│   │   │   │   ├── seed.ts          # demo dataset
│   │   │   │   ├── client.ts        # Kysely instance
│   │   │   │   └── types.ts         # generated-style DB types
│   │   │   ├── i18n/locales/        # en.json, pt-BR.json, es.json — server catalogue
│   │   │   ├── lib/                 # money, dates, recurrence, email, redis,
│   │   │   │                        # errors, http, logger, i18n,
│   │   │   │                        # csv (reader + writer, both directions),
│   │   │   │                        # route-metadata (stampRoute + mount: what
│   │   │   │                        #   the app records about its own shape)
│   │   │   ├── middleware/          # auth, validate, error handling, locale,
│   │   │   │                        # responds (declares + enforces a response shape),
│   │   │   │                        # rate-limit (the buckets, Redis and Express)
│   │   │   │                        #   + rate-limit-policy (the pure decisions:
│   │   │   │                        #   keys, trust-proxy parse, fallback budget)
│   │   │   ├── openapi/             # walk.ts (app -> routes), schema.ts (zod ->
│   │   │   │                        # JSON Schema), document.ts (-> the spec),
│   │   │   │                        # service-responses.ts (/health, /openapi.json)
│   │   │   ├── jobs/                # queues.ts, processors.ts
│   │   │   └── modules/             # one folder per domain, each routes.ts +
│   │   │                            # service.ts: accounts, activity, alerts,
│   │   │                            # analytics, auth, budgets, categories,
│   │   │                            # currencies, goals, imports, notifications,
│   │   │                            # recurring, reports, shared, tags,
│   │   │                            # transactions, users, workspaces
│   │   │                            # every module with routes also has
│   │   │                            # responses.ts (what it returns — see 5e);
│   │   │                            # imports also has mapping.ts: pure
│   │   │                            # column/date/sign inference; currencies
│   │   │                            # also has providers.ts: the live rate
│   │   │                            # feeds, with an injectable fetch
│   │   ├── Dockerfile               # the production image: one artifact, three
│   │   │                            # entrypoints (server, worker, migrate).
│   │   │                            # Build from the REPO ROOT — see 5g
│   │   ├── scripts/
│   │   │   ├── copy-assets.mjs      # build step: copies i18n/locales into dist
│   │   │   └── generate-openapi.ts  # writes docs/openapi.json; --check for CI
│   │   └── tests/
│   │       ├── unit/                # money, dates, recurrence, detectors, csv,
│   │       │                        # import-mapping, openapi, exchange-rates,
│   │       │                        # rate-limit-policy
│   │       └── integration/         # auth, workspaces, transactions, imports,
│   │                                # budgets-analytics, recurring-alerts,
│   │                                # currencies,
│   │                                # response-contracts (one success call per
│   │                                #   endpoint that declares a response schema)
│   └── web/                         # @finance/web — React client (Vite)
│       ├── index.html
│       ├── vite.config.ts
│       ├── scripts/
│       │   ├── generate-types.mjs   # docs/openapi.json -> src/api/schema.d.ts;
│       │   │                        #   --check for CI
│       │   └── check-i18n.mjs       # catalogue parity + every t() key resolves
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
│           │   ├── schema.d.ts      # GENERATED from docs/openapi.json; do not edit
│           │   ├── types.ts         # names for what is in schema.d.ts; no field lists
│           │   └── endpoints/       # one file per backend module: accounts.ts,
│           │                        # alerts.ts, analytics.ts, auth.ts,
│           │                        # budgets.ts, categories.ts, goals.ts,
│           │                        # imports.ts, notifications.ts, recurring.ts,
│           │                        # reports.ts, tags.ts, transactions.ts,
│           │                        # users.ts, workspaces.ts
│           ├── components/          # Amount, AmountHero, AppLayout, Brandmark,
│           │                        # ChartTooltip, ColorSwatchPicker,
│           │                        # ConfirmDialog, EmptyState,
│           │                        # ErrorState, LanguageMenu, LedgerList,
│           │                        # LedgerRow, MoneyField, NotificationsMenu,
│           │                        # PageHeader, Panel, SeriesLegend, StatTile,
│           │                        # UserMenu, navItems.ts
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
│                                     # moneyInput.ts (typing an amount: the
│                                     #   digit-string model behind MoneyField)
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
│   ├── api.md                       # endpoint reference: what each one is for
│   ├── openapi.json                 # GENERATED — `npm run generate:openapi`;
│   │                                # do not hand-edit, CI checks it. Requests
│   │                                # AND responses; the client's types come
│   │                                # out of this file
│   ├── decisions.md                 # decision log (see section 6)
│   └── finance_management_project_prompt.md   # original brief
├── infra/postgres/init/             # container init SQL
├── .github/workflows/ci.yml         # typecheck, builds, generated-file and
│                                    # i18n checks, unit tests, image build +
│                                    # boot; and the full suite on Postgres
├── .gitignore
├── .gitattributes                   # LF in the repo, native in the tree
├── .dockerignore                    # keeps node_modules and .env out of the
│                                    # build context
├── docker-compose.yml               # postgres, redis, mailhog; plus the `app`
│                                    # profile — migrate, api, worker (see 5g)
└── package.json                     # workspace root; also pins `vite` to
                                     # dedupe it — see "Environment quirks"
```

**API module convention:** every domain folder in `apps/api` is exactly
`routes.ts` (Express router, Zod validation, no business logic), `service.ts`
(all logic, owns its own SQL) and **`responses.ts`** (the Zod description of what
it returns — section 5e). Follow this when adding domains.
Three rules that a new module has to obey, all enforced by something that will
fail loudly rather than silently: **import Zod from `zod/v4`**, not `'zod'`,
**mount the router with `mount()`** from `lib/route-metadata.ts` rather than
`.use()` — the OpenAPI walker throws on a router whose path it cannot recover —
and **declare what each route returns with `responds()`**, which the test suite
then enforces against the real response.
Nothing else is needed for the new endpoints to appear in the specification;
the tag, the role, the security requirement and the 429 all follow from the
middleware already on the routes. Run `npm run generate:openapi` afterwards.

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

To run the **built** system instead of the dev servers — the same image the
deployment uses, with migrations gating startup — see section 5g:

```bash
docker compose --profile app up -d --build
```

| What | Where |
| --- | --- |
| API | http://localhost:4000 (`/health`, `/health/ready`, `/openapi.json`) |
| Web client | http://localhost:5173 |
| Postgres | localhost:5432, db `finance` / `finance_test`, user+pass `finance` |
| Redis | localhost:6379 |
| MailHog UI | http://localhost:8025 (SMTP on 1025) |

**Demo accounts** (after `npm run seed`): `ana@demo.local` and
`bruno@demo.local`, password `Demo1234567` for both.

### Tests

```bash
npm test                 # all 340 — needs Postgres, and only Postgres
npm run test:unit        # 194 pure units, no infrastructure at all
npm run check:i18n       # catalogue parity + every literal t() key resolves
npm run typecheck        # all three workspaces
npm run build:schemas    # @finance/schemas alone; the others depend on it
npm run build --workspace=@finance/api
npm run build --workspace=@finance/web
npm run generate:openapi # rewrite docs/openapi.json AND apps/web/src/api/schema.d.ts
npm run check:openapi    # fail if either is stale (this is the CI step)

npm audit --omit=dev --audit-level=high   # the CI gate: runtime deps only
npm audit                                 # everything, including dev tooling
```

**`npm run generate:openapi` after any route or response-schema change**, or CI
fails on the stale committed files — as will `tests/unit/openapi.test.ts`, which
compares the spec against a freshly built document. It writes **two** generated
files, in a chain: the API produces `docs/openapi.json` from the router it boots,
and the client produces `apps/web/src/api/schema.d.ts` from that. They are
regenerated by one command precisely so they cannot be regenerated apart.
Neither step needs a database — the script stubs the environment variables
`config/env.ts` demands, because generating walks the router and converts schemas
without opening a connection.

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
Two jobs run in parallel: **check** (the dependency-advisory gate, typecheck,
both builds, the OpenAPI freshness check, the i18n check, unit tests, and
building the production image and booting its module graph — no services) and
**test** (the full suite against a `postgres:16` service container, then a
migration rollback round-trip). Green on the first run, in about a minute.

**The advisory gate is deliberately narrow.** It fails on a high or critical
advisory in a **runtime** dependency (`npm audit --omit=dev --audit-level=high`)
and reports the rest without failing. A bare `npm audit` blocks unrelated pull
requests whenever a build tool publishes a dev-server advisory, and a gate that
blocks for reasons nobody accepts gets deleted. See section 5h.

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
2. **The nav items are links, not buttons.** `ListItemButton` is rendered with
   `component={Link}`, so each one matches `getByRole('link')` and **not**
   `getByRole('button')` — an earlier version of this note said the opposite and
   cost a run. Match the name exactly too: a loose regex like `/account/i` finds
   the sidebar entry before the "Add account" button and quietly navigates
   instead of opening the dialog.
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
  pinned to `^6.4.3`. npm then hoists vite 6 to the root, where
  `plugin-react` and `apps/web` both resolve it — the suite was 222-green
  before and after. **Do not remove `vite` from the root `package.json`
  thinking it is unused; it is there to force that dedupe.** Since the
  dependency-upgrade session (5h) the dedupe is total rather than partial:
  vitest 3 accepts `^6`, so it resolves the same root copy instead of nesting
  its own vite 5, and the tree now holds **exactly one vite**.

---

## 5. Next tasks, in priority order

**Everything numbered 1–10 is built.** The smaller gaps listed after the list
are features rather than operations work.

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
6. ~~**OpenAPI generation.**~~ **Done, both phases.** Phase 1 (section 5d)
   generates `docs/openapi.json` from the running app, serves it at
   `/openapi.json`, and checks it in CI. Phase 2 (section 5e) describes
   **104 of 104 operations**, every one of them checked against a real response
   by the test suite — and `apps/web/src/api/types.ts` is no longer
   hand-written: `openapi-typescript` turns the spec into
   `apps/web/src/api/schema.d.ts`, and `types.ts` only assigns names to what is
   in it. Doing it found one real bug (a recurring schedule's `categoryName` was
   never selected, so the Recurring screen had silently shown only the account
   name since the redesign) and one divergence (a category's `kind` has three
   members, not the two the client's types claimed).
7. ~~**CI**~~ **Done.** `.github/workflows/ci.yml` — see section 4. The
   `vite.config.ts` type error it would have tripped over was fixed rather than
   worked around, so the client's own `npm run build` is on the critical path.
   The repository was initialised, published and verified in the same session:
   **https://github.com/Capovillaa/finance-app** (public, `main`). The first
   push triggered the workflow and **both jobs passed in about a minute** —
   including the Postgres container coming up, `finance_test` being created
   from nothing, all 8 migrations applying and 222 tests passing. It is not a
   workflow that merely looks right; it has run.
8. ~~**Live exchange rates.**~~ **Done** (section 5f). `EXCHANGE_RATE_PROVIDER`
   now selects between the static table, **Frankfurter** (the ECB's daily
   reference rates, no API key) and **Open Exchange Rates** (a key, USD-quoted
   on the free plan). Verified against the real ECB feed, not only stubbed.
   No schema change was needed — the `exchange_rates` table's `source` column
   already distinguished a provider's rows from the static ones.
9. ~~**Rate-limit and auth hardening review.**~~ **Done** (section 5i). Three
   defects that shared one shape — the code said what it meant to do in a
   comment and did something else, invisibly. `X-Forwarded-For` was trusted
   with nothing in front of the process; the credential limiter's single
   `ip:email` key made IP rotation *easier*, not harder; and the global
   limiter had never once keyed per user. Plus the fallback this entry named:
   it now carries a divided budget, says when it engages, and engages in
   milliseconds rather than parking behind ioredis's offline queue.
10. ~~**Deployment story**~~ **Done** (section 5g). One image, three
    entrypoints — server, worker, migration runner — with `docker compose
    --profile app up -d` bringing them up in an order where the schema is
    current before anything serves traffic. CI now builds the image and boots
    its module graph, because nothing ever building it is exactly how the old
    Dockerfile came to be broken.

Not started, deliberately: any real payment or bank integration, and hosting
this anywhere — the image and the compose profile exist and run (section 5g),
but nothing is provisioned, and no registry, TLS or secret store is chosen. Smaller known gaps, none of them oversights: ~~**bulk categorise,
confirm and restore have no UI**~~ — **built**, see section 2. That entry used
to claim each was "one button", and only one of them was: bulk categorise needs
a selection model, and restore needed the list endpoint to be able to return
deleted rows at all. ~~**account reconciliation has no UI**~~ — **built**, see
section 2, though per-account statement history beyond the reconciliation list
still is not; the workspace settings screen cannot create a workspace (the
switcher does that); a revoked invitation cannot be re-sent, because the token
only ever exists in the email; CSV import reads files as UTF-8 only, and
supports no other statement format (OFX, QIF).

~~One real gap found while building the import dialog: `SplitsDialog.tsx` still
has four hardcoded English strings.~~ **Fixed**, along with a fifth found the
same way in `TransactionFiltersBar` (`"3 selected"`). `npm run check:i18n` now
fails on a hardcoded-key regression of that shape — see section 2c.

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

**The package is ESM-only, and the error it gives says something else.** There is
no `require` condition in its `exports` map, so resolving it from a CommonJS
context fails with `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined` —
which reads like a malformed `package.json` and is not. Both consumers are ESM,
so this never bites in the app; it bites a scratch script written outside a
`"type": "module"` package. Add `{"type":"module"}` next to the script rather
than a CJS build to the package.

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

## 5d. OpenAPI generation

**Phase 1 is built.** The design this was written from is kept below, annotated
with **[built as]** wherever the implementation diverged — it was followed
closely, and the two places it was wrong are worth reading before extending it.
Full reasoning as shipped is in `docs/decisions.md`, "The OpenAPI document is
generated from the app that boots, and only describes requests".

What exists now:

- **`npm run generate:openapi`** writes `docs/openapi.json` (104 operations
  across 78 paths). **`npm run check:openapi`** regenerates and exits 1 if the
  committed file differs — that is the CI step, in the `check` job.
- **`GET /openapi.json`** serves the same document, built from the live app on
  first request and cached. Verified byte-identical to the committed file
  against a running server.
- **`apps/api/src/openapi/`** is `walk.ts` (app → route records), `schema.ts`
  (Zod → JSON Schema), `document.ts` (route records → the document).
  **`apps/api/src/lib/route-metadata.ts`** holds `stampRoute` and `mount`.
- **`tests/unit/openapi.test.ts`** — 17 tests, no infrastructure.

**Four things to know before you touch it:**

1. **`apps/api` and `packages/schemas` are on `zod/v4` now**; `apps/web` is
   still on Zod 3. `z.toJSONSchema()` reads Zod 4's internals and throws
   `Cannot read properties of undefined (reading 'def')` on a v3 schema, so the
   migration was a prerequisite rather than the optional first step the design
   below assumed. **Import from `zod/v4` in anything under `apps/api`.**
2. **`@finance/schemas` declares `sideEffects: false`,** which is what keeps
   `fields.ts` — and the Zod 4 build it pulls in — out of the client bundle.
   Removing it silently adds ~40 kB of duplicate Zod to `apps/web`.
3. **A rule restated for the spec goes in `.meta()`, not in a real check.**
   Moving `MONEY_PATTERN` into a `z.string().regex(...)` looks equivalent and is
   not: inside a union it replaces the catalogue key with `"Invalid input"`
   unless the union carries an explicit `error`, and it makes the parser reject
   `" 12.50 "`, which `.refine(... .trim())` accepts today. Publishing a rule
   must not change what the API accepts.
4. **Every mount goes through `mount()`.** The walker throws on a router mounted
   with a bare `.use()`, because it cannot recover the path. Adding a new
   module means `mount(...)` in `routes.ts` and nothing else — the tag, the
   security requirement, the role and the 429 all follow from the code.

**Phase 2 — responses — is done; see section 5e**, which supersedes the
"responses are the expensive half" note in the design below. All 104 operations
describe what they return, and `apps/web/src/api/types.ts` is generated from
that rather than hand-written.

---

### The design it was built from

Everything asserted below was checked by running it against this repo, not
recalled — where a claim came from an experiment, it says so.

### The shape of the problem

The API's request rules are already machine-readable: they are Zod schemas, and
since the shared-schema package they are built from one set of declarations. What
is *not* machine-readable is the API's shape — which paths exist, what they
accept, who may call them. Today that lives in three places that agree only
because a human keeps them agreeing: the route files, `docs/api.md`, and
`apps/web/src/api/types.ts`, whose response interfaces are hand-written.

The goal is one generated document, produced from the code that actually runs, and
a client whose types come out of it.

### Use Zod's own JSON Schema output; no OpenAPI library

**The installed `zod` is 3.25.76, and it already ships Zod 4 at the `zod/v4`
subpath** — including `z.toJSONSchema()`. Verified by calling it. That matters
twice over, because **both third-party candidates now require Zod 4 as a peer
dependency** (`@asteasolutions/zod-to-openapi` 9.1.0, `zod-openapi` 6.0.1), so
"just add a library" is not the low-friction path it looks like: it means the Zod
4 migration either way, plus a dependency.

Going native means the migration and nothing else. Import from `zod/v4` in the
generator alone at first — the runtime schemas can stay on the v3 API until
there is a reason to move them.

**[built as]** — and this paragraph was **wrong**, which is the one thing in this
design that cost real time. `toJSONSchema` reads Zod 4's internal representation:
handed a schema built with the v3 API it throws `TypeError: Cannot read
properties of undefined (reading 'def')`. The original experiment must have been
run against a replica already written in `zod/v4`, which proved the function's
behaviour but not that it could read the app's own schemas. There is no
generator-only path; `apps/api` and `packages/schemas/src/fields.ts` moved to
`zod/v4` wholesale. It was cheap in the end — an import change in twenty-two
files plus `z.record(z.unknown())` needing a key type, `ZodTypeAny` becoming
`ZodType`, and `ZodError` having to come from the version that throws it — and
all 242 tests passed unchanged. `apps/web` stayed on Zod 3 (see the note about
`sideEffects` above).

**`{ io: 'input' }` is not optional, it is the whole trick.** An OpenAPI request
body describes what a caller *sends*, and the API's money fields end in
`.transform(money)`, so their output type is not their input type. Both were run
against a faithful replica of `moneySchema`:

| Call | Result |
| --- | --- |
| `z.toJSONSchema(body, { io: 'input' })` | correct — describes the accepted union |
| `z.toJSONSchema(body, { io: 'output' })` | **throws** `Transforms cannot be represented in JSON Schema` |

This is why `packages/schemas/src/fields.ts` keeps every transform out of the
shared fields and leaves `.transform(money)` to the API's own adapter. That was
done for a different reason and turns out to be exactly what makes the request
schemas describable.

### One thing to change first: `.refine()` is invisible to JSON Schema

A `.refine()` is an arbitrary predicate, so `toJSONSchema` drops it silently. Run
against the money field, the output is `anyOf: [string, number]` — with no
mention of the decimal format at all. A spec that omits the rule is worse than no
spec, because it looks authoritative.

**Before generating anything, move every rule that JSON Schema can express out of
`.refine()`.** `MONEY_PATTERN` and `DATE_ONLY_PATTERN` already live in
`packages/schemas/src/patterns.ts`; using them through `z.string().regex(...)`
instead of `.refine(isMoneyText)` puts them in the spec as a `pattern` and
changes nothing about what is accepted. What genuinely cannot be expressed —
"greater than zero" on a decimal *string*, the cross-field rules like
`fromAccountId !== toAccountId` — stays a `.refine()` and gets a prose
`description` instead. The unit tests in `tests/unit/shared-schemas.test.ts`
already pin the behaviour, so this refactor is safe to make: if a bound moves,
they fail.

**[built as]** metadata rather than a real `regex()`, because "changes nothing
about what is accepted" turned out to be false in two ways. A branch-level
`regex` inside `moneyField`'s union makes Zod report `"Invalid input"` instead of
the catalogue key, un-translating every rejected amount, unless the union is
given an explicit `{ error: 'validation.decimalAmount' }`. And the shipped parser
refines on `String(value).trim()`, so it accepts `" 12.50 "` — which a branch
regex rejects. Narrowing what the API accepts is not something a documentation
task gets to do quietly, so `dateField`, `moneyField` and `positiveMoneyField`
carry `.meta({ pattern, description })` and their parsers are byte-for-byte
unchanged. `.meta()` survives `.transform()`, `.optional()` and `.nullish()`,
which is what makes this work: routes compose `moneySchema`, never `moneyField`.

### Getting the routes out of the app, not out of a list

A spec needs (method, path, schemas, required role) per route. Three findings,
all from walking the real app:

1. **The app is walkable.** `app._router.stack`, recursed, yields **103 routes**.
   So the document can be generated from the app that actually boots, which is
   the only version that cannot drift. (That count was taken before this was
   built; it is 104 now, because `/openapi.json` is itself a route. Do not treat
   any number in this design section as current — the specification is.)
2. **Middleware are anonymous.** `validate(...)`, `requireEditor` and friends are
   arrow functions returned from factories; only `requireAuth` and
   `withWorkspace` survive with a `.name`. **You cannot identify a route's schema
   or its role by inspecting handler names.** The fix is one line in each
   factory: stamp what it knows onto the handler it returns
   (`handler.schemas = schemas` in `validate()`, `handler.role = 'editor'` in
   `requireEditor`), and have the walker read the stamps.
3. **Do not reverse-engineer the mount prefixes.** Reassembling a path from
   `layer.regexp` half-works — the structure comes out right and `:id` from
   `route.path` is clean, but the mounted-router parameter arrives as
   `/workspaces(?:/([^/]+?))/accounts` and unescaping that by hand is a
   heuristic waiting to break. There is no need: **every mount in this app is in
   one file.** `apps/api/src/routes.ts` holds all sixteen (five top-level, eleven
   workspace-scoped) and `app.ts` holds the `/api/v1` one. A `mount(prefix,
   router)` helper that records the literal string it was given costs seventeen
   edits in two adjacent files and yields exact paths with nothing inferred.

**[built as]** all three, with the stamps in a `WeakMap` (`lib/route-metadata.ts`)
rather than as properties on the handlers, so the running app is not carrying
documentation fields on objects Express also inspects. The rate limiters are
stamped too, which is why `/health` and `/openapi.json` correctly publish no 429.

**One trap the design did not see.** A mount's guard middleware cannot be
recognised by handler identity. `mount()` records what guards a router so the
walker does not also inherit it positionally — Express applies such a guard to
every *later* sibling under the same prefix — but `requireAuth` is a single
shared object that is *also* ordinary middleware inside `userRouter`,
`notificationRouter` and `workspaceRouter`. Keying the skip on identity dropped
authentication from those, and the generated document confidently published two
dozen authenticated routes as public. The walker matches guards by position
within one stack instead. **If you add a shared middleware as a mount guard,
check the public route list in the generated spec** — it is the fastest way to
see it. Exactly seven operations carry no security requirement: `/health`,
`/health/ready`, `/openapi.json`, and auth's `register`, `login`, `refresh` and
`logout`. Anything else appearing there is this bug coming back.

### Responses are the expensive half — do requests first

Requests have schemas. **Responses have none**: services return Kysely rows and
routes `res.json()` them, so there is nothing to convert. Describing them means
writing response schemas from scratch for every endpoint, which is a bigger job
than everything above combined.

Split it:

- **Phase 1 — requests, paths, security, errors.** Generates from what exists.
  Delivers a real spec, `docs/api.md` gets a generated companion, and the error
  envelope (already a fixed shape) is described once as a shared component.
- **Phase 2 — responses**, endpoint by endpoint, and only then does
  `apps/web/src/api/types.ts` get replaced by `openapi-typescript` output
  (7.13.0; it takes the spec and needs no Zod). **Until phase 2 lands, leave
  `api/types.ts` alone** — a half-generated types file where nobody can tell
  which half is which is worse than the honest hand-written one.
  **[built as]** exactly this, and `openapi-typescript` 7.13.0 was the right
  call. The one thing the split did not anticipate is that authoring a response
  schema is guesswork unless something checks it, so `responds()` enforces every
  declaration against the real body under test — see section 5e. `types.ts`
  survives as an alias layer over the generated `schema.d.ts` rather than being
  deleted, because the generated names are unusable at a call site; it holds no
  field lists, so the worry above does not apply.

### Serving and checking it

Write the document to a **committed file** (`docs/openapi.json`) from a
`generate:openapi` script, and serve that same file at `/openapi.json`. The
committed copy is what makes it reviewable: a pull request that changes an
endpoint shows the contract change in the diff.

**[built as]** the endpoint builds from the live app on first request and caches
the result, rather than reading the committed file off disk. It needs no
build-time copy into `dist/`, and what a caller reads is then guaranteed to be
what that process enforces rather than what someone last remembered to commit.
The committed file still exists for review and is what CI compares against, so
the two cannot diverge; they were checked byte-identical against a running
server.

Then **add a CI step that regenerates and fails if the result differs from the
committed file**, the same way the migration round-trip step earns its place —
it is the only thing that stops the spec from quietly rotting. It needs no
database, so it belongs in the `check` job.

### Tests

Unit-level, no infrastructure: the generator produces a document that parses as
OpenAPI 3.1; every one of the 103 routes appears exactly once; every path
parameter in a path string has a matching parameter object; a route behind
`requireEditor` carries the security requirement; and the money field's `pattern`
survives into the schema — that last one is the regression test for the
`.refine()` trap above.

**[built as]** all of those plus four worth keeping: every operation's `security`
is compared against the walker's own view (the check that would have caught the
mount-guard bug immediately), `operationId`s are unique and usable as
identifiers, a 429 appears only where a limiter is really mounted, and the
committed `docs/openapi.json` is compared against a freshly built document — so
a stale file fails the *test suite* too, not only CI. 17 tests in
`tests/unit/openapi.test.ts`. The route count assertion is written against
`walkRoutes()` rather than the literal 103, which is now 104 because
`/openapi.json` is itself a route.

The test file sets `DATABASE_URL` and the two JWT secrets before importing the
app, exactly as `scripts/generate-openapi.ts` does: generating touches no
database, but `config/env.ts` parses the environment at import time and CI's
`check` job has no Postgres to point at.

---

## 5e. OpenAPI phase 2 — response schemas, and the generated client types

**Done.** All **104 of 104 operations** describe what they return, every one is
exercised by a real call in the suite, and `apps/web/src/api/types.ts` no longer
describes a single structure by hand. Full reasoning is in `docs/decisions.md`
("Response schemas live beside the service, and the test suite proves them" and
"The client's response types are generated"). This is what you need in order to
extend it without breaking it.

### The chain

```
apps/api/src/modules/<domain>/responses.ts     Zod, authored beside the query
        ↓  responds({ 200: … }) on the route, enforced under NODE_ENV=test
docs/openapi.json                              npm run generate:openapi
        ↓  openapi-typescript
apps/web/src/api/schema.d.ts                   GENERATED — never edit
        ↓  aliases only, no field lists
apps/web/src/api/types.ts                      the names the app imports
```

`npm run generate:openapi` runs both generation steps; `npm run check:openapi`
regenerates both and fails on any difference, which is the CI step. **They are
one command on purpose** — regenerating the spec without the client types would
let the two drift.

### Where things live

| What | Where |
| --- | --- |
| A domain's response schemas | `modules/<domain>/responses.ts` — beside the query that builds it |
| Scalars and cross-module shapes | `modules/shared/responses.ts` — the response side of `shared/schemas.ts` |
| `/health`, `/health/ready`, `/openapi.json` | `openapi/service-responses.ts` — they belong to no module |
| The declaration + the runtime check | `middleware/responds.ts` |
| Zod → components conversion | `openapi/schema.ts`'s `toResponseJsonSchema` |

**Beside the service, deliberately, not in one `openapi/responses/` tree.** The
change that invalidates a response schema is a change to the `SELECT` above it;
keeping the two in one folder puts them in one diff. A central tree relies on
whoever edited the query remembering a parallel file exists, and that failure is
silent — the spec still generates and now describes last month's row.

### Adding or changing an endpoint

1. Write or extend `modules/<domain>/responses.ts`. Build fields from
   `shared/responses.ts` (`money`, `dateOnly`, `timestamp`, `uuid`, `integer`,
   `currencyCode`, `percent`, `jsonObject`, `dateRange`, `periodTotals`,
   `page(item)`), and wrap anything a caller has a *word* for in
   `component('Account', …)`.
2. Put `responds({ 200: theEnvelope })` on the route, between `validate()` and
   the handler. A 204 is `responds({ 204: NO_BODY })`; a CSV or file download is
   `responds({ 200: media('text/csv', '…') })`.
3. Make sure a test *succeeds* against it — see "reach" below.
4. `npm run generate:openapi`, then `npm test`.

A new name for the client goes in `apps/web/src/api/types.ts` as an alias:
`components['schemas'][…]` for a component, `Ok<'operationId'>` for an envelope
only one endpoint returns. **Never write a field list in that file.**

### The six rules

1. **A response schema describes the wire, not the row.** A `timestamp` column is
   a JS `Date` in the service and an ISO string in the response; the schema says
   string, and `responds()` checks it against `JSON.parse(JSON.stringify(body))`
   so the two cannot disagree. This is the response-side twin of the request
   side's `io: 'input'`.
2. **`responds()` is enforced under `NODE_ENV=test`.** It parses every outgoing
   body against the declaration and fails the request loudly on a mismatch — and
   also on a *success status the route does not declare*, which catches a handler
   that starts answering 200 where its declaration still says 201. Outside tests
   it is a `next()`.
3. **Reach matters as much as strictness.** A schema no test succeeds against is
   an assertion nobody made. `RESPONSE_REACH=1 npx vitest run 2>&1 | grep -o
   "REACH .*" | sort -u` lists every declaration the suite exercises; anything
   declared and missing from that list belongs in
   `tests/integration/response-contracts.test.ts`, which exists to close exactly
   that gap. It is currently 104/104.
4. **Name the concepts, not the packaging.** `Account` and `CategoryNode` are
   components; `{ account: Account }` is not. The scalars (`Money`, `Timestamp`,
   `DateOnly`, `Uuid`, `CurrencyCode`, `Integer`) are components too — an ISO
   instant compiles to a 300-character pattern and inlining it beside every
   `createdAt` in a hundred operations buries the document.
5. **`component()` composes; `.describe()` on one is safe.** Zod does not carry a
   component's `id` onto a derivative, so `money.describe('…')` emits prose beside
   the `$ref` and `timestamp.nullable()` an `anyOf` around it. What you must not
   do is name two different schemas the same thing — `component()` throws.
6. **A recursive schema must be named.** Zod emits `$ref: "#"` for a schema that
   is its own root, which points at the whole document; the converter throws
   rather than publish that. `component()` gives it somewhere to point.

### Traps already hit

- **Never compose a component with `.and()`.** A Zod intersection publishes as
  `allOf`, and the component branch carries `additionalProperties: false`, so a
  strict validator rejects every property contributed by the other branch. Use
  `.extend()`, which inlines the fields and drops the id — `periodTotals.extend({
  range: dateRange })` in `analytics/responses.ts` is the reference case.
- **Zod's metadata registry is a process-wide singleton that refuses a repeated
  id, and it outlives a source module.** `vitest` with `pool: forks, singleFork`
  re-evaluates `src/` per test file while `node_modules` stays cached, so the six
  test files that import the app registered `Money` six times and the second
  threw `ID Money already exists in the registry`. `component()` evicts the stale
  registration; the guard that matters is its own `Set`, reset by the same
  re-evaluation. **Do not "simplify" that eviction away.**
- **`GET /categories` really returns two shapes**, so it is published as a union
  of the two envelopes rather than as one with an optional `children`. A caller
  picks the branch its `?shape=` asked for.
- **Some fields are legitimately optional because a join supplies them.**
  `Transaction.accountName`, `RecurringTransaction.categoryName` and
  `Tag.usageCount` are present on the list and detail queries and absent from
  create and update, which use `returningAll()` on one table. The schemas say
  `.optional()` and mean it.

### What describing them found

Both are the payoff, and both were invisible to a typecheck before:

1. **`RecurringTransaction.categoryName` was never selected.** `RecurringRow.tsx`
   renders `accountName · categoryName`, the hand-written client type claimed the
   field existed, and the API had never joined it — so every schedule had shown
   only its account name since the redesign. The join was added beside the
   `accountName` one it should always have sat next to, and the row now reads
   `Checking · Alimentação` in a real browser.
2. **A category's `kind` has three members**, not two: `transfer` is reachable and
   the client's `CategoryKind` had said otherwise.

---

## 5f. Live exchange rates

Task 8, built in a later session. Full reasoning is in `docs/decisions.md`,
"Live exchange rates: one provider interface, and a fallback that cannot do
harm". What you need in order not to break it:

**`EXCHANGE_RATE_PROVIDER` picks one of three**, and `static` is still the
default, so a checkout with no network behaves exactly as it did before:

| Value | What it is | Needs |
| --- | --- | --- |
| `static` | seven indicative BRL pairs hardcoded in `service.ts` | nothing |
| `frankfurter` | the ECB's daily reference rates, republished | nothing |
| `openexchangerates` | commercial, USD-quoted on the free plan | `EXCHANGE_RATE_API_KEY` |

**`modules/currencies/providers.ts` imports neither `config/env` nor
`db/client`.** That is what lets its eighteen tests run in the unit lane with no
infrastructure at all: `fetch` is injectable (`ProviderOptions.fetchImpl`), and
everything else in the file is pure. The service decides *which* provider to
build and from what configuration; the provider only knows how to talk to one.
**Keep it that way** — the moment it reads `env`, the test file needs the same
environment stubbing `tests/unit/openapi.test.ts` has to do.

**Adding a provider** is: a payload schema, a `fetchLatest` that normalises into
a `RateQuote` (base, date, rates as decimal *strings*), a case in
`createRateProvider`, and the name in `LIVE_PROVIDERS` **and** in `env.ts`'s
enum. Nothing else — `rebase()`, the filtering, the upsert and the fallback are
all shared.

Five things that are deliberate, in rough order of how expensive they'd be to
rediscover:

1. **A row carries the provider's date, not today's.** The ECB publishes on
   business days, so a Sunday refresh rewrites Friday's row rather than
   inventing a Sunday one. Do not "fix" this to `today()` — it is the whole
   reason a historical conversion is genuinely historical.
2. **A failed live refresh never falls back to the static table** unless there
   are no rates on record at all. `getRate` already resolves the most recent
   rate at or before the date it is asked about, so a missed day costs
   freshness and nothing else; overwriting a real rate with an indicative one
   every time the network hiccups would cost correctness.
3. **Only currencies in the `currencies` table are stored.** `exchange_rates`
   has foreign keys into it, and one unknown code fails the whole insert. This
   is why ARS keeps its static rate under `frankfurter` — it is not an ECB
   currency — which is correct, not a gap.
4. **Rates become strings the moment they arrive** and are never a `number`
   again, following the same rule money does. `rebase()` divides through
   `Decimal`.
5. **An error message may not carry the API key.** Open Exchange Rates
   authenticates with `app_id` in the query string, so failures print the
   origin and path only, and there is a test asserting the key does not appear.

**A `.env` variable that exists but is empty is `''`, not `undefined`, and `??`
will not save you.** `EXCHANGE_RATE_API_URL=` in `.env.example` turned
`${endpoint}/latest` into `/latest` and `new URL` threw before a request was
ever made. `env.ts` now normalises a blank optional string to `undefined` via
`blankAsUndefined`; use it for any new optional string read from the
environment.

**Verified against the real ECB feed**, not only against a stub: six pairs
landed in the development database, and `getRate` then answered BRL→USD
directly, USD→BRL by inversion and USD→EUR by crossing through BRL. To repeat
it, set `EXCHANGE_RATE_PROVIDER=frankfurter` and call `refreshRates()` — it is
a dozen lines of scratch script and needs no key.

---

## 5g. Deployment: one image, three entrypoints

Task 10. Full reasoning is in `docs/decisions.md`, "One image, three
entrypoints, and a migration that gates the rollout". What you need in order not
to break it:

```bash
docker compose --profile app up -d --build   # migrate, then api + worker
docker compose --profile app logs -f api
docker compose --profile app down
```

**`apps/api/Dockerfile` builds from the repository root**, never from its own
directory — the API depends on the `@finance/schemas` workspace, so the context
has to contain both packages. The old file copied only `apps/api` and could
neither install nor compile; it had been broken for several sessions because
nothing ever built it.

**The `app` compose profile is the deployed shape**: `migrate` runs to
completion, then `api` and `worker` start behind
`depends_on: service_completed_successfully`. A failed migration stops the
rollout instead of leaving a new binary talking to an old schema.

Five things that will bite, all of them found by building and running rather
than by reading:

1. **`npm ci --ignore-scripts` does not stop a linked workspace's `prepare`.**
   `@finance/schemas` compiles itself that way, so a stage holding only its
   `package.json` fails with `TS5058: The specified path does not exist:
   'tsconfig.json'`. The build copies the package whole and lets `prepare` do
   its job; production deps come from `npm prune --omit=dev` afterwards rather
   than from a second `npm ci`, which would hit the same wall with no compiler
   installed.
2. **`--workspace` scopes which scripts run, not what gets installed.** With
   `apps/web/package.json` in the context, npm installed the client's tree too
   and `prune` kept it — MUI, Recharts, Framer Motion and 58 MB of icon fonts
   inside the API image. Leaving that manifest out of the build context is what
   drops it. Do not "tidy up" by copying all the manifests for symmetry.
3. **Copy the per-workspace `node_modules`, not just the root one.** npm hoists
   what it can and nests what it cannot; it nested `i18next` under
   `apps/api/node_modules`. The image built, every file-existence check passed,
   and the container died on boot with `ERR_MODULE_NOT_FOUND`.
4. **`env_file` beats the image's `ENV`.** `.env` is a development file, so the
   compose services set `NODE_ENV: production` in `environment:` (which beats
   `env_file`) — otherwise a production container runs as `development` and asks
   pino for the `pino-pretty` transport that a pruned image does not contain.
   `lib/logger.ts` now resolves that transport defensively too, because failing
   at import means dying before there is a logger to say why.
5. **Debian slim, not alpine**, for the same reason `docker-compose.yml` pins
   Debian Postgres: a musl image cannot exec its own `/bin/sh` under this
   machine's Docker Desktop/WSL2 setup.

**CI builds the image and boots its module graph.** `docker run … node -e
"await import('/app/apps/api/dist/app.js')"` pulls in every route, service and
library without opening a socket, which is exactly the check that catches a
missing dependency an existence test would miss.

---

## 5h. Clearing the dependency advisories

`npm audit` reported **nine advisories — 1 critical, 3 high, 5 moderate** across
four root packages. All nine are gone; the tree audits clean including dev
dependencies. Full reasoning is in `docs/decisions.md` ("Dependency advisories
are fixed by upgrading, and the gate is on what ships"). What you need here:

| Package | Was | Now | Ships? |
| --- | --- | --- | --- |
| `kysely` | 0.27.6 | **0.29.5** | yes — API runtime |
| `nodemailer` | 6.10.1 | **9.0.5** | yes — API runtime |
| `react-router-dom` | 6.30.4 | **7.18.2** | yes — client bundle |
| `vitest` | 2.1.9 | **3.2.7** | no — dev only |

**`npm audit fix` fixes none of them.** Verified by running it: it reports no
changes and the same nine findings. Every one needed an explicit major bump, so
do not expect the automated path to help here or next time.

Five things to know before touching any of this:

1. **Kysely 0.29 moved the migration API to `kysely/migration`.** `Migrator`,
   `Migration` and `MigrationProvider` now import from the subpath; the root
   export resolves to a `KyselyTypeError` telling you so at compile time.
   `db/migrate.ts` and `db/migrations/index.ts` are the two files affected.
2. **Kysely 0.28 removed `preventAwait`**, so awaiting a query builder no longer
   throws — it resolves to the builder object. See the amended bug 2 in section
   1: the rule is unchanged, the failure is now silent.
3. **`vitest` stopped at 3.2.7 on purpose, and 4.x is a separate decision.**
   Vitest 4 removes `poolOptions` and maps `singleFork` onto `maxWorkers: 1,
   isolate: false` — which is *not* what `singleFork` meant. `singleFork` keeps
   re-evaluating the module graph per test file, and `component()` in
   `openapi/schema.ts` is written around exactly that (see section 5e's registry
   trap). Moving to vitest 4 means reasoning about that first.
4. **The vite tree is now a single copy.** vitest 3 accepts `^6` and resolves the
   root `vite` 6.4.3 rather than nesting its own vite 5. The root `vite` pin
   matters more than before, not less — see "Environment quirks".
5. **`react-router-dom` 7 needed no source change.** Every import the client uses
   is API-identical in v7. There was no in-major fix to take: 6.30.4 is the
   newest v6 on the registry and the open redirect is fixed in 7.18.0.

**Two of the four upgrades are invisible to `npm test`, so neither was trusted
to it.** `sendEmail` short-circuits under `NODE_ENV=test` and never builds a
transporter, so nodemailer was verified by delivering a real invitation through
the compiled `dist/lib/email.js` into MailHog and reading it back out of
MailHog's API. React Router has no tests at all, so it was driven in Chrome —
signed-out redirect, all eight sidebar routes, history back/forward, a signed-in
deep-link reload and the unknown-path catch-all, 15 checks green. Kysely is the
one the suite does cover well: 320 tests of real SQL, plus a migration
up/down/status round-trip, since `Migrator` is the piece that moved.

**The CI gate added with this work fails only on high-or-critical advisories in
runtime dependencies.** Dev-tool findings are reported and do not block. The
reasoning is under "CI" in section 4.

---

## 5i. Rate-limit and auth hardening

Task 9, built in a later session. Full reasoning is in `docs/decisions.md` —
"Rate limiting is two-dimensional, and a forwarded header is only trusted when
something sends it" and "'Sign out everywhere' now means everywhere, via one
nullable column". What you need in order not to undo it:

**`TRUST_PROXY` defaults to `false`, and that is deliberate.** `req.ip` comes
out of `X-Forwarded-For`, which the *client* sends. The old code set
`trust proxy: 1` unconditionally under a comment claiming every deployment sits
behind a reverse proxy; this repo's own compose profile publishes the API
straight onto a host port. Measured before the fix: six credential attempts from
six invented addresses, all allowed, against a limit of three. **A deployment
that really is behind a proxy has to say so** — `TRUST_PROXY=1` for one hop, or
`loopback`, or a list of subnets. Setting it when nothing is in front reopens
the hole.

**Every request is charged to two budgets, and both are load-bearing:**

| Limiter | Buckets | Default |
| --- | --- | --- |
| `globalRateLimit` (all of `/api/v1`) | the address, and the user if the bearer token verifies | 1200/min, 300/min |
| `authRateLimit` (register, login, change-password) | the address, and the account named in the body | 10/min, 20/15min |

Four rules behind that table, in rough order of how expensive they'd be to
rediscover:

1. **`globalRateLimit` verifies the bearer token itself.** It is mounted on
   `/api/v1`, above every `requireAuth` in the app, so `req.user` is *always*
   `undefined` there — the old key expression `req.user?.id ?? req.ip` had been
   a pure IP limiter for its whole life and nothing could have shown you. Do not
   "simplify" it back to reading `req.user`. A token that fails verification is
   charged to its address, because otherwise a stream of forged tokens would
   mint a fresh budget per request.
2. **The credential limiter's two buckets must stay separate.** A single
   `ip:email` key is not two dimensions, it is *weaker* than either alone: a new
   address is a new key, so rotating addresses hands back the whole budget
   against the same account. The per-account bucket has its own, much longer
   window for exactly that reason.
3. **The fallback budget is divided by `RATE_LIMIT_INSTANCES`.** Falling back to
   an in-process counter when Redis is down is right; falling back to the *full*
   budget on every replica means N instances allowing N times the advertised
   limit at the worst possible moment. It also logs, once a minute, that it is
   running degraded.
4. **`enableOfflineQueue: false` on the shared Redis client is not a style
   choice.** With ioredis's offline queue on, a command issued during an outage
   is parked until the connection returns — the first request after Redis
   stopped hung for over two minutes behind the reconnect backoff instead of
   being served by the fallback that exists for it. Everything using that client
   (the cache, the limiter) has an answer for "Redis said no" and none has one
   for "Redis has not answered yet". **BullMQ's connection keeps the queue** and
   must, because it issues blocking commands across reconnects.

**Credential endpoints fail closed; everything else fails open.** A store error
used to call `next()` everywhere, which on `/auth/login` means unlimited password
guesses for the length of an incident. The refusal is a 429 rather than a 503 on
purpose — the client's correct behaviour is identical, the endpoint already
publishes 429, and which of the two happened belongs in a log line.

**`users.tokens_valid_from` (migration `009`) makes revocation reach the access
token.** Revoking refresh tokens ends a session's ability to renew and does
nothing to the JWT already issued, so "sign out everywhere" quietly meant "in
about fifteen minutes". `requireAuth` already reads the user's row to check the
account is active, so the check rides along on a query that was happening
anyway — no revocation list, no shared denylist cache. NULL means nothing has
been revoked.

**The access token carries `iatMs`, and the comparison depends on it.** A JWT's
`iat` counts whole seconds, which cannot distinguish "issued just before the
revocation" from "issued just after" — so a second-granular cut-off either lets
a stale token survive or rejects the replacement the user just signed in for.
Both are wrong and the choice is false. `tests/integration/auth.test.ts` has a
case asserting a user can sign back in **in the same second** they signed out of
everything; if you touch this, that is the test that will tell you.

**Two smaller fixes in the same pass.** CORS reflected any origin with
credentials whenever `NODE_ENV` was not literally `production` — which included
staging and preview deployments — and is now an explicit list (`CORS_ORIGINS`,
defaulting to `WEB_BASE_URL`) everywhere except development. And the refresh
cookie's `maxAge` was hardcoded to thirty days while the token's real lifetime
comes from `REFRESH_TOKEN_TTL_DAYS`.

`apps/api/src/middleware/rate-limit-policy.ts` holds the pure half — key
derivation, the trust-proxy parse, the fallback division — and imports neither
`config/env` nor Redis nor Express, which is what lets `tests/unit/
rate-limit-policy.test.ts` run in the unit lane. Same rule as
`modules/currencies/providers.ts`; **keep it that way.**

### Verified by driving it, not by reading it

None of this is visible to the test suite: under `NODE_ENV=test` the limiter is
`RateLimiterMemory` with a thousand times the budget, precisely so unrelated
cases do not trip each other. So the runtime behaviour was checked against real
instances with small budgets and real Redis:

- rate-limit headers present, and reporting the *tighter* of the two budgets —
  `x-ratelimit-limit: 1200` anonymous, `300` with a bearer token, which is the
  per-user bucket doing something for the first time;
- eight attempts on one account from eight different addresses, cut off at the
  fifth, with a second account from those same addresses untouched;
- with `TRUST_PROXY=false`, five attempts from five *claimed* addresses cut off
  at the third — and the same run against a trusted-proxy instance allowed all
  six, which is what the old unconditional setting shipped;
- Redis stopped mid-run: budget dropped to ⌊6/3⌋ = 2 as configured, requests
  answered in ~3 ms, the degradation logged, `/health/ready` reporting
  `{"redis":"down"}` in 4 ms.

---

## 6. Architectural decisions

The full log with reasoning lives in `docs/decisions.md`. The ones that most
constrain future work:

**Money is `NUMERIC(19,4)` in Postgres and `Decimal`/string in TypeScript.**
Never `number`. `lib/money.ts` owns all arithmetic and rounds half-even. Amounts
cross the API as strings. Every transaction also stores a `base_amount` in the
workspace's base currency, converted at write time, so analytics never has to
join rates at read time.

**Exchange rates come from a provider behind one interface, and a failed
refresh changes nothing.** `EXCHANGE_RATE_PROVIDER` selects the static table
(the default), Frankfurter or Open Exchange Rates; `modules/currencies/
providers.ts` normalises whichever answers into one shape and `rebase()`
re-expresses it against the configured base currency, dropping any code the
`currencies` table does not know. A row is stamped with the **provider's** date,
so a transaction still converts at the rate that applied on its own day. A
provider that cannot be reached is logged and skipped rather than papered over
with indicative values — the static table is only written when there are no
rates at all. See section 5f and `docs/decisions.md`.

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

**The OpenAPI document is generated from the running app.** `docs/openapi.json`
comes out of `apps/api/src/openapi/`, which walks the Express router rather than
reading a list, so it cannot drift from the code; CI fails if the committed copy
is stale. Two constraints follow for future work: **`apps/api` is on `zod/v4`**
(v3 schemas cannot be converted at all), and **a rule restated for the spec goes
in `.meta()`**, never in a real check, so that documenting a rule cannot change
which requests the API accepts. See section 5d and `docs/decisions.md`.

**Response schemas are authored beside the service, and enforced by the tests.**
Handlers return database rows, so unlike requests there was nothing to convert —
each shape is written by hand in `modules/<domain>/responses.ts` and declared on
the route with `responds()`. That declaration is not documentation only: under
`NODE_ENV=test` every outgoing body is parsed against it and a mismatch fails the
request, which is the only reason to trust a hand-authored schema. A schema
describes the **wire** (an ISO string), not the row (a `Date`). All 104
operations are described and all 104 are reached by a passing test, so
**`apps/web/src/api/types.ts` is now generated**: `openapi-typescript` writes
`apps/web/src/api/schema.d.ts` from the spec and `types.ts` only assigns names to
what is in it — never a field list. See section 5e and `docs/decisions.md`.

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
the bug in section 1 — the revocation must outlive the rejection. Revocation
reaches the access token too, through `users.tokens_valid_from` (migration
`009`) checked on the user row `requireAuth` already loads, so "sign out
everywhere" is immediate rather than "within fifteen minutes". The token carries
a millisecond `iatMs` claim because a JWT's whole-second `iat` cannot tell a
token issued just before a revocation from one issued just after — which would
make either the stale token or the user's fresh sign-in wrong. See section 5i.

**A rate limit is only as real as `req.ip`, and `req.ip` comes from a header the
client sends.** `TRUST_PROXY` defaults to trusting nothing; a deployment behind
a proxy says so. Every request is charged to two budgets rather than one — the
address and the signed-in user, and on credential endpoints the address and the
*account*, independently, because a single combined `ip:email` key made rotating
addresses reset the account's budget instead of exhausting it. Losing Redis
falls back to a per-process counter carrying `1/RATE_LIMIT_INSTANCES` of the
budget, logs that it has, and answers immediately (the shared Redis client
disables ioredis's offline queue, without which the fallback waits out the
reconnect backoff). Credential endpoints fail closed, everything else fails
open. See section 5i and `docs/decisions.md`.

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

**The API, the worker and the migration runner are one image with three
commands, and the migration gates the rollout.** They are the same codebase, so
they ship as one artifact; `docker compose --profile app up -d` runs `migrate`
to completion and starts the other two behind
`service_completed_successfully`, which means a failed migration stops the
deploy rather than leaving a new binary on an old schema. The image is built
from the **repository root**, because the API depends on the `@finance/schemas`
workspace — the old Dockerfile copied only `apps/api` and had been unbuildable
for several sessions, unnoticed, because nothing ever built it. CI now does,
and boots the compiled app's module graph afterwards. See section 5g and
`docs/decisions.md`.

**A dependency advisory is fixed by upgrading, not by arguing it is
unreachable.** Three of the Kysely advisories genuinely are unreachable from
this codebase — no `sql.lit`, no JSON-path helpers, no `Kysely<any>`, and
Postgres rather than MySQL — but that is an argument someone has to re-make by
hand every time the query layer changes. All nine findings were cleared by
version bumps instead (section 5h). What CI gates on afterwards is narrower than
`npm audit`: high-or-critical in a **runtime** dependency, because a gate that
blocks a pull request over a build tool's dev-server advisory is a gate that
gets deleted. See `docs/decisions.md`.

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

**Money is typed the way it is read, and an amount is entered as the subject of
its dialog.** Every figure the app displays is grouped, pointed and set in
tabular mono; until section 2e that stopped at the boundary of a text box, where
an amount was typed as `1500` into a field the same size as "Merchant".
`lib/moneyInput.ts` models an in-progress amount as a digit string in the
currency's minor unit, so keystrokes accumulate from the right, the caret is
never a problem, and no value on the path is a `number`; the decimal places come
from `Intl` per currency rather than from a constant. `components/MoneyField.tsx`
and `components/AmountHero.tsx` are the two ways to accept one, and **no form
should bind a raw `TextField` to a money field any more.** The stack question
this work opened with — a move to shadcn/ui — was answered no: every defect on
the list had a root cause in this repo, and none would have survived the
migration that was meant to fix them. See section 2e and `docs/decisions.md`.

**The interface is flat; typography and a hairline carry the hierarchy.** The
whole visual language, its palette, and the statement-line motif that
`components/LedgerRow.tsx` implements are described in section 2b and in
`docs/decisions.md` ("Visual redesign"). Three rules that constrain future work:
every figure in a list or table is set in `IBM Plex Mono` with `tabular-nums`
(use `variant="amount"` or `components/Amount.tsx`); a card gets a hairline, not
a shadow, unless it genuinely floats; and a colour is only added after checking
its contrast against the surface it actually renders on.

**The phone is a first-class target, and the pointer decides the target size.**
The client was audited at 390×844 against the real backend: the responsive
structure held (no page overflow anywhere, drawer nav, `minmax(0, 1fr)` grids,
responsive charts), but every field zoomed iOS Safari in at 15px, two Settings
tables were clipped inside a `Card` rather than scrollable, and the row action
glyphs were half the size a thumb needs. Touch minimums are scoped to
`pointer: coarse`, never to a width breakpoint, because the input device is what
decides — and when the 44px minimum collided with the description in a folded
`LedgerRow`, the grid gave way rather than either the target or the content. See
section 2g and `docs/decisions.md`.

**Glass belongs only to what already floats.** A later pass gave dialogs,
menus, popovers and the transaction detail drawer a translucent, blurred
`palette.glass` surface (`theme.ts`) — never cards, `LedgerRow` or `Panel`,
which stay exactly as flat as the paragraph above says. The permanent nav
`Drawer` is themed flat too, on purpose, since it shares its theme key with the
floating one; the floating drawer's glass is applied locally instead. See
section 2f and `docs/decisions.md` ("Glass on floating surfaces, not on the
flat language").
