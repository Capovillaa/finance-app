# Decision log

Why the non-obvious choices were made, so the next person does not have to re-derive them.

---

### Money is `NUMERIC(19,4)` and decimal strings, never a JS number

Floats cannot represent `0.1`. Summing a year of transactions in IEEE-754 drifts, and in a
financial ledger a drifting total is a defect. `NUMERIC` in Postgres, decimal strings across the
wire and in memory, `decimal.js` for arithmetic. node-postgres's default string parser for
`NUMERIC` is deliberately kept.

**Cost:** you cannot use `+` on amounts. The helpers in `src/lib/money.ts` are mandatory.

---

### Transactions store a signed amount, with the sign constrained to match the type

`amount` is negative for expenses, positive for income, and a CHECK constraint enforces the
agreement. Every aggregation becomes a plain `SUM` instead of a `CASE` over `type`, and a
mislabelled row cannot silently corrupt income/expense reporting.

The API still accepts a positive magnitude plus a type — the conversion happens in exactly one
function (`signedAmount`), so the constraint never actually fires in practice.

---

### Transfers are two linked rows, not one row with two accounts

A single-row transfer forces every balance query to branch on "am I the source or the
destination?". Two legs sharing a `transfer_group_id` keep each account's balance a simple `SUM`,
and let a cross-currency transfer record a genuinely different amount on each side. Deleting one
leg deletes both.

---

### Account balances are trigger-maintained, not computed on read

The spec targets millions of transactions. `SUM` per account per dashboard load does not hold up.
The trigger runs inside the same transaction as the write, so the cached balance cannot drift the
way an application-maintained counter would.

**Cost:** balance logic lives in SQL. It is in `004_transactions.ts` and covered by tests that
assert the balance after create, edit, delete, restore, transfer and opening-balance change.

---

### Calendar dates are strings, never `Date`

`occurred_on` is a calendar date, not an instant. Parsing `2026-01-01` into a `Date` yields local
midnight, which in São Paulo is `2025-12-31T03:00Z` — the transaction moves to the previous day.
`src/lib/dates.ts` does pure calendar arithmetic on `YYYY-MM-DD` strings, and a custom
node-postgres parser stops the driver converting them.

---

### Kysely rather than Prisma or a hand-rolled repository

The heavy lifting here is analytical SQL: recursive category roll-ups, dense generated series,
window functions. Kysely gives full type safety over handwritten SQL and drops to raw `sql` where
the query is genuinely beyond a builder, with no separate schema language or generated client.

**Watch out:** Kysely's `Generated<S>` expands to `ColumnType<S, S | undefined, S>` and does *not*
unwrap a nested `ColumnType`, so `Generated<Timestamp>` selects as the wrapper rather than `Date`.
`src/db/types.ts` defines `GeneratedTimestamp` and `GeneratedNumeric` instead.

---

### Migrations are registered statically, not discovered from disk

Kysely's `FileMigrationProvider` reads the filesystem, which means one path in `tsx` development
and another in compiled `dist`. `src/db/migrations/index.ts` imports them explicitly, so the same
list works everywhere and a missing migration is a compile error rather than a silent no-op.

---

### Refresh tokens are opaque and stored hashed; access tokens are JWTs

A self-contained refresh token cannot be revoked before it expires. Refresh tokens are random
strings persisted only as HMAC hashes, rotated on every use. Presenting an already-rotated token
means it was captured, so the whole token family is revoked. Access tokens stay short-lived JWTs,
but `requireAuth` still loads the user, so suspension takes effect immediately.

---

### Non-members get 403 and archived-workspace access is refused outright

Distinguishing "does not exist" from "not yours" leaks which workspace ids are real. Both paths
return the same failure.

---

### Budgets have lines; spending is measured in the base currency

The spec models a budget as one category and one limit. Real budgets cover several categories in
one period, so `budgets` + `budget_lines` supports both shapes. Spending is aggregated on
`base_amount`, the only way a multi-currency workspace can compare against a single limit; a
budget denominated in another currency has its limit converted at the rate on the period start.

Mid-period changes go through `budget_revisions` rather than overwriting, so a variance report can
still explain why a ceiling moved.

---

### Anomaly detection is explainable statistics, not a model

A z-score against the category's own trailing months is something a user can be shown and can
argue with, it needs no training data, and it runs in one SQL pass. The current month is excluded
from the baseline, or the spike would drag the mean toward itself and mask the very thing being
detected. A flat history (zero deviation) falls back to a relative test.

