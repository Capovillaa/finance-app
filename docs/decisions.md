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

### The validation rules are shared; each side still builds its own parser

Every rule the API enforces on a request used to be written twice: once in an
`apps/api/src/modules/*/routes.ts` Zod schema, and once by hand in the matching
`apps/web/src/features/*/\*Schemas.ts`. Each of those client files said so in a comment
and promised to stay "character-for-character identical". They had not.

**The drift was real and user-visible, which is what settled the design.** Four
divergences were found by comparing the two sides field by field, all in the same
direction — the client accepting what the server refuses:

| Field | Client | Server |
| --- | --- | --- |
| `occurrenceLimit` | no rule at all | whole number, 1–1000 |
| `leadTimeDays` | up to 99 | 0–90 |
| `intervalCount` | any number of digits | 1–365 |
| budget `lines` | no ceiling | at most 100 |

Three of those cost a failed round trip and an untranslated error. The first is worse
than that: the recurring dialog sends `Number(occurrenceLimit)`, so text typed into a
box with no rule became `NaN`, and `JSON.stringify` turns `NaN` into `null` — which the
API reads as "this schedule has no occurrence limit". A typo silently changed the
meaning of the schedule rather than being rejected.

**The Zod schemas themselves are deliberately *not* shared.** This was the obvious move
and it is wrong. The API validates a JSON body: an amount may arrive as a `number`, an
absent field is `undefined`, an id is a real UUID, and `moneySchema` *transforms* its
input into the canonical `NUMERIC(19,4)` string through `decimal.js`. The client
validates a form: every field is a string, an absent one is `''`, an id is whatever the
`<Select>` last held, and nothing is transformed because nothing is stored. Forcing one
schema to serve both would mean either shipping `decimal.js` to the browser to normalise
a value the browser never keeps, or draining the server's schema of the transform that
makes it useful. They are two parsers of two different inputs, and pretending otherwise
produces something worse than two honest schemas.

**What is shared is everything the two must agree on.** `packages/schemas`
(`@finance/schemas`) holds:

- `limits.ts` — every bound, in one table. `MONEY_PATTERN` is *generated* from
  `LIMITS.money` rather than written out, so the regex cannot drift from the column it
  guards.
- `enums.ts` — every closed set, as `as const` tuples that yield both a Zod enum and a
  TypeScript union. `apps/web/src/api/types.ts` now derives `AccountType`, `GoalStatus`,
  `BudgetPeriod` and the rest from these instead of restating them.
- `patterns.ts` — the predicates (`isMoneyText`, `isDateOnlyText`, `hasLettersAndDigits`,
  `isWholeNumberInRange`), which is what a form can use when its input is text.
- `fields.ts` — the API's own request fields, stopping short of any transform.
- `messages.ts` / `translations.ts` — how a rejection names itself, and its wording.

**A rejection carries a key, not a sentence, and each side resolves it.** A Zod message
is fixed when the schema is built, long before either process knows what language to
answer in, so the shared schemas carry `validation.amountPositive` and the two resolvers
render it: `lib/validation.ts` in the client, `middleware/error-handler.ts` in the API.
The consequence is a genuine gain rather than plumbing — **the API's field errors are now
translated**, which the i18n decision above had explicitly left undone. A `422` answers
in the caller's own language, resolved from `Accept-Language` exactly like every other
message.

The wording lives in the package rather than in the two i18n catalogues, for the same
reason the bounds do: both sides now reject a field with the same key, and a sentence
kept in two catalogues is a sentence that gets corrected in one of them.
`Record<ValidationLocale, Record<ValidationMessageName, string>>` makes a missing
translation a compile error — strictly better than the shell script that checked the
client's catalogues after the fact.

**A message that quotes a bound interpolates it from `LIMITS`.** "Enter 1–1000" is a
better message than "out of range", but writing those numbers into catalogue entries
would put the bound straight back into the files this package exists to empty. So the
entry reads `{{min}}`–`{{max}}` and `VALIDATION_PARAMS` supplies the values from the same
table the schema enforces them with. A unit test asserts that every placeholder in every
language has a value behind it, because a translation that drops one loses a number
rather than a word.

**The package is consumed as compiled output, which costs a build step.** `apps/api`
resolves it through Node's own resolver and must find a real `.js` beside a real `.d.ts`,
so the package builds to `dist` with declarations and both consumers read that. The
ordering is handled three ways so it cannot be forgotten: the package's own `prepare`
script builds it during `npm ci`, every root script (`typecheck`, `build`, `test`, `dev`)
builds it first, and both CI jobs build it explicitly. The alternative — a source-only
package resolved through a custom export condition — would have let `apps/web`'s bundler
and `apps/api`'s `tsc` disagree about what the package contains, which is the same class
of problem this change exists to remove.

**Two bugs surfaced by driving the real UI, after everything else was green.**
Adding a bound to `occurrenceLimit` made the Recurring form refuse to submit while
displaying nothing, because that field was the one `TextField` in the dialog with no
`error` / `helperText` bound to it — it had never needed them, having had no rule to
break. And `BudgetFormDialog` passed nested field-array messages straight to
`helperText` instead of through `fieldMessage()`, so a user saw the literal string
`validation.categoryRequired`. The second predates this change entirely and had been
invisible because nothing renders a nested array error unless the array is deliberately
made invalid. Neither is the sort of thing a typecheck or a passing suite can find, which
is the same lesson every previous session in this project recorded.

**What was left alone.** Zod's own built-in wording for a bare `.max(120)` is still
English, exactly as the i18n decision above describes: the client validates and
translates before a request is sent, so the server's raw message is a bypassed-validation
edge case rather than the golden path. And the request *bodies* are still described
twice — as a Zod object on the server and as a TypeScript interface in the client's
`api/types.ts`. Collapsing those two is what OpenAPI generation is for, and it now has a
package to generate from.

---

### The OpenAPI document is generated from the app that boots, and only describes requests

The API's shape used to live in three places that agreed only because a human kept them
agreeing: the route files, `docs/api.md`, and the client's hand-written `api/types.ts`.
The fix is one document generated from the code that actually runs — `docs/openapi.json`,
written by `npm run generate:openapi`, served at `/openapi.json`, and regenerated in CI so
it cannot quietly rot.

**No OpenAPI library.** The installed `zod` (3.25.76) already ships Zod 4 at the `zod/v4`
subpath, including `z.toJSONSchema()`. Both third-party candidates
(`@asteasolutions/zod-to-openapi`, `zod-openapi`) require Zod 4 as a peer dependency
anyway, so "just add a library" would have meant the same migration *plus* a dependency.
Going native meant the migration and nothing else, and it added no package at all.

**The migration was a prerequisite, not an option.** `toJSONSchema` reads Zod 4's internal
representation; handed a schema built with the v3 API it fails with `Cannot read properties
of undefined (reading 'def')`. There is no "convert v3 with the v4 helper" path, so
`apps/api` and `packages/schemas/src/fields.ts` moved to `zod/v4` wholesale. The surface
turned out to be small: an import-specifier change in twenty-two files and three real
incompatibilities — `z.record(z.unknown())` now needs its key type, `ZodTypeAny` is
`ZodType`, and `ZodError` must be imported from the same version that throws it. All 242
tests passed unchanged afterwards.

`apps/web` deliberately stayed on Zod 3, because `@hookform/resolvers` 3.10 predates Zod 4
and upgrading a form-resolver dependency has nothing to do with generating a spec. That
briefly put *both* Zod builds in the client bundle — `fields.ts` is reachable from the
package's entry point — until `@finance/schemas` declared `sideEffects: false`. The package
is pure declarations, so that is simply true, and it lets a bundler drop the modules the
client never imports. The client bundle ended up 1.6 kB smaller than before the work began.

**`io: 'input'` is the whole trick.** A request body describes what a caller *sends*, and
the money fields end in `.transform(money)` — so their output type is not their input type,
and `z.toJSONSchema(schema, { io: 'output' })` throws `Transforms cannot be represented in
JSON Schema`. That `packages/schemas` keeps every transform out of the shared fields was
done for an unrelated reason and turns out to be exactly what makes the requests
describable.