Every notification carries a dedupe key, which is what lets the scan run on a schedule without
notifying anyone twice about the same finding.

---

### Deletes are soft where history matters, blocked where it would mislead

Transactions are soft-deleted, so the audit trail survives and the balance trigger reverses their
contribution. Accounts and categories with history cannot be deleted at all — the API tells the
caller to archive instead, so historical reports keep their labels. Reconciled transactions are
frozen until the reconciliation is undone.

---

### UUIDv7 primary keys

Random v4 keys fragment the B-tree on high-volume tables. Postgres 16 has no built-in `uuidv7()`,
so migration `001` defines one in plpgsql. Keys stay plain `uuid` columns, inserts stay on the
right edge of the index, and ids sort by creation time — which also gives list endpoints a stable
tiebreaker for pagination.

---

### Frontend stack: React, Material-UI, Redux Toolkit, Recharts

Chosen with the user over a lighter Tailwind + Zustand alternative that was offered as the
recommendation: **React + TypeScript, Material-UI, Redux Toolkit (RTK Query), Recharts**, React
Hook Form with Zod. Built out in `apps/web` covering Dashboard, Accounts, Transactions, Budgets,
Goals, Recurring and Alerts (CLAUDE.md section 2). The Zod schemas in `src/modules/shared/schemas.ts`
and each API module's `routes.ts` are the contract the client validates against; until the shared
workspace package (CLAUDE.md, next task 3) exists, every `apps/web/src/features/<domain>/*Schemas.ts`
file is a hand-kept copy of the server's rules, and says so in a comment.

---

### Recurring-transaction amounts are signed at rest, unsigned in the create/update input

Same convention as transactions (see "Transactions store a signed amount" above), applied
independently: `POST`/`PATCH .../recurring` take a positive magnitude and derive the sign from
`type`, via the same `signedAmount` helper, but the stored row — and therefore every `GET` response
— carries the signed value. A client that assumes the read shape matches the write shape will
compute a double-negative for expenses. This bit the web client once: `RecurringCard.tsx` — since
the visual redesign, `RecurringRow.tsx` — prepended a `-` to an already-negative `amount` and
rendered `"R$ NaN"`. `RecurringTransaction.amount` in `apps/web/src/api/types.ts` now documents
the asymmetry inline.

---

### MUI's `Select` needs a controlled `value`, react-hook-form's `register()` alone is not enough

`register()` binds a field the *uncontrolled* way: it sets the DOM input's value directly via a
ref, which is enough for a plain `<input>` but not for MUI's `Select` (what `<TextField select>`
renders), because Select's displayed value comes from a `value` prop React re-renders with, not
from reading the DOM. The practical symptom: every select in a new dialog opens looking empty even
though the correct value is set underneath — confirmed by reading the hidden input's actual value
directly in a real browser, not by reasoning about it. The fix used throughout `apps/web`: pass
both `{...register('field')}` *and* `value={watch('field')}`. A placeholder option with
`value=""` (e.g. "Uncategorised", "None") additionally needs `SelectProps={{ displayEmpty: true }}`
on the `Select` and `InputLabelProps={{ shrink: true }}` on the `TextField`, or MUI treats the
empty string as "nothing selected" and either renders nothing or overlaps the label with the
displayed text.

**Cost:** every `<TextField select>` bound to a form needs three things checked, not one — this is
easy to get half-right and have it look fine until someone opens an edit dialog with real data.

---

### Visual redesign: theme, tokens, and the statement-line motif

The client worked but wore Material-UI's defaults — the stock blue, elevation shadows on every
card, Roboto at three sizes — so it read as a generic admin template rather than as a product
about money. The redesign is a presentation-layer change only: `theme.ts`, `lib/chartTokens.ts`,
the shared components and the per-screen markup. No data-fetching, schema, permission or routing
code was touched, and the stack decision above was not reopened — "new" here means newer
capabilities *within* MUI (CSS theme variables, which the app already used) plus Framer Motion,
not a migration to something else.

**The idea is a well-set financial statement.** The product manipulates money, so money is the
content and everything else is chrome. Three things follow.