**A `.refine()` is dropped silently, and metadata was the honest way to restore it.** An
arbitrary predicate cannot be expressed in JSON Schema, so `moneyField` would have been
published as "a string or a number" with no mention of the decimal format at all — a spec
that omits a rule is worse than no spec, because it looks authoritative. The obvious repair
was to move `MONEY_PATTERN` into a real `z.string().regex(...)`, and it is wrong twice
over. First, inside a union the branch's message replaces the catalogue key with Zod's
generic `"Invalid input"`, silently un-translating every rejected amount, unless the union
also carries an explicit `error` override. Second, and decisively, the current parser
accepts `" 12.50 "` because it refines on `String(value).trim()`, and a branch regex does
not — publishing a rule must not change which requests the API answers. So the rules are
restated as `.meta()` instead: the pattern where JSON Schema can carry it, prose where it
cannot ("greater than zero" against a decimal held as a string, a date that must exist).
`.meta()` survives `.transform()`, `.optional()` and `.nullish()`, which is what makes it
work at all — routes compose `moneySchema`, never `moneyField`.

**The app is walkable; the middleware are not readable.** Recursing `app._router.stack`
yields every route, but `validate(...)` and `requireEditor` are arrow functions returned
from factories, so a route's schema and its required role are closed over and invisible.
Each factory now stamps what it knows onto the handler it returns, via a `WeakMap` in
`lib/route-metadata.ts` rather than by hanging properties on objects Express also inspects.
Mount prefixes are recorded the same way: reassembling a path from `layer.regexp` half-works
and then hands back `/workspaces(?:/([^/]+?))/accounts`, so `mount()` remembers the literal
string it was given instead.

One trap inside that, worth the warning: a mount's guard middleware cannot be recognised by
handler identity. `requireAuth` guards the `/workspaces` mount **and** serves as ordinary
middleware inside several routers, so skipping every occurrence of it — to stop it leaking
onto later siblings — published two dozen authenticated routes as public. The walker
matches guards by position within a single stack instead, which is what `mount()` records
them for.

**Requests first; responses are the expensive half.** Requests have schemas. Responses have
none — services return Kysely rows and routes `res.json()` them — so describing them means
authoring a schema per endpoint, a bigger job than everything above combined. Phase 1
therefore publishes paths, parameters, request bodies, security and the error envelope, and
declares success as the `2XX` range with a description and no content. That is honest about
what is known instead of guessing a shape. Until phase 2 lands, `apps/web/src/api/types.ts`
stays hand-written: a half-generated types file where nobody can tell which half is which is
worse than an honest one.

*Phase 2 is now underway — see "Response schemas live beside the service" below. Routes that
have been given one publish their real shape; the rest still publish the `2XX` placeholder,
and `apps/web/src/api/types.ts` stays hand-written until they all do.*

**Everything published is derived, never assumed.** The security requirement comes from
`requireAuth`, the 403 from `requireRole`, the 429 from whichever rate limiter is actually
mounted in front — which is why `/health` and `/openapi.json`, sitting outside `/api/v1`,
correctly carry no 429 — and the tag from the prefix a router was mounted at, so
`/workspaces/{workspaceId}/members` groups under `workspaces`, where its code lives, rather
than under a `members` module that does not exist.

**Serving and checking.** `/openapi.json` builds from the live app on first request and is
cached, so what a caller reads is what that process enforces; the committed file is the same
document, and exists so a pull request shows a contract change in its diff. They were
verified byte-identical against a running server. CI regenerates and fails on any
difference, in the `check` job, since no database is involved.

---

### Response schemas live beside the service, and the test suite proves them

Phase 1 left every success response published as a bare `2XX`. Describing them means
*authoring* a schema per endpoint rather than converting one, because a handler returns a
Kysely row and `res.json()`s it — there is nothing to read. Two questions had to be settled
before any of that could be written: where the schemas live, and what stops them from being
wrong.

**They live in `modules/<domain>/responses.ts`, not in one `openapi/responses/` module.**
The alternative is tidier to look at and worse to maintain. A response shape is produced by
a specific query and the mapper beside it — `AccountRecord` and `toRecord()` are ten lines
apart in `accounts/service.ts` — and the change that invalidates a response schema is a
change to that query. Keeping the schema in the same folder puts the two under one diff and
one review; a central tree puts them in different halves of the repository and relies on
whoever edited the `SELECT` remembering that a parallel file exists. That failure is silent:
the spec still generates, still validates, and now describes last month's row.

It also extends a convention rather than inventing one. Every domain folder is already
`routes.ts` + `service.ts`, so `responses.ts` reads as the third member of a set. The one
thing a central module would genuinely have offered — a home for shapes more than one domain
returns — is served by `modules/shared/responses.ts`, which is the response side of the
`shared/schemas.ts` the request side already had. The split is by *ownership*, not by
layer: a domain's shapes sit with the domain, the scalars and envelopes everyone uses sit in
`shared`.

**A response schema describes the wire, not the row.** These two differ, and the difference
is the whole reason a hand-written mirror of the service interface would have been wrong: a
`timestamp` column arrives from `pg` as a JS `Date` and only becomes an ISO string when
Express serialises it. The schemas describe the string. This is the mirror image of the
request side's `io: 'input'` — there the transform runs after the schema, here it runs
after the handler — and both come down to describing the JSON, which is the only thing a
caller ever sees.

**`responds()` is enforced under test, which is the load-bearing part.** A hand-authored
response schema is a guess about someone else's SQL, and a spec that describes a shape the
API does not return is worse than one that describes nothing. So `responds({ 200: schema })`
is not only a stamp for the generator: under `NODE_ENV=test` it wraps `res.json` and parses
every outgoing body — serialised first, so what is checked is exactly what is published —
and fails the request loudly on a mismatch. It also fails on a *success status the route
does not declare*, which catches the opposite drift: a handler that starts answering 200
where its declaration still says 201. Outside tests it is a `next()`.

That turns the existing integration suite into the verification. It was checked by
deliberately typing one money field as a number: 25 tests failed with the field named in the
message, rather than passing quietly. Reach matters as much as strictness, though — a schema
no test ever exercises is an assertion nobody made — so
`tests/integration/response-contracts.test.ts` makes one successful call to every endpoint
that declares a schema, which the domain tests do not: they drive most of the failure paths
and only some of the success ones.

**Named components, including the scalars.** A schema wrapped in `component('Account', …)`
is published once under `components/schemas` and `$ref`'d everywhere, which Zod does for
free: an `id` in a schema's metadata makes `toJSONSchema` extract it into `$defs`, and the
generator moves those into `components/schemas` and repoints the references. Recursion falls
out of the same mechanism — a category's children resolve to a reference back to
`CategoryNode` instead of the `#` that Zod emits for a schema that is its own root, which
would have pointed at the whole document.

`Money`, `Timestamp`, `DateOnly`, `Uuid`, `CurrencyCode` and `Integer` are components too.
That looks like over-naming until you count the bytes: an ISO instant compiles to a
300-character pattern, and inlining it beside every `createdAt` in a hundred operations
buries the file in one regular expression. Named, each is written once, every use reads as
`Money` rather than as a pattern, and a generated client picks the names up as type aliases.
They stay composable because Zod does not carry a component's `id` onto a derivative, so
`money.describe('…')` publishes prose beside the `$ref` and `timestamp.nullable()` an
`anyOf` around it, instead of quietly redefining the component under the same name.

**Envelopes stay anonymous.** `{ account: Account }` is not a concept a caller has a word
for, it is one endpoint's packaging; naming it would fill the component list with wrappers
nobody refers to. Only the things with names get names.

**Two things the authoring caught immediately.** A category's `kind` has three members, not
two: the API has always been able to return `transfer`, and the client's hand-written types
said otherwise. And `GET /categories` genuinely returns two shapes — `?shape=tree` nests
children, `?shape=flat` omits the key entirely — so it is published as a union rather than
flattened into an optional field, because "children is sometimes missing" and "children is
missing exactly when you asked for flat" are different promises and only the second is true.

**One operational wrinkle worth knowing.** Zod's metadata registry is a module-level
singleton that refuses a repeated id, and it does not share a source module's lifetime:
`vitest` with `pool: forks, singleFork` re-evaluates `src/` for each test file while leaving
`node_modules` cached, so the component names register once per file and the second load
threw `ID Money already exists in the registry`. `component()` evicts the previous
registration, which belongs to a module instance the process has already finished with; the
duplicate-name guard that actually matters is a `Set` in the same module, reset by the same
re-evaluation.