*Typography carries the hierarchy, not elevation.* Three families with three jobs: **Fraunces**
(variable serif, `opsz` axis) for the hero balance and page titles — at `opsz 96` a balance has
the stroke contrast of a headline, which is what gives R$ 76.914,41 the weight the number
deserves; **Instrument Sans** for all UI; **IBM Plex Mono** with `tabular-nums` for *every* figure
in a list or table. The mono choice is the most domain-specific one in the redesign: money is
tabular data, the backend already treats `amount` as a fixed-precision decimal string, and the
type should say so. All three are self-hosted via Fontsource, so there is no Google Fonts request
on the critical path.

*Lists of money are statement lines, not cards.* `components/LedgerRow.tsx` is the signature form —
a hairline rule beneath rather than a shadow around, the figure right-aligned in the tabular face,
and the row's condition carried by a 3px spine on the left instead of a chip loud enough to
compete with the amount. Transactions, budget lines, recurring schedules, recent activity and
upcoming bills are all the same object seen from different angles, so they are all drawn by that
one component. `lib/tone.ts` maps each domain status onto a tone, and deliberately gives the
*ordinary* states (`cleared`, `on_track`) no spine at all: a ledger where every line is marked is
a ledger where nothing is. Shadow survives only where something genuinely floats — dialogs, menus,
tooltips — and on the dashboard's `StatTile`s, which is what marks the KPI row as a summary rather
than as more content.

*Colour means something or it is absent.* Green is income, brick is expense, old gold is a caution
state; nothing is tinted for decoration. The palette is the one specified for the redesign —
`#F7F8F4` paper and `#14171C` graphite as the two grounds, `#0F6E4E` verde-cédula as the brand and
accent — with two adjustments forced by the accessibility bar, both verified rather than assumed:
`verde-claro #1E9E63` reaches only 3.43:1 on white and `ouro-velho #C68A2E` only 2.97:1, so light
mode uses a darker step of each hue for text (`#157A4E`, `#8A5A16`) and the nominal values survive
as the dark-mode steps. Every text colour and coloured figure clears AA (4.5:1) against all three
surfaces in both schemes; every graphical mark clears 3:1.

`chartTokens.ts` keeps all its existing rules — fixed-order categorical slots that never cycle,
one flat hue for magnitude, four reserved status steps that always ship with an icon and a word —
and only moves the hexes. What did change is that slots 1 and 2 are now *semantic*, because the
only two-series charts in this app are income against expenses and this year against last. Green
and red is exactly the pair red-green colour blindness collapses, so the two slots are separated
by a full lightness step rather than by hue alone (light 2.00:1 between slots, dark 2.13:1), on
top of the legend and direct labelling that were already there.

**Motion says "this updated" and nothing else.** Framer Motion drives three things: the stat tiles
count their figure up once on arrival, statement lines enter in a ~45ms stagger with
`AnimatePresence` handling removal, and the nav's active spine slides between items via a shared
`layoutId` instead of blinking out and in. No bounce, no parallax, no hover flourish — it is
money. `prefers-reduced-motion` is honoured twice over: `CssBaseline` flattens durations globally,
and the components additionally skip the work via `useReducedMotion()` rather than running an
animation the browser then collapses.

**Cost, and two traps worth knowing about.**