**Coverage is a number, not an impression.** `npm run generate:openapi` prints how many of
the router's operations describe what they return, and a unit test asserts that no operation
publishes both a described status and the `2XX` placeholder. It reached **104 of 104**, and
`RESPONSE_REACH=1` confirms the suite makes a successful call to every one of them — so no
schema in the document is an assertion nobody checked.

---

### The client's response types are generated, and `api/types.ts` only names them

With every operation described, `apps/web/src/api/types.ts` stopped being hand-written.
`openapi-typescript` turns `docs/openapi.json` into `apps/web/src/api/schema.d.ts`, and
`types.ts` is now a hundred lines of aliases over it. The chain has no hand-copied link left:
a Zod schema beside a service → the generated specification → the generated client types →
the fifteen RTK Query endpoint files, which were **not touched at all**, because the aliases
keep every name they already import.

**Why an alias layer rather than importing the generated file directly.** The generated
names are unusable at a call site —
`operations['getWorkspacesByWorkspaceIdAnalyticsDashboard']['responses']['200']['content']['application/json']`
is the dashboard summary — and there is no reason for a component to know its own type's
provenance. `types.ts` assigns names and nothing else: `Ok<'operationId'>` for an envelope
one endpoint returns, `components['schemas'][…]` for anything published as a component. The
rule that keeps it honest is that **no field list is written there**, so it cannot drift; the
earlier worry about a half-generated file where nobody can tell which half is which does not
apply, because no half is authored.

Two things it deliberately does not take from the specification. The closed value sets —
`AccountType`, `WorkspaceRole`, `BudgetPeriod` — still come from `@finance/schemas`, where
both apps read one declaration, rather than from the spec's inlined copy of the same list.
And `Page<T>` stays a real generic: OpenAPI 3.1 has none, so the API publishes the six
envelope fields around each item type separately, and a conditional type pins the hand-written
generic against a real paginated operation so it still fails to compile if the envelope moves.

**It found a bug on the first typecheck, which was the point.** Exactly one error came out of
the whole client: `RecurringRow.tsx` renders `accountName · categoryName`, and
`RecurringTransaction` has no `categoryName` — the API never selected it. The hand-written
type had claimed `categoryName?: string | null`, so the field had been silently `undefined`
since the redesign and every schedule had shown only its account. The join was added beside
the `accountName` one it should always have sat next to.

**Both generated files are checked in CI, in one step.** `npm run generate:openapi` writes
the specification and then the client types; `npm run check:openapi` regenerates both and
fails on any difference. Running them as one command is what stops the two from being
regenerated apart.

---

### Live exchange rates: one provider interface, and a fallback that cannot do harm

Until this session no rate in the system had ever come from outside the code. `refreshStaticRates()`
re-inserted seven hardcoded BRL pairs every time the `refresh_rates` maintenance job ran, and
`EXCHANGE_RATE_PROVIDER=openexchangerates` only logged "not implemented" before doing the same
thing. Every transaction already stored the rate that applied on its own day, so the historical
machinery was real; the numbers going into it were not.

**A `RateProvider` is one method, and `providers.ts` imports neither `env` nor the database.**
`fetchLatest(symbols, preferredBase)` returns a normalised quote — the provider's base, the
provider's date, and rates as decimal strings. The service decides which provider to build and
from what configuration; the module only knows how to talk to one. `fetch` is injectable, so the
whole file is unit-testable with no network, no database and no environment, which is why its
seventeen tests run in the fast lane alongside money and dates.

**Two providers, and the second one is the point.** Open Exchange Rates is there because the
environment variable already named it, and because it is what a real deployment is most likely to
buy. **Frankfurter** — the ECB's daily reference rates — is there because it needs no API key,
which means the live path can be *run* on a fresh checkout rather than only reasoned about. It was:
six pairs landed in the development database from the real ECB feed, and `getRate` then answered
BRL→USD directly (`0.19319`), USD→BRL by inversion (`5.1762513588`) and USD→EUR by crossing
through BRL (`0.8645375019`).

**Providers quote against their own base; we store against ours.** The free Open Exchange Rates
plan quotes USD and nothing else, so `rebase()` divides: BRL→EUR is (USD→EUR) / (USD→BRL), and the
provider's own base becomes one of our quote currencies at the reciprocal. Storing everything
against `BASE_CURRENCY` keeps the table one shape regardless of who filled it, and keeps the
commonest pair a single index hit instead of a cross-rate join.