- **The global focus ring needs `!important`.** MUI's own `ButtonBase` and `InputBase` styles set
  `outline: 0`, and an emotion class beats a bare `:focus-visible` on both specificity and sheet
  order. Without `!important` the ring silently fails to render on most of the app's controls —
  which is how this was found: a Playwright pass that tabbed through 22 stops and read the
  computed `outline` reported every one of them as ringless. (Chrome does not match
  `:focus-visible` on the inner `<input>` of a date field at all; those are covered by the
  focused `OutlinedInput`'s 2px accent border instead.)
- **A `1fr` grid track still has `min-width: auto`.** A wide table inside one pushes the whole
  page sideways no matter how many `overflow-x: auto` wrappers sit beneath it. Every multi-column
  grid in `apps/web` now uses `minmax(0, 1fr)`, which is what makes the inner scroll container
  actually bite; the Reports screen overflowed a 390px viewport by 15px until it did.
- Styling now lives in `theme.ts` far more than in per-screen `sx`, which is the point, but it
  means a component override there is a change to every screen at once. Overrides written inside
  `styleOverrides` must read palette values as `var(--mui-palette-*)` — the callback receives the
  *default* scheme's literal values, so `theme.palette.divider` there bakes the light hairline
  into dark mode.

---

### Soft controls, a distinct icon set: a second register on top of the statement language

A later session restyled buttons, fields and icons app-wide, at the user's request, toward a softer,
rounder, more tactile feel — described as "clean," "smooth," and "Apple pattern." This is deliberately
a *second* visual register layered onto the redesign above, not a replacement for it: a card is read,
so it keeps the flat hairline the redesign chose; a control is operated by hand, so it gets a pill or a
generous radius, a soft focus glow instead of a hard ring, and a brief press animation. The two
registers coexist in `theme.ts` on purpose — `MuiCard`/`MuiPaper` untouched, `MuiButton`/
`MuiOutlinedInput`/`MuiChip`/`MuiIconButton` rewritten.

**Buttons became pills, fields became softly rounded, focus became a glow.** `MuiButton.root` moved
from `borderRadius: 8` to `999` (radius always equal to half the height, so nothing looks like it
stopped rounding partway), gained a subtle shadow on the contained variant, and a `scale(0.97)` press.
`MuiOutlinedInput.root` moved to `borderRadius: 14` and, on focus, a `box-shadow` halo
(`color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)`) alongside the accent border —
the same information a hard 2px border gave before, without the field visibly jumping in size at the
moment of focus. `MuiChip` became a full pill (tags read better as pills than as rounded rectangles).
`color-mix()` rather than a literal rgba is the same rule the file's own `v()` helper documents:
a hardcoded hex inside `styleOverrides` bakes in whichever colour scheme was default, and this one had
to work in both.

**`ToggleButtonGroup` almost broke from a blanket radius.** The first pass set `borderRadius: 999` on
every `MuiToggleButton`, which looks right for a lone button but breaks a *grouped* segmented control —
`ToggleButtonGroup` owns rounding the two outer ends and squaring the joins in between via its own
`grouped` class, and forcing every button to an independent full pill fights that, leaving visible gaps
between segments instead of one merged strip. The fix: leave `MuiToggleButton` alone and round
`MuiToggleButtonGroup` itself instead, at both its `root` and `grouped`/`firstButton`/`lastButton`
selectors. Three dialogs (`SplitsDialog`, `TransactionFormDialog`, `RecurringFormDialog`) use grouped
toggle buttons and would have shown the seam had this shipped.

**Icons moved from Material Icons to Phosphor**, for a thinner, more consistent stroke closer to the
requested "Apple pattern" than Material's default glyphs. This touched every one of the ~35 files that
imported `@mui/icons-material/*` — a mechanical pass, same shape of work as the i18n and error-key
extractions, done with a script rather than by hand for that reason.

**`src/icons.tsx` is the one file every icon in the app now goes through**, and it exists to solve one
problem: Phosphor's components take `size`/`weight`/`color` as literal values, while every call site in
this codebase was written against MUI `SvgIcon`'s prop surface — `fontSize="small"`, `color="error"`,
and `sx` objects using MUI's own shorthand and theme tokens (`sx={{ mr: 0.5, verticalAlign: '-3px',
color: 'text.disabled' }}` in `TransactionLedger.tsx`'s transfer glyph, for one). Rather than touch
props at all ~35 call sites, each Phosphor glyph is wrapped through MUI's `Box` with `component={Glyph}`,
which gives the *full* `sx` engine — spacing shorthands, palette-token strings, breakpoints, arbitrary
CSS — to a plain SVG component for free, exactly as it already worked for MUI's own icons. Phosphor's
fill defaults to `currentColor`, the same convention `SvgIcon` uses, so plain CSS `color` from `sx` is
enough; nothing needed a `useTheme()` call to resolve a semantic colour name, since `sx`'s own `color`
handler already resolves a dot-path token (`'text.disabled'`, `'error.main'`) against the live theme.
Every exported name in `icons.tsx` matches the MUI-era local identifier it replaces (`AddIcon`,
`DeleteIcon`, ...), so the only change at any call site was the import's source module — the JSX itself
did not change. A handful of icons needed a semantic judgement call rather than a literal rename, since
Phosphor doesn't ship a "beach umbrella for a vacation goal" icon by that name: `Elderly` (a retirement
goal) became `Armchair`, `AddCard` (adding a goal contribution) became `PiggyBank`, `WorkspacePremium`
(transferring workspace ownership) became `Crown`.

---

### The client is translated; the API is not

The app ships in **English, Brazilian Portuguese and Spanish**, chosen with the user. `react-i18next`
rather than a hand-rolled dictionary: plurals and interpolation are the two things a hand-rolled one
always gets wrong, and i18next resolves both through `Intl` — `{{count}}` picks the right plural form
per language without the call site knowing the rules.

**One setting governs words *and* numbers.** `user.locale` already existed (the API uses it to seed
category names in pt-BR or English) but the client ignored it: `lib/format.ts` formatted dates and
money from `navigator.language`, so a Brazilian machine showing an English interface still printed
`25 de ago.`. Every formatter now defaults to `appLocale()`, which reads i18next. Changing the
language changes the dates and the currency grouping with it.

**Where the language lives, and which copy wins.** Two places, answering different questions. The
browser's `localStorage` answers "what should this device show right now, before anyone signs in" —
it is what makes the login screen readable, and it is the only one consulted at startup. The
profile's `locale` answers "what does this person read" and carries the choice to their other
devices. Detection order is: explicit choice in this browser → the browser's own `navigator.languages`
→ English. The signed-in profile is adopted only when this browser has made no choice of its own,
which is what stops a saved profile from overriding the picker on a shared machine. Both are written
when the user picks a language; the profile write is fire-and-forget, because the interface has
already changed and a failed PATCH should not roll it back under them.

**Modules evaluated at import hold keys, not text.** This is the rule the whole extraction turns on.
`navItems.ts`, `lib/tone.ts`, `alertMeta.ts`, the Zod schemas in `features/*/*Schemas.ts` and every
`*_LABEL_KEYS` table are plain data, built once when the bundle loads — before any language is
settled. They carry catalogue keys and the render site resolves them with `t()`. `lib/validation.ts`
does the same job for form fields: it resolves a message if it is a known key and passes it through
untouched if it is not, which is exactly what tells a client-side Zod key apart from a server-sent
sentence.

**Server text stayed English at first**, deliberately — translating it meant an `Accept-Language`
header, translated error envelopes and translated alert bodies, a second project the redesign left
alone on purpose. That scope call was reversed in a later session: see "The API gets its own i18n
layer" below for what actually shipped and why. `getApiErrorMessage` still prefers the API's own
wording when present, because it is the only text that knows *why* a request failed; the client's
own fallbacks (connection lost, timeout, 403, 429) are translated independently for the cases where
no server text ever arrives.

**Cost, and the things that will bite.**

- **Every new user-visible string has to go through `t()`.** A hardcoded one will look fine in
  English and silently stay English everywhere else. The scan that catches it is a grep for JSX
  string attributes and bare text nodes, which is how the last dozen were found.
- **`useTranslation()` is what subscribes a component to a language change.** `App` calls it so a
  switch repaints the whole tree — nothing is wrapped in `React.memo`, so a re-render at the root
  reaches every screen, including the figures, which are formatted by plain functions that cannot
  subscribe on their own. If a memo boundary is ever introduced, that guarantee goes with it.
- **The three catalogues must stay key-for-key identical.** A missing key falls back to English
  silently, which reads as a bug rather than as a gap. There is a check for this — it compares the
  key sets *and* the `{{placeholder}}` names in each string, since a translation that drops an
  interpolation loses a number rather than a word.
- **Weekday names come from `Intl`, not the catalogue** (`weekdayLabels` in `recurringSchemas.ts`).
  The browser already ships that table for every language, and translating it by hand would mean
  getting it wrong in the languages nobody on the team reads.
- Spanish gets English category names on a *new* workspace: the API's `templateLabel` branches on
  `pt` versus everything else. Not a regression — it is the pre-existing server behaviour meeting a
  language it was not written for.

---

### The API gets its own i18n layer: errors, alert emails, notifications

A later session reversed the "server text stays English" call above, at the user's request, for the
three things a user actually reads: API error messages, alert emails, and in-app notifications. Zod's
own field-validation messages and raw Postgres constraint text were deliberately left out — see "What
stayed English" below.

**`apps/api` gets its own `i18next` instance**, independent of the client's — not shared, because a
shared package would need its own workspace and there is nothing today to share; each side owns its
own three-language catalogue (`apps/api/src/i18n/locales/{en,pt-BR,es}.json`). The reasoning for
`i18next` over hand-rolled interpolation is the same one the client decision above already gives:
plurals (`{{count}}` day/days) need `Intl`-correct pluralisation per language, and getting that right
by hand is exactly the kind of thing this codebase has already chosen not to reimplement. The
catalogue JSON is read with `fs.readFileSync` against `import.meta.url` rather than imported as an ES
module — Node's NodeNext resolution wants an import-attribute (`with { type: 'json' }`) for a real
ESM import, and `readFileSync` sidesteps that rule entirely, at the cost of one extra build step
(`scripts/copy-assets.mjs`) that copies the catalogue next to the compiled `dist` output, since `tsc`
only emits `.ts` files.

**`AppError` carries a translation key, not a message.** `new AppError(code, messageKey, params?)`
renders an English string immediately (for `.message`, which logs and tests read) and defers the
locale-specific rendering to `.localize(locale)`, called once, at the HTTP response boundary in
`middleware/error-handler.ts`. Every one of the roughly 110 places that used to throw
`notFound('Account')` or `unprocessable('A budget needs at least one category line')` now throws
`notFound('resources.account')` or `unprocessable('budgets.noLines')` — a mechanical pass, file by
file, the same shape of work as the client extraction.

**A `fooKey` parameter resolves to `foo` before interpolation.** `notFound()` needs to translate the
*noun* ("Account", "Budget line") independently of the sentence around it ("{{resource}} not found"),
and a role name inside `workspaces.roleRequired` needs the same treatment. Rather than a bespoke
mechanism per case, `lib/i18n.ts`'s `t()` treats any param whose name ends in `Key` as a nested
translation key: `forbidden('workspaces.roleRequired', { roleKey: 'common.role.editor' })` resolves
`roleKey` to the word `editor` (or `editor`/`administrador`/whatever the locale says) in the same
`t()` call, then interpolates it as `{{role}}`. This is what lets a throw site defer translation
entirely — it never needs to know what locale the eventual response will render in.

**Raw Postgres `detail` text bypasses translation on purpose.** `fromDatabaseError`'s unique/foreign-key/
check-constraint messages sometimes carry the database's own `detail` string (column and table names,
already English, already not particularly user-friendly). Inventing a translation for wording Postgres
never actually said would be worse than leaving it alone, so `AppError` has an escape hatch —
`rawMessage`, a fifth constructor argument — that bypasses the catalogue and is used only here.

**Locale resolution has the same two-source shape as the client's, mirrored server-side.**
`middleware/locale.ts` resolves `req.locale` from the `Accept-Language` header before anything else
runs, so even a failed login or a bad register request comes back in whatever language the client's
picker is currently set to — the client now sends its `i18n.language` as that header on every request
(`api/baseQuery.ts`), not the browser's own language, so the two pickers agree. Once `requireAuth`
loads the account, it overwrites `req.locale` with the signed-in user's stored `locale` column, which
takes precedence — the mirror of the client's own rule that the profile only applies once a device has
made no explicit choice of its own, except here the "device" is `Accept-Language` and the durable
choice is the database column, so the direction of precedence is reversed on purpose: a signed-in
user's own setting should not be silently overridden by whatever a proxy or test client happens to send.

**Alert notifications resolve content per recipient, not per request.** A budget-exceeded alert fans
out to every workspace member via `notifyWorkspace`, and members do not all share a language.
`notifyWorkspace` now takes a `content: (locale) => { title, message }` builder instead of a static
`title`/`message` pair, joins `users.locale` when it loads the member list, and calls the builder once
per member — so the same event produces a Portuguese notification for one member and an English one
for another, all from one alert evaluation. `modules/alerts/engine.ts`'s seven alert types each moved
their inline template strings into `alertNotifications.*` catalogue keys for this. The stored
`notification.title`/`.message` are the *rendered* text in that recipient's language — the alert email
worker (`processDeliveries` in `jobs/processors.ts`) reads them back verbatim, which is what makes the
email translated too, without the emailer needing to know anything about locales itself; it only
translates its own wrapper chrome (`Hi {{name}},`, the button label, the link-fallback line) using the
recipient's `users.locale`, already selected by `pendingDeliveries`. The workspace-invitation email is
different: the recipient has no account yet to carry a locale, so it renders in the *inviter's*
language instead (`req.locale` at the moment they send the invite) — the closest available signal to
what the person receiving it can probably read, since they are being invited into the inviter's own workspace.

**What stayed English.** Zod's own field-validation messages (`"Name is required"`, `"Must be a valid
UUID"`) are still generated in English by the ~15 modules' route schemas, and were left alone: the
client already mirrors every server validation rule in its own Zod schemas and translates *those*
before a request is ever sent (see the client decision above), so the server's raw Zod message only
ever reaches a user when client-side validation was bypassed entirely — a malformed direct API call,
not the golden path. Translating perhaps 150 more strings for a case the UI does not normally hit was
not judged worth doing in the same pass; if the shared-schema package in the pending "Share the request
schemas" task ever lands, that is the more natural place to fix it once, on both sides at once.

---

### CSV import is preview-then-commit, and every inference is shown rather than applied

A user downloads a statement from their bank and wants those rows in a workspace without typing
them. Three things make that harder than it sounds: every bank names its columns differently, the
file says nothing about which account it belongs to, and re-importing an overlapping month must not
double anybody's balances.

**The shape of the feature is the decision.** Rows are not streamed into the ledger as they parse.
A `POST /imports/preview` parses the whole file, applies a column mapping, converts every amount and
date, checks each row against the existing ledger for duplicates, and returns the result — having
written no transaction at all. A separate `POST /imports/:batchId/commit` then inserts the rows the
user kept, in one database transaction. A file that fails on row 147 leaves nothing behind, which is
simply not achievable if row 1 is already committed by the time row 147 is read.

**The preview *is* the batch.** Rather than hold previews in Redis and mint a separate id at commit
time, `import_batches` carries a `preview | committed | reverted` lifecycle: the preview inserts the
row with its parsed payload in `preview_rows`, the commit flips it to `committed` and clears that
payload, and the undo flips it to `reverted`. Three things fall out of this for free. The id the user
sees before committing is the id they undo with afterwards. Nothing depends on Redis being up on the
commit path. And `transactions.import_batch_id` has a real row to point at, which is what makes
"undo the whole batch" a single `UPDATE` rather than a list of ids the client has to hold onto.
The cost is that abandoned previews accumulate, so each carries an `expires_at` and an hourly
maintenance job sweeps them — hourly rather than daily because a preview holds a whole file in a
`jsonb` column, which is worth collecting sooner than a stale token.

**Undo is a soft delete, not a hard one.** Setting `deleted_at` on every row of a batch runs the same
balance trigger that a one-row delete runs, so the account unwinds correctly with no second code path
to keep in step. It refuses outright if any imported row has since been reconciled, matching the rule
single-row deletes already enforce.

**Guessing is fine; guessing silently is not.** Three inferences can invert or displace an entire
statement, so all three are resolved by the server, echoed back in the preview's `options`, and
rendered as editable controls in the dialog rather than as a result:

- **Direction.** Banks emit one signed amount, or separate debit/credit columns, or a positive
  amount beside a `D`/`C` flag. All three are supported; getting it wrong inverts every row.
- **Decimal mark.** `1.234,56` and `1,234.56` are both common and mean the same number. Inference
  looks at which mark comes *last* in values that have both, and treats a lone mark followed by
  exactly three digits as a thousands separator.
- **Date layout.** `01/02/2026` is genuinely two different dates and no amount of cleverness can
  tell them apart in isolation. Inference scans the file for a component above 12 — that settles it —
  and where nothing does, it reports `dateFormatAmbiguous: true` and the UI asks. Defaulting quietly
  to day-first would move half a statement by up to eleven months without anyone noticing.

**Duplicates are flagged, never dropped.** A row matches when the account, date and amount agree and
the descriptions are close after normalisation, or when an `externalId` matches. Matched rows start
unticked but remain committable, because two identical coffees on one day are a real pair rather than
a mistake — that judgement belongs to the person who was there. One further rule matters: each
existing ledger row can be claimed by only one file row, so a genuine pair is not both flagged
against the single row already recorded.

**The mapping is remembered per account.** A committed batch stores the header row's signature, and
the next preview of a file with the identical header reuses that batch's whole option set. The second
import of the same bank is therefore one click, and — usefully — a date layout the user resolved by
hand once is not asked about again.

**Money never becomes a `Number`.** Amount cells are parsed by string manipulation into `Decimal`
through `lib/money.ts`, the same as everywhere else. `lib/csv.ts` gained a hand-written parser to
match: quoted fields containing the delimiter or a newline, `""` escapes, a UTF-8 BOM and all three
line endings all occur in real bank exports, and none of them survive `split(',')`. The CSV *writer*
moved out of `modules/reports/service.ts` into that same file at the same time, so the two halves of
the format cannot drift apart. Delimiter sniffing parses each candidate and scores it on whether the
rows come out a consistent width, rather than counting occurrences — `"Padaria, Central";10,50` has
more commas than semicolons and is still semicolon-delimited.

**What this deliberately does not do.** The file is read as UTF-8; a Latin-1 export will mangle
accented descriptions, and re-encoding is left to the user. There is no OFX or QIF support, no
scheduled or emailed import, and no rule engine that learns a category from a description — the
`category` column is matched against existing category names and otherwise left blank rather than
guessed at.

---

### CI gates on everything, which meant fixing the type error it would have gated on

The workflow is two jobs rather than one. **check** — typecheck, both workspace
builds, unit tests — needs no services and reports in about a minute; **test** runs
the full suite against a `postgres:16` service container. They run in parallel, so a
type error does not wait behind a database starting and 222 tests running.

**Only Postgres is provisioned**, and that was established by experiment rather than
by reading. Under `NODE_ENV=test` the cache helpers short-circuit,
`invalidateWorkspaceCache` returns early and the rate limiter swaps `RateLimiterRedis`
for `RateLimiterMemory` — so the suite should never touch Redis, and MailHog is only
used by the worker. Stopping both containers and running the full suite confirmed
222 passes. Declaring services a workflow does not need costs startup time on every
run and, worse, hides a real dependency behind a container that happens to be there.

**The `vite.config.ts` type error had to be fixed, not worked around.** For several
sessions `apps/web`'s typecheck reported exactly one error, and the project's notes
said to run `npx vite build` instead of the client's own `npm run build`. That is
survivable for a human who knows to ignore one line; it is not survivable for CI,
where a step that always fails is a step that can never gate anything. Papering over
it — grepping the output, or `continue-on-error` — would have made the client's
typecheck permanently decorative.

The cause was two copies of `vite`. `apps/api`'s `vitest` 2.x depends on vite 5, which
npm hoisted to the root; `apps/web` needs vite 6 and got a nested copy; and
`@vitejs/plugin-react` hoisted to the root, where it resolved vite 5. So `react()`
returned a root-vite-5 `Plugin` while `defineConfig` in `apps/web` expected a
web-vite-6 `PluginOption` — two structurally identical, nominally different types.

Three fixes were possible: bump `vitest` to 3.x (which uses vite 6), force a single
version with an `overrides` entry, or declare `vite` at the root. The third was chosen
because it is the only one that leaves the test runner alone. Adding `vite: ^6.4.3` to
the root `devDependencies` makes npm hoist vite 6 — where `plugin-react` and `apps/web`
both now resolve it — and nest vite 5 under `node_modules/vitest/`, so vitest runs on
exactly the version it was tested against. The suite was 222-green before and after,
and `npm run build --workspace=@finance/web` works for the first time. The cost is a
root dependency that looks unused and is not; it is called out in CLAUDE.md so nobody
tidies it away.

**The workflow needs no repository secrets.** The only variables without defaults are
the database URLs and the two JWT secrets, and the JWT values in the workflow are
deliberately fake, committed strings. Nothing they sign outlives the job and the test
database is created and thrown away inside it, so requiring a configured secret would
add a setup step that protects nothing.

**A migration rollback round-trip runs after the suite.** Down-migrations are never
exercised by the application and rot silently; rolling the newest one back and forward
against the already-migrated test database costs a second and is the only thing that
would ever catch a `down` that was written but never tried.

**It has actually run.** Every step was rehearsed locally first — with CI's own environment
rather than the developer's `.env`, and including a cold run with `finance_test` dropped
beforehand, because that is the path CI takes on every single run and the one local
development never exercises. The repository was then published and the first push turned
both jobs green in about a minute. That distinction matters: a workflow file that has never
executed is a plausible guess, not a verified one.

---

### Deliberately not built in this phase

- **OAuth login.** The `user_identities` table exists; no provider flow is wired up.
- **Push notifications.** `push_devices` exists and deliveries are recorded, then marked
  `skipped` — no provider is configured.
- **Live exchange rates.** `EXCHANGE_RATE_PROVIDER=static` ships indicative BRL rates. The refresh
  job and the rate table are provider-shaped, so a real feed slots in behind `refreshStaticRates`.
- **PDF export.** CSV export and a structured statement endpoint are implemented; rendering to PDF
  belongs with the client, which has the layout.
- ~~**CSV import.**~~ Built — see "CSV import is preview-then-commit" above.