**It only stores currencies the table already knows.** `exchange_rates` has foreign keys into
`currencies`; the ECB publishes thirty currencies against our eight, and one unknown code would
fail the entire insert rather than its own row. `rebase()` takes the supported set and filters.
The visible consequence is that ARS — which is in `currencies` and is not an ECB currency — keeps
its static rate while the other seven go live, which is the correct outcome and not a gap.

**A row is stamped with the provider's date, not today's.** The ECB publishes on business days, so
a Sunday refresh legitimately rewrites Friday's row rather than inventing a Sunday one. This is
what makes "every transaction keeps the rate that applied on the day it happened" a true statement
rather than a structural one, and it is why re-running the job is an upsert on the same day rather
than a new row every time.

**A failed refresh must not overwrite good rates with indicative ones.** The obvious fallback —
catch the error, call `refreshStaticRates()` — would replace a real rate with a made-up one every
time the network hiccuped. `getRate` already resolves the most recent rate at or before the date
it is asked about, so a missed day costs freshness and nothing else. The static table is therefore
written only when there is nothing at all on record: a fresh install whose very first refresh could
not reach the provider. Everything else is logged and left alone, and the job still reports success
because a stale rate is not a broken job.

**An error message may not carry the API key.** Open Exchange Rates authenticates with `app_id` in
the query string, so every failure path prints the origin and path only. The body is read as text
and parsed here rather than through `response.json()`, so a captive portal or an HTML error page
says "returned a body that is not JSON" instead of surfacing a bare syntax error.

**One real bug, found by running it rather than by typechecking it.** `.env.example` ships
`EXCHANGE_RATE_API_URL=` — a declared, empty variable, which dotenv hands over as `''`, not as
absent. `options.apiUrl ?? DEFAULT` keeps the empty string, `${endpoint}/latest` becomes `/latest`,
and `new URL` throws `Invalid URL` before a single request is made. Both ends are fixed: `env.ts`
normalises a blank optional string to `undefined`, and the provider treats a blank override as no
override. **A `.env` variable that exists but is empty is `''`, and `??` will not save you** — use
it for any optional string read from the environment. The failure was also a free test of the
fallback: the job logged the error and, because rates were already on record, wrote nothing.

---

### Reconciliation is a dialog with its own history, and the difference is not coloured

The API has had `POST` and `GET /accounts/:id/reconciliations` since the first session, and both
shapes have been in the specification since phase 2 — there was simply no way to reach them. The
client half is one dialog on the Accounts card menu.

**The form and the history belong together.** They could have been an "act" dialog and a separate
"history" panel, but the history is how you tell whether today's difference is news: an account
that has balanced every month and is suddenly out by 40 has one missing entry, and one that has
never balanced has a different problem entirely. It follows `ContributionsDialog`'s shape — act at
the top, history beneath — and, like it, shows the history to a `viewer` while hiding the form,
because `GET` is viewer and `POST` is editor.

**Which meant the account card's overflow menu could no longer be gated on `canEdit`.** It used to
render only for an editor, since every item in it wrote something. Reconciliation history is
readable by everyone, so the menu now renders for every role and each writing item carries its own
guard. This is the general shape to follow: gate the item, not the container, as soon as the
container holds one thing a viewer may do.

**The difference is deliberately not coloured by its sign.** The first rendering used the money
palette — negative red, positive green — because that is what every other figure in the app does.
Seen on screen it was plainly wrong: a positive difference is the bank holding money the ledger has
never been told about, and green reads as a gain. The state is already stated twice on the row, by
the caution spine and by the word `Open`, so the figure stays plain text and only an exact zero is
muted. Same family of mistake as the year-over-year table's green "−100%" for a month that has not
happened yet: an arithmetic sign is not a judgement.

**Both directions of a mismatch get their own sentence**, naming what is probably missing rather
than printing a signed number and leaving the reader to work out which way round it is. Under
pressure — which is when someone reconciles — "the bank knows about something this workspace does
not" is worth more than `+250.00`.

**One bound moved into `@finance/schemas` as a direct consequence.** The reconciliation notes cap
was a literal `z.string().max(500)` in `accounts/routes.ts`, with a comment explaining that it was
allowed to be a literal precisely because reconciliation had no client form and therefore no second
declaration to keep in step. Building the form made that false, so it is `LIMITS.reconciliationNotes`
and `reconciliationNotesField` now. The regenerated specification came out byte-identical, which is
the check that the move changed nothing about what the API accepts.

**Verified in a real browser**, against the real API: a mismatch (out by 250, warning, the row
carrying its caution spine), a match that froze two transactions and reported so in the plural, a
second run that correctly found nothing left to freeze, and `GET /transactions` confirming
`isReconciled` on both rows afterwards. Also seen in dark mode and in Portuguese.

---

### Finishing the ledger: confirm, bulk categorise, restore — and one that needed the API

Three transaction actions had been listed as unbuilt for several sessions, described as "one
button each". Building them showed that only one of them was.

**Confirm really was one button.** A `scheduled` row — a bill the worker materialised ahead of
its due date — now carries a tick beside edit and delete. Nothing else changed.

**Bulk categorise needs a selection model, which is a feature, not a button.** A checkbox per row,
a `BulkActionsBar` that appears inside the ledger card only while something is ticked, and a
selection that clears whenever the page or the filters move — acting on rows the user can no
longer see is the surprise worth designing out. `categoryId: null` is offered as a real choice
rather than being treated as "no change", because filing a bad import back to uncategorised is
something people actually do.

**Restore was unreachable, and no amount of client work could have reached it.**
`POST /:id/restore` has existed since the first session, but `GET /transactions` had no way to
return a soft-deleted row: the service supported `includeDeleted` internally, the route never
exposed it, and the response schema had no `deletedAt`. So nothing could *name* the row to
restore. The endpoint was, in effect, decoration. Both are added, with an integration test that
deletes a row, fails to find it, finds it with `?includeDeleted=true`, restores it and sees it
back. **An endpoint that nothing can address is not a feature; check the read path before
believing a write path is finished.**

**The selection column belongs to the list, not to the row.** `LedgerRow` gained an optional
`selection` slot, and the grid only grows a column when it is used — an always-present
zero-width track still consumes a column gap, which would have nudged every ledger row in the app
sideways. The first version then dropped the checkbox for a *deleted* row, since a deleted row
cannot take part in a bulk change, and that shifted that one line — date, description and figure —
34px left of every other. A ledger whose amounts do not stack into one column has lost the thing
it is for. Deleted rows now render the checkbox hidden rather than absent, so the width is the
checkbox's own and cannot drift from it.

**A missing catalogue key can be perfectly consistent.** The bulk bar's Apply button called
`t('common.apply')`, which existed in no catalogue at all — so i18next rendered the key, and the
button read `common.apply`. The existing parity check compares the three locales *against each
other*, and a key missing from all three is consistent, so it passed. It was caught by a browser
looking for the button by its accessible name. `apps/web/scripts/check-i18n.mjs` now does both
halves — parity, and that every literal `t()` key resolves — and runs in CI. The same pass found
a fifth hardcoded English string (`"3 selected"` in the filter bar) beside the four already known
in `SplitsDialog`; all nine strings are catalogue entries now.

---

### Deliberately not built in this phase

- **OAuth login.** The `user_identities` table exists; no provider flow is wired up.
- **Push notifications.** `push_devices` exists and deliveries are recorded, then marked
  `skipped` — no provider is configured.
- ~~**Live exchange rates.**~~ Built — see "Live exchange rates: one provider interface" above.
  `EXCHANGE_RATE_PROVIDER=static` is still the default and still ships indicative BRL rates, so a
  checkout with no network behaves exactly as before.
- **PDF export.** CSV export and a structured statement endpoint are implemented; rendering to PDF
  belongs with the client, which has the layout.
- ~~**CSV import.**~~ Built — see "CSV import is preview-then-commit" above.
- **OpenAPI response schemas (phase 2).** Underway rather than absent: the mechanism is built and
  two modules are described — see "Response schemas live beside the service" above. The remaining
  modules still publish success as the `2XX` range with no content, and `apps/web/src/api/types.ts`
  stays hand-written until they do not.
