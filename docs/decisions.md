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

### One image, three entrypoints, and a migration that gates the rollout

`apps/api/Dockerfile` had existed for several sessions and had never worked. It was written
before `packages/schemas` did, and copied only `apps/api` — so `npm ci` could not resolve the
workspace dependency and `tsc` could not find its types. It also ended `RUN npm ci || npm install`,
which turned a lockfile mismatch into a silent fallback. Nothing ever built it, so nothing said so.

**One image, three entrypoints.** The server, the worker and the migration runner are the same
codebase by design, so they ship as one artifact and differ only by command. That is what makes
"the worker runs the same code the API does" true of the thing deployed rather than only of the
repository.

**The migration is a gate, not a sidecar.** `migrate` runs to completion and `api` and `worker`
wait on `service_completed_successfully`. A failed migration stops the rollout instead of leaving a
new binary talking to an old schema. *(Amended later: this lived in an `app` profile of
`docker-compose.yml` when it was written. A profile turned out not to be a boundary at all — see
"Development and deployment are two files" below — so it is now
`docker-compose.deploy.yml`, unchanged in every other respect.)*

Everything below was found by building and running the thing, and none of it is visible in a
review of the file:

- **`npm ci --ignore-scripts` does not stop a linked workspace's `prepare`.** `@finance/schemas`
  compiles itself that way, so a dependency stage holding only manifests dies on
  `TS5058: The specified path does not exist: 'tsconfig.json'`. The build copies the package whole
  and lets `prepare` do its job; the production tree then comes from `npm prune --omit=dev` rather
  than a second `npm ci --omit=dev`, which would hit the same wall with no compiler to run.
- **`--workspace` scopes which scripts run, not what is installed.** With `apps/web/package.json`
  in the context, npm installed the client's dependencies too and `prune` kept them — a workspace's
  own dependencies are not "dev". MUI, Recharts, Framer Motion and 58 MB of icon fonts were sitting
  in an API image. Omitting that one manifest took `node_modules` from 276 MB to 88 MB.
- **npm nests what it cannot hoist.** `i18next` landed in `apps/api/node_modules`, and a runtime
  stage that copied only the root tree produced an image that built, passed a file-existence check
  and then died on boot with `ERR_MODULE_NOT_FOUND`. Both trees are copied now.
- **`env_file` beats the image's `ENV`.** `.env` is a development file; without an explicit
  `NODE_ENV: production` in `environment:` the container ran as `development` and asked pino for
  `pino-pretty`, a devDependency the pruned image correctly lacks. pino throws on an unresolvable
  transport *at import*, so the process died before there was a logger to report it — a crash loop
  whose only clue was a stack trace about "transport target". `lib/logger.ts` now resolves that
  transport defensively as well, because a missing pretty-printer should cost pretty printing and
  nothing else.
- **Debian slim, not alpine**, for the same reason `docker-compose.yml` pins Debian Postgres: a
  musl image cannot exec its own `/bin/sh` under this machine's Docker Desktop/WSL2 setup.

**CI builds the image and boots its module graph**, which is the part that keeps this from rotting
again. `docker run … node -e "await import('/app/apps/api/dist/app.js')"` pulls in every route,
service and library the server touches without opening a socket to anything — exactly the check
that catches a missing dependency, and exactly what a file-existence pass misses.

Verified by running it: `migrate` applying eight migrations and exiting, `api` reporting
`{"status":"ready","database":"ok","redis":"ok"}` and healthy to Docker's own healthcheck, `worker`
registering all four queues and delivering an alert email, a registration and an authenticated
request round-tripping through the container, and a validation error coming back translated —
which is also the proof that `copy-assets.mjs`'s catalogues made it into the image.

---

### Dependency advisories are fixed by upgrading, and the gate is on what ships

`npm audit` reported nine advisories — one critical, three high, five moderate — across four root
packages: `kysely`, `nodemailer`, `react-router-dom` and `vitest`. `npm audit fix` without `--force`
was a no-op on every one of them; verified by running it, which reported no changes and the same
nine findings. Every fix therefore meant an explicit major-version decision, so each was made on
what the package does here rather than on the severity label.

**Two of the four are runtime dependencies of the API.** `kysely` 0.27.6 carried three high SQL
injection advisories, and `nodemailer` 6.10.1 carried eight, the worst of them a message-level
`raw` option that bypasses `disableFileAccess`/`disableUrlAccess` and turns a send into an
arbitrary file read and a full-response SSRF. None of the three Kysely advisories is reachable from
this codebase — there is no `sql.lit`, no `JSONPathBuilder`, no `Kysely<any>`, and the MySQL
escaping bug needs MySQL — but *reachability is not a fix*. It is an argument that has to be
re-made by hand every time the query layer is touched, by someone who remembers the argument
exists. Upgrading retires it. Both went to the current release: `kysely` 0.29.5 and `nodemailer`
9.0.5.

**`react-router-dom` had no in-major fix at all.** The open redirect via a backslash in `<Link>`
and `useNavigate` is fixed in 7.18.0, and no 6.x fix was published — 6.30.4 is the newest v6 on the
registry and the advisory's fixed range starts at 7.18.0. The choice was a major upgrade or an
unpatched redirect in a signed-in app. It went to 7.18.2 and needed **no source
change** — every import in `apps/web` (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`,
`NavLink`, `Link`, `useNavigate`, `useLocation`) is API-identical in v7.

**`vitest` went to 3.2.7 rather than to 4.1.10, and that is the one place the newest version was
deliberately not taken.** Vitest 4 removes `poolOptions` and documents `poolOptions.forks.singleFork`
as migrating to `maxWorkers: 1, isolate: false` — but those are not the same thing. `singleFork`
runs every test file in one process while still re-evaluating the module graph per file;
`isolate: false` stops re-evaluating it. That re-evaluation is load-bearing here: `component()` in
`openapi/schema.ts` evicts stale ids from Zod's process-wide metadata registry precisely because
`src/` is re-evaluated per test file while `node_modules` stays cached, and the guard it depends on
is a `Set` reset by that same re-evaluation. Taking vitest 4 would have meant reasoning about that
interaction to fix a critical that requires a `--ui` server this project never starts. 3.2.7 clears
every advisory in the tree with the config untouched, and vitest 4 stays available as its own
change, on its own merits.

That choice also **collapsed the vite tree from three copies to one**: vitest 2 pinned its own vite
5, while vitest 3 accepts `^6` and dedupes onto the root `vite` 6.4.3 that is pinned to force
exactly that kind of dedupe (see "CI gates on everything" above). The nested vite 5 and its
vulnerable esbuild are simply gone rather than patched.

**One source change was needed, and it is Kysely's.** 0.29 moved the migration API behind
`kysely/migration`; the root export now resolves to a `KyselyTypeError` that says so at compile
time, which is a good way to ship a move. `db/migrate.ts` and `db/migrations/index.ts` import from
the subpath now. Worth knowing separately: 0.28 removed `preventAwait`, so **awaiting a query
builder no longer throws** — it now resolves to the builder object. The bug in section 1 of
`CLAUDE.md` ("never return a query builder from an `async` function") is still a bug, but its
failure mode changed from a loud detonation to a silent wrong value.

**What the test suite could not prove, and what was done instead.** All 320 tests pass, which is a
strong signal for Kysely — they are real SQL against real Postgres — and a real signal for nothing
else. `sendEmail` short-circuits under `NODE_ENV=test` and never constructs a transporter, so the
nodemailer 6 → 9 jump was completely unexercised; it was verified by sending a real invitation
through the compiled `dist/lib/email.js` to MailHog and reading the delivered message back out of
MailHog's API, subject header correctly encoded. React Router has no tests here at all, so it was
verified in Chrome: the signed-out deep-link redirect, all eight sidebar routes, history back and
forward, a signed-in deep-link reload, and the unknown-path catch-all — fifteen checks, no
router-related console errors. Both follow the rule the redesign and i18n sessions arrived at
independently: a typecheck and a build prove the code parses.

**The CI gate is narrower than `npm audit` on purpose.** It fails on a high or critical advisory in
a **runtime** dependency (`npm audit --omit=dev --audit-level=high`) and reports everything else
without failing. A bare `npm audit` would block unrelated pull requests every time a build tool
publishes a dev-server advisory — the vitest chain above was four of the nine findings and none of
it ships in the image — and a gate that blocks for reasons nobody accepts is a gate that gets
deleted. The informational step keeps the moderate and dev-only findings visible, which is what
they warrant.

---

### Rate limiting is two-dimensional, and a forwarded header is only trusted when something sends it

The limiter looked right and was not. Reviewing it before a real deployment turned up three
defects that shared one shape: the code said what it meant to do in a comment, and did something
else, in a way nothing observable would ever contradict. A rate limiter that is quietly not
limiting looks exactly like a rate limiter with no traffic.

**`X-Forwarded-For` is a header the client sends.** `app.set('trust proxy', 1)` was unconditional,
with a comment claiming every deployment target sits behind one reverse proxy. This repo's own
compose profile publishes the API straight onto a host port with nothing in front of it. So
`req.ip` was whatever the caller wrote, and every IP-keyed budget could be reset by changing a
string — measured, against a running instance: six credential attempts from six invented addresses,
all allowed, against a limit of three. It is now `TRUST_PROXY`, defaulting to **false**. This is
the right default for the same reason `EXCHANGE_RATE_PROVIDER` defaults to `static`: the safe
configuration is the one you get by not knowing about the setting.

**A single key is not two dimensions.** Credential endpoints were keyed on `` `${ip}:${email}` ``,
under a docstring saying this stopped an attacker rotating IPs to brute-force one account. It did
the opposite of that. Every new address produced a new key, so rotation handed back the *whole*
budget, per address, against the same account — the combined key is strictly weaker than keying on
the account alone. They are two limiters now, charged independently: one per address over the
short window, one per account over a long one (`AUTH_RATE_LIMIT_MAX_PER_ACCOUNT`, fifteen minutes),
because the per-account bound is the one that has to survive an attacker who has addresses to
spare. Verified against a running instance: eight attempts on one account from eight different
addresses, cut off at the fifth, with a second account from those same addresses untouched.

**A limiter mounted above `requireAuth` cannot read `req.user`.** The global limiter keyed on
`req.user?.id ?? req.ip`, and is mounted on `/api/v1`, outside every `requireAuth` in the app —
so `req.user` was always `undefined` and it had been a pure IP limiter for its whole life. Nothing
failed; a whole office behind one address just shared 300 requests a minute and nobody could have
told you why. The identity is now recovered by verifying the bearer token in the limiter itself
(an HMAC over a few hundred bytes), and a request that fails verification is charged to its address
— which matters, because otherwise a stream of forged tokens would mint a fresh budget per request.
Both buckets are charged, not one or the other: the per-user budget is the everyday limit, and a
deliberately looser per-address budget stays as a backstop against a flood, or against someone
farming accounts from one place.

**The fallback needed to be smaller, faster and audible.** When Redis is unreachable the limiter
falls back to an in-process counter, which is right — a counter being unavailable must not become
an outage. But it fell back to the *full* budget, so N instances would together allow N times the
advertised limit at precisely the moment the system was least healthy; the budget is now divided by
`RATE_LIMIT_INSTANCES`. It was also completely silent, so it now says so once a minute. And it was
not, in fact, fast: with ioredis's offline queue on, a command issued during an outage is parked
until the connection returns rather than failing, so the first request after Redis stopped hung for
over two minutes behind the reconnect backoff instead of being served by the fallback that exists
for exactly this. `enableOfflineQueue: false` on that client fixes it — every consumer of it (the
cache, the limiter) already has an answer for "Redis said no" and none has one for "Redis has not
answered yet". BullMQ keeps the queue, because it issues blocking commands across reconnects.
Re-measured afterwards: 3 ms, at the divided budget.

**Failing open is a decision, so it is made per limiter.** Any store error used to call `next()`.
For ordinary traffic that is correct. For credential endpoints it means unlimited password guesses
for the duration of an incident, which is not a trade anyone would make deliberately, so those fail
closed. The refusal is a 429 rather than a 503 on purpose: the client's correct behaviour is
identical, the endpoint already publishes 429, and the distinction that actually matters — whether
we refused because you were over budget or because we could not tell — belongs in a log line, not
in a status code the client will treat the same way regardless.

Two smaller things, from the same read-through. CORS reflected *any* origin with credentials
whenever `NODE_ENV` was not literally `production`, which quietly included staging and preview
deployments — the ones actually exposed to a network; it is now an explicit list everywhere except
development. And the refresh cookie's `maxAge` was hardcoded to thirty days while the token's real
lifetime comes from `REFRESH_TOKEN_TTL_DAYS`, so shortening the token left the browser presenting a
credential the server had already stopped honouring.

### "Sign out everywhere" now means everywhere, via one nullable column

Revoking a session revoked its refresh token, which ends the session's ability to *renew* and does
nothing about the access token already in the user's hands. That token is a self-contained JWT: no
revocation reaches it, and it stays valid until it expires. So logging out every device, changing a
password, and deleting an account all left a working credential in circulation for up to fifteen
minutes — and the client's own password-change flow ends the session immediately, so the gap was
purely a server-side one that no UI would ever reveal.

The usual fixes are a per-request revocation-list lookup or a shared denylist cache, both of which
give back much of what stateless tokens are for. This needs neither, because `requireAuth` already
reads the user's row on every request to check the account is still active. `users.tokens_valid_from`
(migration `009`) rides along on that query: `revokeAllUserTokens` moves it forward, and a token
issued before it is refused. NULL means nothing has been revoked, which is what every existing row
wants to say.

**The token carries milliseconds, and that is not a detail.** A JWT's `iat` counts whole seconds,
and the first version of this compared against it. Within the second a revocation lands, "issued
just before" and "issued just after" are indistinguishable — so either a stale token survives the
click that revoked it, or the replacement handed out by signing straight back in is rejected by the
very next request. Truncating the cut-off to the second picks the first failure; not truncating
picks the second. Neither is acceptable and the choice is a false one: the access token now carries
its own millisecond `iatMs` claim, and the comparison is exact. Tokens minted before the claim
existed fall back to `iat` and are gone within a quarter of an hour anyway. There is a test named
after this, asserting that a user can sign back in *in the same second* they signed out of
everything.

---

### Money is typed the way it is read, and the amount is the subject of the dialog

A round of feedback from real use listed nine complaints about the interface, and opened by asking
whether the client should move to **shadcn/ui**. It did not, and the reason is the more useful half
of this entry.

**The complaints were ours, not the component library's.** A colour input that seized under a drag
was an `<input type="color">` wired to react-hook-form, re-rendering a fifteen-field dialog on every
event the OS colour wheel emitted. Four strings in the tag dialog were hardcoded English and stayed
English in Portuguese and Spanish. The "green square" around every text box was one global CSS rule
whose `outline` could not follow a radius the element did not have. None of those is a thing MUI
does to you, and none would have been prevented by a different set of primitives — a shadcn `Input`
bound the same way stalls identically. Against that, migrating meant rewriting 77 files and roughly
23,000 lines, re-expressing `theme.ts` as Tailwind variables, rebuilding `LedgerRow`, `Panel`,
`PageHeader` and sixteen dialogs, re-theming Recharts, and re-verifying nine screens that currently
work — with all nine defects still outstanding at the end of it. The stack decision from the first
session stands. **A rough edge with a root cause is an argument for fixing the cause, not for
replacing the layer underneath it.**

**What was actually missing was an entry layer.** The visual language written down in the redesign
governs every figure the app *displays* — mono, tabular, grouped, pointed by locale — and governed
nothing it *accepts*. An amount was typed into a plain text box as `1500`, sat at the same size and
weight as the optional "Merchant" field beside it, and only became a well-set figure after it was
saved. Two things follow from closing that gap.

**Keystrokes accumulate from the right, and the value is never a number.** `lib/moneyInput.ts`
represents an in-progress amount as a *digit string* — the figure in the currency's minor unit with
no separators, `150000` for one and a half thousand at two places. That choice pays for itself three
times. The caret is always at the end, so no edit can strand it inside a group separator that is
about to move, which is the failure mode every caret-preserving mask has around exactly the
separators this app inserts. The displayed value is always fully formatted, so recovering the new
state after any edit is *strip every non-digit* — one rule that covers typing, backspacing and
pasting an already-formatted amount without distinguishing between them. And the canonical decimal
is produced by splicing a `.` into the digits rather than by dividing, so nothing on this path is a
`number` and a balance past 2^53 cannot round on its way to the screen. The number of decimal
places is asked of `Intl` per currency, because JPY has none and KWD has three and a hardcoded 2
invents centavos for a yen amount.

**The amount is set as the subject.** `AmountHero` renders it in the display serif with the currency
as a quiet eyebrow and a statement rule beneath — the same hairline `LedgerRow` draws under every
line of money in the app, so the dialog reads as the first line of the statement it is about to
become. The rule doubles as the focus indicator, thickening and taking the accent, because a
control whose whole design is that it has no box cannot be given a box to say it has focus. On a
cross-currency transfer the received amount stays an ordinary field, and the *implied rate* is
printed under it: one display-size figure per dialog is the point of having one, and a decimal
point in the wrong place is obvious as a rate and invisible as a pair of amounts.

**The global focus ring is now scoped, and that is an accessibility change, so it was measured.** An
`outline` follows the element's own `border-radius`; the native `<input>` inside a field has none,
because the 14px radius belongs to the notched fieldset around it. The ring was therefore a hard
rectangle sitting outside a rounded control, and browsers match `:focus-visible` on a text input for
an ordinary mouse click, so it appeared on click and not only on tab. Fields now suppress it and
state focus with a 2px accent notch plus a soft halo, both of which follow the shape. **Everything
else keeps the ring**, checked by tabbing to a button and reading a computed `outline: solid 2px`
rather than by assuming the selector was narrow enough.

**One reversal.** The transactions filter bar used to hold all nine controls in a single grid, on
the reasoning recorded earlier that a finance app's most-used filters should never be a click away.
In use that was the wrong trade: nine controls of equal visual weight, most of them unlabelled
selects carrying their own name inside their value, reflowing into ragged rows — and still a click
into each one to see what it held. Search stays visible because it is typed into; the rest moved
behind one counted button, and what is currently narrowing the list is spelled out beneath as chips
that can be struck off individually. Nothing is further away than it was, and the row is legible
without opening anything.

**Two defects survived a clean typecheck and were caught by a browser.** `slotProps.input` on a MUI
`TextField` is the `InputBase` *wrapper*, not the input — an `inputMode` set there lands on a `div`
and no phone keypad ever sees it, and an `aria-label` there names a wrapper while leaving the field
unnamed. And the swatch constants are written in upper-case hex while `<input type="color">` returns
lower case, so comparing them with `===` left every swatch unselected and classified each one as a
custom colour. Both look right in source, compile, and are plainly wrong on screen. The verification
that found them drove the real backend in Chrome across thirty checks, in both English and
Portuguese.

**A note on what CI cannot see.** `npm run check:i18n` verifies that the keys a `t()` call names
resolve; it is structurally blind to a string that never calls `t()`. Ten of those were found by
reading the four dialogs in scope — a whole transfer-leg warning paragraph, a placeholder option, and
every transaction status name, which were printed by upper-casing the enum member. There is no check
that would have caught them, so touching a component means reading its JSX text.

---

### Glass on floating surfaces, not on the flat language

The brief that opened this session asked for glassmorphism across the whole interface — blur,
translucency, layered depth, on every input, card, modal and menu. Applying it everywhere would have
reopened "Visual redesign" and "Money is typed the way it is read" without cause: the flat,
hairline-driven statement language those two entries describe was a deliberate choice, checked
against real contrast ratios, not an unfinished default waiting for a treatment. **The request was
narrowed before any code was written**: glass on the surfaces the design language already singles out
as different — "shadow is reserved for things that genuinely float" is a sentence that was already in
`theme.ts` before this session touched it. Dialogs, menus, popovers and the transaction detail drawer
got a translucent gradient, a blurred backdrop and a layered shadow; cards, `LedgerRow`, `Panel` and
`StatTile` did not move.

**The permanent nav `Drawer` and the floating detail `Drawer` share one theme key, and only one of
them should be glass.** `MuiDrawer` in `theme.ts` styles every `Drawer` in the app, but the sidebar is
core chrome — read constantly, never really "floating" over content the way a dialog does — while
`TransactionDetailDrawer` is a transient reading surface that slides over the ledger. Theming the
shared key would have glassed the sidebar too. The fix was to leave `MuiDrawer` flat and apply the
glass treatment locally, via `PaperProps.sx` on the one `Drawer` instance that wanted it — the
opposite of the usual "put it in the theme" instinct, and the right call precisely because the two
uses are not actually the same kind of surface despite being the same MUI component.

**A toast system did not exist, so "confirmações visuais" meant building one, not restyling one.**
`components/Toast.tsx` is a small stack of glass `Alert`s (`variant="outlined"`, so the translucent
container supplies the surface and severity only tints the border, icon and text) with a
`useToast()` hook, wired into the create/edit/delete flows on Accounts, Transactions, Transfers,
Budgets and Goals. A create or edit that fails already shows an inline error in the dialog that stays
open, so only its success path toasts; a delete — which had no other feedback surface at all, success
or failure — toasts both ways.

**A dialog with more than about six fields reads as one undifferentiated column, and the fix was
grouping, not decoration.** `components/FormSection.tsx` borrows the eyebrow label `StatTile` already
uses for "TOTAL BALANCE" rather than adding a second bordered panel inside an already-glass dialog
paper. Applied to every multi-field dialog — Recurring, Transaction, Transfer, Account, Budget, Goal
— with section boundaries chosen per dialog (Details / Classification / Recurrence / Automation for
Recurring; Details / Balance / Appearance for Account; and so on) rather than one rigid template
forced onto every field list.

**One bug found this way had nothing to do with any of the above, and mattered far more.**
Wiring the toast into `AccountsPage`'s delete flow and watching the network tab showed the request
actually going out as `DELETE /api/v1/users/me` — the GDPR erasure endpoint — instead of
`DELETE /workspaces/:id/accounts/:id`. `apps/web/src/api/endpoints/accounts.ts` and
`apps/web/src/api/endpoints/users.ts` had both named a mutation `deleteAccount` on the same shared
RTK Query `api` object; `injectEndpoints` keeps whichever registers first and silently drops the
other's `query` function, so which one actually ran depended on unrelated module import order. The
UI reported success throughout, because the request genuinely did succeed — against the wrong
resource. Fixed by renaming the `users.ts` side to `eraseMyAccount`. **Nothing enforces a unique
endpoint name across files in this codebase, so a name collision fails silently and at the worst
possible layer — the correct-looking success path.**

---

### The phone is a first-class target, and the pointer decides the target size

Most of this app's use is expected to be on a phone, so the client was audited at an
iPhone-class viewport (390×844, touch, iOS user agent) by driving the real backend in Chrome
rather than by reading breakpoints. The structural verdict was that the responsive work already
done holds up: **no page-level horizontal overflow on any of the nine screens or the login
screen** (`document.scrollWidth === window.innerWidth === 390` throughout), the nav collapses to
a temporary drawer below `md`, every multi-column grid already uses the `minmax(0, 1fr)` tracks
that the redesign entry insists on, the charts are inside `ResponsiveContainer`, and the
transaction detail drawer is already `width: 100%` on `xs`. Nothing needed rebuilding. Four
things were nevertheless wrong, and only one of them was visible without a device-shaped
measurement.

**Every text field in the app zoomed iOS Safari in and never let it back out.** `theme.ts` set
the input slot to `0.9375rem`, and Safari force-zooms the page whenever a *focused* field
computes below 16px — then leaves the viewport there when the field blurs, so one tap on the
login box leaves the user panning a 390px layout inside a viewport that no longer fits it. The
desktop step is unchanged; a `max-width: 599.95px` query raises the field, and its label with
it, to 16px. This typechecks, looks perfect on a desktop, and is invisible to every test in the
suite.

**Two tables in Settings were clipped rather than scrollable.** The Reports tables carry an
`overflowX: 'auto'` wrapper; Members (four columns, measured 482px) and Invitations (six columns)
never got one, and they sit inside a MUI `Card`, which clips its overflow. So on a 390px screen
they were cut off at the viewport edge with no way to scroll to the remainder — which hid the
whole Actions column and left an admin unable to remove a member, transfer ownership, or revoke
an invitation *at all*. The page-level overflow check cannot see this: the document does not
overflow, precisely because the `Card` is eating the excess. **A table that fits the page is not
the same as a table you can read** — check the wrapper, not the document width.

**Touch targets are scoped to `pointer: coarse`, not to a width breakpoint**, because the thing
that decides whether a 30px glyph is big enough is the input device rather than the viewport. A
touchscreen laptop gets the larger targets and a narrow desktop window does not, which is the
correct way round. `COARSE_TARGET` in `theme.ts` is spread into `MuiButton`, `MuiIconButton` and
`MuiToggleButton`; `MuiListItemButton` takes the height half only, since the nav items already
run the drawer's full width. Verified: 8 of the 9 screens went from dozens of sub-44px controls
to zero, and the desktop layout is byte-identical because the query never matches there.

**Sizing the targets broke the thing the row exists to show, which is the more interesting
half.** Three action glyphs at 44px run to ~110px, and on the folded `LedgerRow` that column sat
between the description and the row's edge — so the descriptions collapsed to "Superm…" and
"Posto d…". The row's subject was being clipped so that its verbs could fit, which is worse than
the small buttons were. The fix is a change to the `xs` grid areas rather than a compromise on
either: `body` now spans the actions column too, so the description gets the row's full width
back; the controls drop onto the second line beside the category, which had dead space to spare;
and the figure keeps a line of its own, still flush right so amounts stack into one column. The
`md` template is untouched. **When a touch-target minimum and the content are fighting over the
same 390px, the layout is what should give — not the target and not the content.**

One unrelated defect surfaced while reading the Reports screen at phone size:
`StatementBudgets.tsx` rendered `{meta.label}` — the raw catalogue key `budgets.status.warning` —
where `{t(meta.label)}` belonged, alongside a hardcoded English `used`. `npm run check:i18n`
structurally cannot catch this. It verifies that the key a `t()` call *names* resolves, and a key
that is never passed to `t()` at all names nothing; the key itself is perfectly valid and is
rendered correctly by three other components. The same sweep found eight hardcoded English
strings in the two Settings tables. **A key held in an import-time table is only half the
pattern — the render site owes it a `t()`, and nothing in CI will tell you when it forgets.**

---

### A published secret is refused at boot, not documented as something to change

The pre-deployment audit's first critical finding was not a bug in any code path — every piece of
the token machinery it inspected was sound. It was that the machinery could be handed a key
everybody already has. `config/env.ts` accepted any `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
of sixteen characters or more; the placeholders in `.env.example` are longer than that; the
repository is **public**; the documented setup is `cp .env.example .env`; and the `app` compose
profile — the shape section "One image, three entrypoints" calls the deployed one — loaded that
same file with `env_file: .env` while forcing `NODE_ENV=production`. Every step of that path is
individually reasonable and the end of it is total authentication bypass: with the access secret
known, anyone forges a token for any `sub`, and `requireAuth` verifies the signature and then
trusts it completely.

The old mitigation was a sentence in `README.md` asking the operator to replace both values before
deploying anywhere real. **A security control that consists of remembering something is not a
control**, and this one had the additional problem that nothing anywhere would tell you it had
been forgotten — a stack running on the published key looks exactly like a stack running on a real
one.

So production now refuses to start. `config/production-policy.ts` judges each secret on four counts:
at least 32 characters; not one of the exact values this repository has ever published (the two
`.env.example` pairs, the CI throwaways, the OpenAPI generator's stub); not still *shaped* like a
placeholder (`change-me`, `placeholder`, a leading `dev-`); and at least ten distinct characters,
because `aaaa…` clears any length bar. The pair is judged together as well, since one value used
for both roles means a leak in either context is a leak in both — which is also half of M-11, the
finding about `JWT_REFRESH_SECRET` signing invitation tokens too. Development and the test suite
keep the sixteen-character floor: nothing they sign outlives the process.

Three things about the shape of that are deliberate.

**The check lives in its own module and imports nothing.** Same rule as
`middleware/rate-limit-policy.ts` and `modules/currencies/providers.ts`: the decision is the part
that can be quietly wrong, and it should be testable without an environment to stub.
`tests/unit/secret-policy.test.ts` runs in the unit lane with no infrastructure at all.

**Half of that test file is about false positives**, and that is the half that took the thought.
The patterns run against values that are legitimately random, so an anchored two-letter marker
like `^ci-` would fire on roughly one generated secret in 130,000 — which sounds like nothing
until it is the boot of a production deploy, and a check that cries wolf is a check somebody
turns off at the worst possible moment. The short markers were dropped in favour of the exact
list, and the test asserts 200 freshly generated secrets pass.

**`.env.example` still carries working values rather than `CHANGE_ME`.** The audit suggested
making them non-bootable outright; that would break `cp .env.example .env && npm run dev`, which
is the documented first five minutes of this repository, in order to defend a case the boot check
already covers. The values instead say what they are — `dev-only-insecure-access-secret-change-me`
— and are on the denylist, so they work in development and cannot reach production. The comment
above them states plainly that they are public knowledge.

The deploy profile stopped reading `.env` at the same time, because that was the pipe the secret
travelled down. The three `app` services now take an explicit `x-app-environment` block where the
two secrets are **required** compose variables (`${JWT_ACCESS_SECRET:?…}`, which stops the command
before it starts a container) and everything else carries a default matching `config/env.ts`.
Compose still interpolates from a local `.env` if one exists, so local overrides keep working;
what it can no longer do is silently pass a whole development configuration into a production
container. A placeholder that slips through anyway is refused a second time, by the API, at boot.

CI gates both directions. The existing "the image can load the whole app graph" step now generates
a fresh random secret per run — the image sets `NODE_ENV=production`, so the throwaways it used
before are exactly what is now refused — and a new step runs the same image with a published
placeholder and **fails if it boots**. A refusal that nothing exercises is a refusal that rots.

---

### Development and deployment are two files, because a profile was never a boundary

The audit's second critical finding rested on one fact about compose that is easy to read past: a
service declared **without** a `profiles:` key belongs to the *default* profile and starts
unconditionally. `docker compose --profile app up -d` therefore never selected the deployed stack.
It **added** `migrate`, `api` and `worker` to the development one.

So the command documented as "the deployed shape of the system" brought up, every time: Postgres
on 5432 with the password `finance`, Redis on 6379 with no password, no ACL and no TLS, and
MailHog — a mail sink whose whole purpose is to display messages to anyone who opens
`localhost:8025`, with no authentication — with both the API and the worker pointed at it. Every
workspace invitation link is a bearer token that grants membership to a workspace, and that UI
lists them.

The intent had been right and the mechanism could not express it. A profile is a *filter over one
composition*: it can add services to a run, and it has no way to say "and not those". The two
compositions do not differ by a few services either — they differ on whether a credential may have
a default at all, which is a property of the whole file. So they are two files:
`docker-compose.yml` for development, `docker-compose.deploy.yml` for a deployment, sharing
nothing but the repository.

**What the deployment file refuses to do.** No MailHog. No `ports:` on Postgres or Redis at all —
not a narrower binding, none, so they are reachable on the compose network and nowhere else, and
maintenance goes through `docker compose exec` or a tunnel. Redis takes `--requirepass`, and its
healthcheck authenticates through `REDISCLI_AUTH`, which `redis-cli` reads by itself, so the
password never appears on a command line inside the container. `POSTGRES_PASSWORD`,
`REDIS_PASSWORD`, both JWT secrets, `SMTP_HOST`, `API_BASE_URL` and `WEB_BASE_URL` are required
compose variables — `${VAR:?message}` stops the command before it starts a container — and the API
binds to `127.0.0.1` unless `API_BIND_ADDRESS` says otherwise, on the assumption that a reverse
proxy terminating TLS is what faces the internet.

**What the development file keeps, and what changed in it.** The well-known password and the open
mail sink stay: it is a database of demo data on a developer's machine, and the friction of a
generated password there buys nothing. What changed is that every published port now names
`127.0.0.1` explicitly, because Docker's `"5432:5432"` means `0.0.0.0:5432` — a laptop on a café
network was offering Postgres with the password `finance` to that network, and nothing in the file
said so.

**One rule crossed from compose into the application, and it is the more interesting half.**
`SMTP_HOST` defaults to `localhost` for MailHog. In production that default is not merely wrong, it
is *invisible*: `sendEmail` catches its own failures and returns `false` so that a mail outage
cannot fail the request that triggered it, and `createInvitation` does not read the return value.
A deployment left on the default therefore posts every invitation into a socket that refuses the
connection, and tells the admin who sent it that it worked. So production refuses to start with
`SMTP_HOST` naming a development sink.

That check is written against the **resolved value**, not against whether the variable was
present, and the first version got it wrong: `config/env.ts` loads `.env` through dotenv *into*
`process.env`, so by the time anything can look, "the operator never set it" and "the operator set
it to the development default" are the same state. `env -u SMTP_HOST` in the shell proved nothing;
the module booted happily on the `localhost` that dotenv had just put back.

`config/secret-policy.ts` became **`config/production-policy.ts`** in the same pass, since it now
holds two rules rather than one and the concept it names is "what production refuses to boot on".
The next one — H-4's cookie topology, most likely — has a home rather than an inline `if` in
`env.ts`.

**Verified by running it.** The deploy stack came up on generated credentials: all nine migrations
applied to a fresh volume, `migrate` exited 0, the API answered `/health/ready` on
`127.0.0.1:4100`, the worker ran. `redis-cli ping` with `REDISCLI_AUTH` cleared answered `NOAUTH
Authentication required`. `docker inspect` reported `map[5432/tcp:[]]` for both data stores — the
shape of "exposed, not published". And the image refused `SMTP_HOST=mailhog` under
`NODE_ENV=production`.

**Not taken from C-2's fix list:** TLS to Postgres and Redis (L-5) is still unconfigured, and a
managed database will want `sslmode=require`.

---

### An error response is written by this codebase, not by Postgres

`AppError` could carry a `rawMessage` that bypassed translation entirely, and `localize()`
returned it in preference to the catalogue. The reasoning written beside it was sound as far as it
went: a Postgres constraint `detail` is already English, and translating it would mean inventing
wording Postgres never said. What it did not ask is *what Postgres actually writes there*.

A unique violation writes `Key (email)=(someone@example.com) already exists.` A foreign-key
violation names the table it searched. A check violation quotes the failing row and the constraint
expression. And since `expose` is `status < 500` and those violations map to 409, 422 and 400, all
of it went out in the response body — in production too, where the guard suppressed only the
stack. So the API published its column names, its constraint names, and **values belonging to rows
the caller cannot otherwise read**: an account-creation conflict returned a workspace id and an
index definition, and a registration conflict would have confirmed an address.

`rawMessage` is now `internalDetail`, and the invariant is in the name: it is `Error.message`,
which is what the error handler logs, and `localize()` ignores it. Every sentence a client reads
comes from `i18n/locales/`. The generic wording for this was already there —
`database.conflict`, `database.foreignKey`, `database.constraint`, `database.notNull` and the rest
existed in all three catalogues and were simply being bypassed whenever a `detail` was present,
which is nearly always.

**The `P0001` branch goes the same way, which is the part worth arguing.** That code is
`RAISE EXCEPTION` from this repository's own triggers — text we wrote, not Postgres's — so keeping
it would have been defensible. It is dropped because every case those triggers catch is already
rejected earlier by the service with a translated message: `categories.depthLimit` for the depth
rule, a 404 from `getCategory` for a parent in another workspace. The trigger is a backstop against
a race or a hand-written statement, and `category hierarchy is limited to three levels` is wording
for whoever reads the log, not for an API client.

**The subtraction buys something.** A message that comes from the catalogue can be translated, and
a raw `detail` structurally cannot: a pt-BR caller now gets `Já existe um registro com esses
valores` where they used to get a sentence in English with a UUID in it. The fix makes the API
*more* useful to the client it was over-serving.

**M-1 came along with it**, because it is the neighbouring line of the same object. The response
included `stack` whenever `!env.isProduction && !appError.expose` — which is the same shape as the
CORS bug that "Rate limiting is two-dimensional" fixed: `NODE_ENV` is a three-valued enum, so
"not production" silently includes staging and preview deployments, and the stack carries absolute
filesystem paths and the internal module structure. There is no environment in which a client needs
it. An error body is now exactly `code`, `message`, `details` when there are any, and `requestId`.

**Tested at both levels, because neither is sufficient alone.** `tests/unit/errors.test.ts` pins
the mapping — each SQLSTATE to its status and catalogue sentence, the detail surviving on
`.message` for the log while `localize()` never repeats it, and the same failure rendering in three
languages. `tests/integration/error-disclosure.test.ts` provokes a **real** unique violation, by
creating two accounts with the same name — neither the accounts nor the tags service pre-checks its
name index, so this is a genuine path to a Postgres error rather than a simulated one — and greps
the entire serialised body for eight fragments that can only come from a `detail`. That the log
still carries the detail, the SQLSTATE and the request id was checked separately against pino's own
serializer rather than assumed.

---

### Erasure is a request, not an act

`DELETE /users/me` did exactly what it said: one transaction that hard-deleted every workspace the
caller solely owned — accounts, transactions, budgets, goals, reconciliations, every row hanging
off them — archived the shared ones, anonymised the user and revoked their tokens. What guarded it
was a valid access token and a body of `{ "confirm": true }`. No password, no recent-auth window,
not even the credential rate limiter. Any path that yields a fifteen-minute bearer token — a
borrowed laptop, a leaked token, a future XSS — was sufficient to destroy a person's entire
financial history, permanently, with one request.

Two of the three fixes were not in question: the endpoint now takes the current password and
verifies it, and it carries `authRateLimit`, because an endpoint that accepts a password is a
guessing oracle regardless of what it is for.

The third was a product decision and it went the recoverable way. **The request now schedules the
erasure rather than performing it**: `users.deletion_requested_at` is stamped (migration `010`),
every session is revoked, and a daily maintenance task does the real work once
`ACCOUNT_DELETION_GRACE_DAYS` — seven by default — has passed. The endpoint answers 200 with
`deletionScheduledFor` instead of 204, because "when" is the only thing the user needs and the
session is about to end.

**Signing in is the cancellation, and there is nothing else.** No cancel endpoint, no emailed
token, no support path: `login` clears the column when it finds one set. Proving you can still
authenticate is proof enough that you want the account, it works from any device the person still
has, and it is the one action someone who has changed their mind is certain to attempt. The cost
is that the mechanism is invisible unless the UI says so, which is why the dialog stays open after
the request to name the date and spell out that signing in calls it off.

Four details worth keeping:

- **Asking twice does not extend the countdown.** `requestAccountDeletion` reuses an existing
  `deletion_requested_at`. A second request must not quietly buy another week — the person asked
  once, and that is when they asked.
- **`eraseAccount` is a function now, not a route body.** The maintenance task and the endpoint
  must never become two definitions of "erased"; it was inlined in the handler before, where
  nothing else could reach it.
- **The sweep erases one account per transaction, and logs-and-skips a failure.** A thrown error
  in a retried job stops on the same row forever, which would silently stall every later deletion
  behind one bad one.
- **A shared workspace is archived rather than deleted**, unchanged from before: only the ones the
  user owns alone go with them, or other members lose records that were never theirs to lose.

The client had to change with it — the endpoint now 422s without a password, so the old
`ConfirmDialog` was no longer a valid caller. That is the honest shape of this finding: a
step-up-authentication fix is never only a server change.

---

### One origin, because the cookie says so

Three findings collapsed into one piece of work, and the collapse is the interesting part. **H-4**
said the refresh cookie could not function in the documented production deployment. **H-5** said no
Content-Security-Policy was set anywhere. **P-1** said there was no way to deploy the web client at
all: `npm run build --workspace=@finance/web` produced `apps/web/dist` and nothing on earth
consumed it. The fix for the first is the thing that serves the second's HTML, and both of them are
the third.

**The cookie problem was not a hardening gap, it was a broken deployment.** `setRefreshCookie` sets
`SameSite=Lax`, which is what stands in for CSRF protection on `/auth/refresh` — that route accepts
the cookie and nothing else. A browser does not send a `Lax` cookie on a cross-site fetch *at all*.
`apps/web/.env.example` documented production as `VITE_API_BASE_URL=https://api.example.com/api/v1`,
a different site from the client's own. So every session would have died at the first access-token
expiry: a refresh with no cookie, a 401, and `baseQueryWithReauth` signing the user out. Fifteen
minutes into every session, for every user, with nothing in the logs but a 401. It worked in
development only because Vite proxies `/api`, and the comment in `vite.config.ts` says exactly why.

Given the choice between same-origin and `SameSite=None` plus a CSRF token, same-origin won on
every axis: fewer moving parts, no new token to implement and rotate, `connect-src 'self'` becomes
possible in the CSP, and CORS stops being load-bearing. So `apps/web/Dockerfile` builds the bundle
and `apps/web/nginx.conf` serves it *and* proxies `/api` to the API container. One origin, one
certificate, one thing to publish.

**And the requirement is enforced rather than written down.** `crossOriginBaseUrls` in
`config/production-policy.ts` — the third rule in the file that C-1 created and C-2 renamed — makes
the API refuse to boot in production when `API_BASE_URL` and `WEB_BASE_URL` have different origins.
A deployment note would have been obeyed until the first time someone put the client on a CDN, and
the symptom (sessions ending at fifteen minutes) points nowhere near the cause.
`.env.deploy.example` accordingly has one `PUBLIC_URL` that fills both.

**Serving the HTML is what makes a CSP possible at all.** `helmet` sets headers on the API's JSON
responses, which is worth doing and is a different thing: a Content-Security-Policy,
`X-Frame-Options`, `Referrer-Policy` and HSTS only mean anything on the document a browser loads,
and nothing was loading a document from anything. The policy is `default-src 'self'` with exactly
one relaxation — `style-src 'unsafe-inline'`, because MUI and emotion inject `<style>` elements at
runtime. `font-src 'self'` needs no Google origin, because the redesign self-hosted all three
families through Fontsource; `frame-ancestors 'none'` because the transfer and delete flows are one
click each; `connect-src 'self'` only because of the proxy above.

Five things in that config file would each have been a real defect:

1. **`TRUST_PROXY=1` on the API service.** There is now genuinely one proxy in front, and section
   "Rate limiting is two-dimensional" is about what `req.ip` means. Left at `false`, every request
   would appear to come from the nginx container — the per-address budget would become one shared
   bucket for the entire internet, which is worse than no limiter, because it would also lock
   everyone out together. Measured after the change: three logins claiming three different
   `X-Forwarded-For` values drew down a single budget, 8 → 7 → 6.
2. **The upstream is a variable behind a `resolver`, not a literal host.** nginx resolves a literal
   `proxy_pass http://api:4000` once, at startup, and caches that address for the life of the
   process — so recreating the API container, which is what a redeploy *is*, leaves the proxy
   talking to an address nothing answers on until someone restarts nginx too. It also makes the
   file parseable outside the compose network, which is what lets CI run `nginx -t`.
3. **`add_header` in a `location` block replaces the inherited set rather than adding to it.** The
   headers are therefore repeated in `/assets/` and `/index.html`. Omitting them there is the
   standard way a carefully hardened site ends up serving one unprotected path.
4. **`always` on every header**, or they are attached to 2xx/3xx only — and an error page is HTML,
   which is precisely where a clickjacking frame would sit.
5. **`index.html` is `no-store` while hashed assets are `immutable`.** Caching the entry document
   pins a browser to the bundle of a build that no longer exists.

**M-10 rode along**, because it is the same class of mistake. `npm run seed` creates two accounts
whose password is published on GitHub and deletes any existing rows for them first. It now refuses
under `NODE_ENV=production` — and, more importantly, refuses when `DATABASE_URL`'s host is not
local. `NODE_ENV` is not the check that matters: nobody sets it before typing `npm run seed`. What
they get wrong is a `DATABASE_URL` still exported in the shell, and only the target database can
see that.

**Verified by driving the whole thing.** The composition was built and run, and Playwright drove
the real browser through it: 12 checks green, covering registration through nginx, the refresh
cookie landing on the app origin with `HttpOnly`/`Lax`/`path=/api/v1/auth`, a hard reload of
`/transactions` hitting the SPA fallback, every `/api/` request staying on the one origin, the new
erasure dialog rejecting a wrong password and then naming the deletion date, the session ending,
signing back in cancelling it, **no CSP violations in the console**, and no failed requests.

That run also surfaced a bug none of this work would have caused or caught otherwise: the
wrong-password message came back in **pt-BR** while the interface was in English. `RegisterPage`
sends `timezone` and `baseCurrency` derived from the device but never sent `locale`, so every
account was stamped with the API's `'pt-BR'` default — and because `requireAuth` prefers the stored
locale over `Accept-Language`, every server-rendered sentence for the life of that account came
back in a language its owner never chose, inside a UI that was obeying them correctly. One line.
**A form that collects a preference the API is willing to store should send it.**

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
- **Hosting.** The image and the compose profile exist and run (see "One image, three entrypoints"
  above), but nothing is provisioned anywhere: no registry, no TLS termination, no secret store.
- ~~**CSV import.**~~ Built — see "CSV import is preview-then-commit" above.
- **OpenAPI response schemas (phase 2).** Underway rather than absent: the mechanism is built and
  two modules are described — see "Response schemas live beside the service" above. The remaining
  modules still publish success as the `2XX` range with no content, and `apps/web/src/api/types.ts`
  stays hand-written until they do not.

---

### Password reset and email verification, and why they get their own signing secret

Finding **H-1**, the first item of `AUDIT_REPORT.md`'s Phase 2. `CLAUDE.md` had claimed since
session one that both existed; neither did. `authRouter` mounted seven routes and none of them was
a reset or a verification, and `users.email_verified_at` was a column only the seed script ever
wrote. Two consequences followed directly: a forgotten password was permanent lockout, and
`acceptInvitation` authorised membership by comparing an invitation's email to `users.email` as a
plain string — so anyone who learned that `victim@example.com` was about to be invited to a
workspace could register that address first and accept the invitation before its real owner ever
proved they controlled it.

**Both flows reuse the shape `workspaces/invitations.ts` already demonstrated**: a random token,
only its HMAC persisted, a short TTL, single use. What they do *not* reuse is
`JWT_REFRESH_SECRET`, which that same file uses as its HMAC key — and which also signs every
refresh token. Finding **M-11** already named that as a problem (rotating the secret after a leak
silently invalidates every outstanding invitation, and a weakness in one context reaches the
other); handing a *third* purpose to the same secret would only have made it worse the day someone
finally fixes M-11 properly with HKDF subkeys. A new `EMAIL_TOKEN_SECRET` — held to the identical
production bar as the two JWT secrets in `production-policy.ts` (length, entropy, not one of this
repository's published placeholders, not shared with either JWT secret) — signs password-reset and
email-verification tokens instead. `hashEmailToken` in `modules/auth/tokens.ts` is the one place
that touches it.

**The columns are nullable pairs on `users`, not a new table.** `password_reset_token_hash` /
`_expires_at` and `email_verification_token_hash` / `_expires_at` (migration `011`) follow the
precedent `deletion_requested_at` (migration `010`) set: at most one outstanding request per
purpose per user, and a fresh request simply overwrites the last one, which is exactly the right
behaviour — only the newest emailed link should work.

**Registration now sends a verification email, best-effort, the same way an invitation email is
best-effort.** `sendEmail` already logs and swallows its own failures rather than throwing, on the
reasoning that an unreachable SMTP host must not fail the request that triggered the message; that
reasoning applies identically here, so `register()` awaits it but nothing about the response
depends on whether it actually got sent.

**`POST /auth/forgot-password` always answers 204.** Whether the address has an account is decided
inside the service and never reflected in the response — the whole point, since the alternative
is an enumeration oracle. `POST /auth/reset-password` and `POST /auth/verify-email` are both
unauthenticated by design: the token *is* the proof of control over the inbox, and a verification
link in particular may be opened on a device that never held a session at all (a webmail
provider's own preview pane, a different browser).

**A successful reset signs the caller in**, returning the same shape `login` does — `user`,
`accessToken`, `refreshToken`, `expiresIn`, `defaultWorkspaceId` — rather than requiring a second
round trip through the login form with the password just chosen. It revokes every other session in
the same transaction as the password change, for the same reason `changePassword` already does:
a reset is exactly the moment a previous, possibly-compromised session should not survive. And it
calls `cancelAccountDeletion` when one is pending, for the same reason `login` does — proving
control of the account, here by controlling the inbox behind the reset link, is what calls off a
scheduled erasure, and a reset flow that signs the user in inherits that obligation rather than
being a second, forgotten path around it.

**`acceptInvitation` now also requires `email_verified_at IS NOT NULL`** on the accepting account,
checked alongside the existing email-string match. Matching the address was necessary but not
sufficient — proving control of it is what the string comparison was silently assuming all along.

**What this did *not* do: M-9.** Registration still answers 409 on a known email
(`auth.emailTaken`), which is a narrow but real enumeration oracle — `authRateLimit`'s per-address
bucket bounds it at ten attempts a minute, and the per-account bucket does not help since every
probe uses a different candidate address. The audit's own fallback for M-9 was to accept the
trade-off explicitly rather than force registration into an "always 201, and either a welcome or an
account-exists email" shape, which is a real UX change to the one screen every new user sees first
and deserves to be decided on its own rather than folded silently into this entry. Left open,
deliberately, for a session that wants to spend it.

**Verified against a real Postgres, a real SMTP sink, and a real browser, not only unit tests.** 8
new integration tests cover: registration sends a verification email and the account starts
unverified; verifying unblocks an invitation that was rejected before verification and accepted
after; an unknown or already-used verification token is rejected; resending is a no-op once
verified; `forgot-password` answers 204 for both a real and an unknown address; a reset changes the
password, signs the caller in, and revokes the session that existed before it; an unknown or
expired reset token is rejected; and a reset cancels a pending account deletion. All four new
operations are exercised by a passing test (`RESPONSE_REACH=1`), and the full 381-test suite stayed
green. Beyond that, Playwright drove the real dev stack end to end through MailHog: register, see
the unverified banner, follow the emailed verification link, watch the banner clear without a
reload, sign out, request a reset through the emailed link, land back on the dashboard already
signed in, and confirm the old password is rejected while the new one works. The only surprise was
in the *test tooling*, not the app: MailHog serves the raw SMTP wire body, which is
quoted-printable encoded, so a 40-odd-character token routinely acquires a soft line break or an
escaped `=` inside it — invisible if you only read `sentInTests` in the unit/integration suite,
since that outbox holds the message before MIME encoding.

---

### A stored URL is only as safe as the schemes it can name

Finding **M-2**. `packages/schemas/src/fields.ts`'s `urlField` was `z.string().url()` and nothing
else, and Zod's `.url()` parses `javascript:alert(1)`, `data:text/html,<script>…`,
`file:///etc/passwd` and `vbscript:x` as successfully as it parses `https://example.com` — a URL's
grammar does not care what scheme it names. The field backs `avatarUrl`, which every other
workspace member's browser fetches to render an `<img src>`. None of those schemes execute there,
so this was not live script injection, but a `data:` or `javascript:` avatar link is still a
tracking beacon (IP, User-Agent, viewing time) an attacker gets to choose, fired at everyone who
shares a workspace with the account that set it — and it is one refactor into an `<a href>` away
from becoming exactly the injection it currently only resembles.

**The fix is one predicate, `isSafeUrl` in `patterns.ts`: parse with the real `URL` constructor and
require `protocol === 'https:'`.** Nothing more elaborate was needed — the vulnerability was never
about URL *syntax*, only about which schemes were allowed to reach a sink that treats a value as
"safe to fetch."

**Unconditionally `https:`, not "`https:` in production, `http:` elsewhere," which is what the
audit itself suggested.** `@finance/schemas` is deliberately I/O-free and environment-blind — the
same constraint `production-policy.ts`, `rate-limit-policy.ts` and `providers.ts` are written under,
for the same reason: the decision is the part worth testing without an environment to stub, and a
package that reads `NODE_ENV` to decide what it accepts stops being that. It would also not have
bought anything: a development or staging deployment is exactly as multi-user as production, so the
tracking-beacon risk does not become acceptable just because a build flag says "not production."

**The predicate lives beside the other shared shapes, not inside `fields.ts` alone, because the web
client needed it too.** `features/settings/settingsSchemas.ts` had its own hand-rolled
`optionalUrlSchema`, built from `z.string().url()` directly rather than from anything in
`@finance/schemas` — the exact drift section 5c's shared-schema package exists to end, just not yet
noticed for this one field. It now calls `isSafeUrl` as a second `.refine()`, so a `javascript:`
avatar link is rejected while typing rather than after a round trip that returns the same rejection
translated. A new catalogue key, `validation.urlProtocol`, carries the message in all three
languages, the same as every other shared rule.

**`urlField` gained a `.meta()` alongside the real `.refine()`**, for the same reason `moneyField`
and `dateField` already have one: `z.toJSONSchema()` drops a `.refine()` silently, so without it the
generated spec would keep describing `avatarUrl` as `format: uri` with no hint that most URIs are
now rejected — a spec that undersells its own strictness is a spec a consumer will code against
incorrectly. The `^https://` pattern is documentation of a real constraint here, not a restatement
that could drift from the check the way the money field's warns against, since both live in the one
`isSafeUrl` call.

Verified two ways: `apps/api/tests/unit/shared-schemas.test.ts` pins `isSafeUrl` against all four
rejected schemes plus a plain non-URL string, and checks `urlField.safeParse(...).success` agrees
with it at every one of those values, which is the same "the field and the predicate must not
disagree" shape every other shared rule in that file is tested with. And against the real running
API: a registered account's `PATCH /users/me` was sent `javascript:alert(1)`, a `data:` URL and
`http://example.com/a.png`, each answering 422 with `validation.urlProtocol` — rendered in pt-BR,
the account's default locale, without anything in this fix touching translation — while
`https://example.com/a.png` on the same account answered 200.

---

### A connection is reclaimed by the server, and a shutdown waits for what it owes

Findings **M-4** and **M-5**, taken together because they are two failure modes of the same
resource — a database connection held longer than it should be — one at the query level and one at
the process level.

**M-4: nothing stopped a slow query from running forever, or a request from waiting forever for
one.** `createPool` set a pool size, an idle timeout and a connection timeout, but nothing bounded
how long a *query* — or a transaction left open mid-request — could hold the connection it had
already acquired. Ten concurrent slow analytics queries or report exports were enough to exhaust a
pool of ten with nothing available to reclaim it, at which point the process stops serving anything
at all, not just the slow endpoint.

The fix is two settings passed straight into `pg.Pool`'s config — `statement_timeout` and
`idle_in_transaction_session_timeout` — which `pg` sends as Postgres session parameters at
connection time. No `SET` statement anywhere in this codebase; every pooled connection carries both
from the moment it is established. `DATABASE_STATEMENT_TIMEOUT_MS` defaults to 15s,
`DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS` to 30s — generous for this app's own query shapes (nothing
here is an OLAP workload), tight enough that a genuinely runaway query cannot sit on a connection
indefinitely.

That closes the database side. It does not close the *client-facing* side: a handler doing real work
that is not database-bound at all — CPU-heavy formatting, a stuck call to an external service —
could still hang a request past any reasonable wait. `middleware/request-timeout.ts` is the
backstop: mounted on `/api/v1` alongside `globalRateLimit`, it starts a timer per request and answers
503 if nothing has responded by `REQUEST_TIMEOUT_MS` (20s, deliberately looser than the statement
timeout so an ordinary slow query times out at the database first and this only fires for something
else).

**It cannot cancel the handler still running behind it.** Node has no general mechanism to abort an
arbitrary in-flight async function, so the original work keeps running after the client has already
been told 503 — and if it eventually finishes and calls `res.json(...)`, that is a second write to a
response that already ended. `errorHandler` had no guard for this because nothing before this could
put it in that state: every existing error occurred *before* any response was written. It now checks
`res.headersSent` first and, when true, calls Express's own default error handler via a bare
`next(err)` instead of trying to render a body — which is what actually stops there, by destroying
the connection rather than throwing a second `ERR_HTTP_HEADERS_SENT` at the same problem.

`/health/ready` already declares its own real 503 (`readinessResponse` — `status`, `database`,
`redis`), and the generated document has to keep that: `responsesFor` in `openapi/document.ts` now
adds the generic `ServiceUnavailable` component to every route *except* one that already declared a
503 of its own, or the generic component would silently overwrite the specific one on exactly the
route where a probe most needs the real answer.

**M-5: shutdown destroyed the pools before waiting for `server.close()` to actually finish.** The
comment above the old code said "release the pools so in-flight requests get a chance to finish";
the code did the opposite — `server.close(callback)` is asynchronous and fire-and-forget unless
awaited, and `Promise.allSettled([closeDatabase(), closeRedis()])` ran immediately, in parallel with
it. A request still executing when the pools vanished lost its database connection mid-query. On a
rolling deploy that is a 500 for whoever's request landed in that window, and for a multi-statement
handler outside a transaction, partial work.

The fix is `closeServer()`, a one-line promisification of `server.close`, `await`ed before the pools
are touched — with the existing 10-second `setTimeout` ceiling left exactly where it was, still
bounding the *whole* sequence rather than just the pool teardown. That ceiling still matters even
with the fix: an idle keep-alive socket can leave `server.close()`'s callback waiting indefinitely
for a client that never disconnects, and the timeout is what stops that from hanging a shutdown
forever.

**Verified in a real Linux container, not by reading the code — Windows could not reproduce this at
all.** `process.kill(pid, 'SIGTERM')` and `'SIGINT'` sent from an external process on Windows
terminate the target unconditionally; they do not invoke the JS `process.on('SIGTERM', …)` handler
the way a POSIX signal does. A first attempt against a `tsx watch`-run dev server confirmed exactly
that: the process vanished with no shutdown log line at all. The only environment this fix actually
runs in is Linux — the deployed image — so that is what was tested: `docker build`, run against the
existing dev Postgres/Redis network, `BCRYPT_ROUNDS` raised to widen the race window, a slow
`POST /auth/register` fired and `docker stop` (real SIGTERM, real 10s grace period, the same
mechanism `docker compose down` uses) sent a moment later. The log line order is the proof:
`"Shutting down"` (SIGTERM received) came first, then the register request completed `201` a beat
later, and only then `"HTTP server closed"`. The old code, run the same way, would have raced the
pool teardown against that still-executing request instead of waiting for it.

Both findings picked up their own test coverage: `tests/unit/db-client.test.ts` builds a pool against
an unreachable address (the pool is lazy — nothing dials until a query runs) and asserts the two
timeout options are actually on it, and `tests/unit/request-timeout.test.ts` drives the middleware
with fake timers and a bare `EventEmitter` standing in for `res`, covering the ordinary pass-through
path, the 503-on-deadline path, and the two ways the timer must *not* fire — response already
finished, and headers already sent by something else.

---

### A tested restore, not a promise of one — and the rest of Phase 2

Findings **P-3**, **P-2**, **M-8** and **P-5** close out Phase 2. Grouped here because each one
turned out to split cleanly into a half this repository can actually build and prove, and a half
that only means anything with a real external account or a production data volume neither of
which exist in this environment — and the discipline that matters across all four is naming that
split explicitly rather than either skipping the finding or faking the missing half.

**P-3: backups.** The honest starting point is that `pg_dump`/`pg_restore` is a *logical* backup,
not the point-in-time recovery a financial ledger's own RPO probably wants once it holds real
money rather than seed data — continuous WAL archiving needs a place to archive to, and true PITR
needs either a managed Postgres or a hand-rolled `pgbackrest`/`wal-g` setup, neither of which
belongs in an application repository's own commit. What a `pg_dump` *does* buy, honestly stated
rather than oversold, is a real, restorable, tested point-in-time copy on whatever schedule an
operator's cron or systemd timer calls `scripts/backup.sh` — which is strictly more than the
nothing that existed before it, and the audit's own fallback option for exactly this reason
("scheduled base backups... and a documented restore that has actually been performed once").

`backup.sh` and `restore.sh` both run through the *running Postgres container*
(`docker compose exec -T postgres pg_dump/pg_restore …`) rather than assuming a host-installed
client. That was not a stylistic choice — it is what makes the same script correct on a Windows
dev machine, a Linux CI runner and a Linux deploy host without three different install steps, and
it guarantees the dump/restore tools are always the exact version paired with the database being
backed up, never whatever happens to be on `$PATH`.

**`restore.sh` is genuinely destructive** — `pg_restore --clean --if-exists` drops every object
already in the target database before recreating it — so it always names exactly what it is about
to overwrite and refuses to proceed without a trailing `--yes`. That is the mirror image of
`npm run seed`'s `--i-know-this-is-not-a-demo-database` guard (M-10, section 5n): seed's guard
protects a real database from a *destructive write it should never receive*; restore's guard
exists because restore's whole *purpose* is a destructive write to a database that, in a genuine
disaster-recovery moment, is very likely the production one — so the guard cannot refuse the
target the way seed's does, only make certain the operator has actually looked at what they typed.

**The restore was performed, not asserted.** Against the real dev stack, seeded with
`npm run seed` plus several sessions' worth of accumulated demo accounts (74 users, 70 workspaces,
38 accounts, 226 transactions, 3,920 categories): `npm run backup` produced a 300 KB dump in 1.6
seconds; that dump was restored into a throwaway `finance_restore_test` database (never the real
one) in 21 seconds; every row count matched exactly, and a four-table join (`users` →
`workspaces` → `accounts` → `transactions`, grouped and counted) returned byte-for-byte identical
rows against both databases. At this data volume that implies an RPO bounded only by how often the
job runs (hourly is cheap at 300 KB and 1.6s) and an RTO around half a minute including the
container round trip — numbers that will not hold at real production scale, where a `pg_dump` of
a genuinely large ledger can run for hours and a restore longer still, which is precisely the
point at which "logical backup on a cron job" stops being sufficient and PITR stops being
optional. That ceiling is exactly why this entry keeps saying "logical, not PITR" rather than
"backups: done."

**P-2: observability.** Splits the same way. `GET /metrics` in the standard Prometheus text
format — default Node/process metrics, an HTTP request duration histogram and counter, Postgres
pool saturation, and a `redis_connected` gauge — is genuinely useful today, needs no account
anywhere, and is exercised by a real integration test
(`response-contracts.test.ts`'s "exposes Prometheus metrics" case, which makes a `/health`
request and then asserts `/metrics` actually recorded a `route="/health"` series — proving the
label logic fires, not just that the registry exists). An error tracker and distributed tracing
are the other half, and neither was built: a Sentry client with `SENTRY_DSN` unset, or an
OpenTelemetry exporter with nowhere to export to, is not a smaller version of the feature — it is
dead code shaped like a finished one, which is worse than an honestly-empty gap because it reads
as "handled" on a diff. **This is the entry `docs/decisions.md`'s other "deliberately not built"
notes point at**: the same reasoning that kept OAuth login and push notifications out of session
one applies here — building the *provider-agnostic* shape of a thing nobody can turn on yet is
effort spent on a feature that does not exist until someone supplies the missing account, at which
point it is a day of real work either way.

**The HTTP metrics label by route *pattern*, deliberately, never by raw path.**
`middleware/metrics.ts` reads `req.route` from inside a `res.on('finish', …)` handler rather than
where the middleware itself runs — Express has not matched a route yet at that point, since this
middleware sits ahead of the router in the stack, and `req.route` is only populated once dispatch
actually reaches a handler. The `finish` event fires after the whole cycle, routing included, so
by then it is set for anything that matched. Labelling by `req.path` instead would have looked
identical in every test and then quietly minted one Prometheus time series per workspace ID (or
transaction ID, or any other UUID segment) in production — the exact cardinality explosion
Prometheus's own documentation warns is the most common way to make a metrics backend fall over.
An unmatched request (a 404, a scanner probing random paths) is bucketed under the fixed label
`'unmatched'` for the identical reason.

**`redis_connected` was written to double as an existing gap's answer, not as a new metric for
its own sake.** `middleware/rate-limit.ts` already logs "Rate limiting is running on the
per-process fallback" once a minute when Redis is unreachable — precisely the warning P-2 named as
having nothing to alert on. That warning's condition is `redis.status !== 'ready'`, which is also
exactly what the gauge reports, so an alert on `redis_connected == 0` *is* an alert on that
warning; no second code path was needed. `infra/prometheus/alerts.example.yml` writes that rule
out explicitly, alongside error rate, readiness failures, pool saturation and p99 latency — not
wired into anything, since there is no Prometheus deployment in this repository to wire it into,
but a concrete answer to "what would you alert on" rather than a paragraph promising one exists.

**M-8: source maps.** The smallest of the four and the one place a real choice had to be made
between the audit's two suggested fixes. `sourcemap: 'hidden'` — maps built but not linked from
the served JS — is the better answer *once something uploads them to an error tracker*, which is
exactly the P-2 half that was not built. Shipping `'hidden'` maps with no upload step would just
be unused files sitting in the image with no consumer, which is not meaningfully different from
the `true` this replaces. `sourcemap: false` is what actually matches what this deployment does
today; revisit it together with wiring a real error tracker, not before.

**P-5: invitation delivery failures.** `createInvitation` always called `sendEmail` and never read
what it returned — `sendEmail` itself already swallows a failure (an unreachable SMTP host must
never fail the request that reserved the seat), so the previous behaviour was silently correct
about not breaking anything and silently wrong about telling anyone. The fix reads the boolean,
folds it into the response as `emailDelivered`, and logs a line — `"Invitation created but its
email failed to send"` — distinct from `sendEmail`'s own generic `"Email delivery failed"`, so an
operator grepping logs can tell an invitation-shaped failure from a notification-shaped one.
`InvitationsSection.tsx` shows a warning toast rather than the ordinary success one when
`emailDelivered` is `false`. **Deliberately not built: retrying the send.** The audit's own
phrasing — "the notification path already retries via `processDeliveries`" — is context for why
invitations do not need the same machinery, not an instruction to add it: a notification is a
convenience copy of something already visible in-app, so a queued retry costs nothing if it lands
late; an invitation *is* the only way the invitee can join at all, so what actually matters is the
admin knowing immediately that it needs a manual follow-up, which is what surfacing the failure
provides directly.

Verified against the real dev stack, not stubbed: MailHog stopped, an invitation created —
`emailDelivered: false` in the response, both log lines present; MailHog restarted, another
invitation created against the same workspace — `emailDelivered: true`, real mail landing in
MailHog same as before this change.

**What P-2 and P-5 have in common with M-9 (section 5o) is worth naming.** All three are cases
where the honest scope of "done" is narrower than the finding's title, and the discipline that
mattered was writing down the narrower scope rather than either overclaiming or leaving the
finding half-addressed with no note explaining why. A future session picking up an error tracker,
real tracing, or PITR is not fixing something broken here — it is doing the part that was always
going to need infrastructure this repository cannot provision on its own.

---

### Six small findings, each closed in the file it lives in

Findings **L-1, L-3, L-4, L-8, L-9 and M-6** — grouped because each is a self-contained bound or
guard rather than a design question, and none needed anything this repository cannot already
provide.

**L-1: `x-request-id` is adopted, not merely capped.** A 128-character length limit alone still let
a client hand the process a newline or a control character, which then went verbatim into every
log line for the request and into the echoed response header — log injection and correlation-id
poisoning. `middleware/request-context.ts` now matches the incoming value against
`/^[A-Za-z0-9_-]{1,128}$/`, the same charset every real generator of one of these (a UUID, a ULID,
a trace id) actually emits, and falls back to a fresh `randomUUID()` for anything else — including
an empty string or one over the length cap, which fall out of the regex without a separate check.
There is no attempt to *sanitise* a bad value into something safe; a string that needed sanitising
already proves the caller sent something the id was never meant to carry, so it is simpler and
safer to treat it exactly like a missing header.

**L-3: `csvUuidArray` gained an element-count cap.** `?accountIds=<10k uuids>` was a single
enormous `IN` clause away, because the schema accepted a comma-separated list of any length before
`UUID_PATTERN` even started checking individual entries. A workspace's own accounts, categories or
tags — the three things this filters — number in the dozens at most, so 100 is generous headroom
that stops the attack without narrowing any real use. `csvStringArray`, the unused sibling two
lines below it in the same file with the identical shape, was left alone: fixing a bug in code
nothing calls yet is not the same as leaving one live, and it can pick up the same cap the day it
gets a caller.

**L-4: the credential limiter's account bucket is keyed by a hash, not the address.** A Redis key
is not a secret store, and `rate-limiter-flexible` logs its own keys on some code paths — so
`account:someone@example.com` was one `KEYS account:*` or one log line away from telling anyone who
had attempted to sign in. `accountKey` now normalises the address exactly as before and then runs
it through SHA-256; an HMAC was considered and rejected, because nothing about this key needs to be
unforgeable, only to not *be* the address — every request for the same account still has to hash to
the same key or the budget it names stops meaning anything, which a keyed HMAC would not have
bought anything extra for.

**L-8: `page` has an upper bound.** `pageSize`'s own 200-row cap already bounded the *width* of a
requested page, but nothing bounded how deep `?page=` could ask an `OFFSET` to scan — a caller could
name page 999,999,999 and make Postgres walk that far into a result set before returning nothing.
100,000 pages is a ceiling nothing in this application's own lists could reach honestly, so nothing
real is lost by refusing anything past it.

**L-9: the `.tmp/` load-testing scratch is gone from the working tree.** It was already gitignored
— never a repository-history problem — but a stray `token.txt` holding a real (if demo-account)
JWT and a handful of one-off `loadtest*.mjs` scripts sitting in the tree is exactly the kind of
thing a future session mistakes for something that matters. Deleted outright rather than archived;
nothing in it was load-testing infrastructure worth keeping, only its output.

**M-6: `/imports/preview` has its own rate-limit budget, and an oversized body is rejected before
any database work.** The general per-user budget (300/min) never distinguished a CSV import — full
parsing, three-language header inference, date-layout inference and per-row duplicate detection
against the ledger — from a cheap `GET`. `importPreviewRateLimit` (`middleware/rate-limit.ts`) is a
fifth independent budget, 5/minute per signed-in user, mounted only on this one route; it can be
keyed on `req.user!.id` directly rather than verifying a bearer token itself, unlike
`globalRateLimit`, because everything under `/workspaces` already sits behind `requireAuth`.

The size check is the more interesting half. The audit's own suggested fix — add `.max()` to the
Zod schema — turns out not to compose cleanly with this codebase's translation machinery: a Zod
`.refine()` failure only auto-translates when its message is a `validation.*` key from
`@finance/schemas`, and this bound (`MAX_IMPORT_BYTES`, 512 KB) is API-only — the web client never
independently declares it. Reusing the exact `AppError` `previewImport` already threw for the same
condition, in a small dedicated middleware (`rejectOversizedImportBody`) that runs *before*
`requireEditor` and `validate()`, was more correct than inventing a second, differently-worded way
to say the same thing: same params, same localisation, and now it also runs before `getAccount`'s
database round trip instead of after it — which is the actual cost the audit's finding was about,
since `express.json`'s existing 1 MB body limit already bounded the memory cost regardless of where
in the pipeline the rejection happens.

Verified against the real dev stack, not only the integration suite: with
`IMPORT_PREVIEW_RATE_LIMIT_MAX_REQUESTS=2`, two previews against a real account succeeded and a
third answered 429; a 600 KB body against a *nonexistent* account answered 400 (not the 404
`getAccount` would have produced had it been reached), rendered in the account's default
locale — proof the size check runs first and reuses real localisation, not a stub.

---

### `/openapi.json` is public on purpose (L-2)

Finding **L-2**: the specification is served unauthenticated at `GET /openapi.json`, publishing
every path, every request shape and which role each one requires — admin-only routes included —
to anyone who asks. The audit's own framing is right: this is defensible, but it had never been a
decision anyone wrote down, only a default nobody revisited.

**The decision is to keep it public.** Three reasons, each sufficient on its own:

1. **It describes shapes, not data.** The document is generated by walking the Express router and
   converting Zod schemas (`openapi/document.ts`) — it contains no row, no credential, and no
   information about which *workspaces* or *users* exist. Everything in it is already implied by
   reading this repository, which is itself public.
2. **The alternative degrades the one thing that makes the document trustworthy.** Its entire value
   — see "The OpenAPI document is generated from the app that boots" earlier in this file — is that
   it cannot drift from the code, because CI regenerates and diffs it on every change. Gating it
   behind auth would not remove that property, but it would remove the property that lets a
   prospective integrator, a security researcher, or a new contributor read the API's real shape
   without first obtaining a token — which is a real cost for a public repository whose whole
   premise is that the code is already the documentation.
3. **Knowing a route exists and requires `admin` is not the same as being able to call it.** RBAC is
   enforced server-side on every request (`withWorkspace` + `requireRole`, section 6), independent
   of who has read the specification. Publishing "this route requires admin" does not weaken the
   check that actually requires admin.

Nothing changed in the code for this finding — `/openapi.json` remains exactly as unauthenticated
as `/health`. What changed is that the choice now has a name and a place a future session can find
it, instead of looking like an oversight the next time an audit runs.

---

### One root secret, two purposes, and a subkey each (M-11)

`JWT_REFRESH_SECRET` signed two unrelated things: opaque refresh tokens (`auth/tokens.ts`) and
workspace invitation tokens (`workspaces/invitations.ts`), both by handing the raw secret straight
to `createHmac`. Two consequences followed from sharing the bytes rather than only the source: a
suspected leak in one context (a refresh token turning up somewhere it shouldn't) forced rotating
the secret that also authenticated the other, invalidating every pending invitation as collateral
damage nobody chose; and a cryptographic weakness discovered in one HMAC use — however unlikely for
plain HMAC-SHA256 — would have applied to the other for free, since it was the identical key.

**The fix is `lib/subkey.ts`: one function, `deriveSubkey(purpose)`, wrapping Node's own
`crypto.hkdfSync`.** HKDF (RFC 5869) exists exactly for this — turning one root secret into several
independent-looking subkeys, labelled by an `info` parameter that never needs to be secret itself.
`hashRefreshToken` now keys its HMAC with `deriveSubkey('refresh-token')`, `hashToken` in
`invitations.ts` with `deriveSubkey('invitation-token')`. Rotating `JWT_REFRESH_SECRET` still
rotates both derived keys together — there is exactly one secret to manage in production, unchanged
— but a leak of one derived key no longer yields the other, and each can be reasoned about (and, if
it ever mattered, rotated) independently of the shared root.

**Why this is HKDF derivation and not a second environment variable, unlike `EMAIL_TOKEN_SECRET`
(section 5o).** Those two decisions look inconsistent side by side and are not: `EMAIL_TOKEN_SECRET`
existed to avoid giving `JWT_REFRESH_SECRET` a *third* purpose it had never had, at a point where
this exact M-11 problem was already known and unfixed — compounding an open finding would have been
strictly worse than leaving it alone for a session that meant to fix it properly. This entry is that
session: the two purposes that already existed on the root secret get subkeys, which is the fix
M-11 always specified, rather than a third environment variable growing the secret-management
surface for no reason a fourth purpose wouldn't also need solving. No salt is used beyond HKDF's
convention of an empty one — salt exists to combine multiple *independent* entropy sources, and
there is only one input here (the root secret); the separation this buys comes entirely from the
`info` label, not from a salt.

**This is a breaking change for any live deployment, and deliberately not migrated.** Every refresh
token and every pending invitation in a real database hashes differently the moment this ships —
existing rows still hold the *old* HMAC, computed with the raw secret, and a freshly presented token
now hashes with the derived subkey instead, so no existing row matches. The consequence is that
everyone with a live session is signed out and has to sign back in, and every pending invitation
link stops working and has to be re-sent. That is not a bug to work around; it is the same
consequence rotating `JWT_REFRESH_SECRET` itself already carries (`revokeAllUserTokens`,
section 6), and this codebase has no demo or production deployment with real sessions to preserve
across the change regardless. A real deployment adopting this fix should expect and communicate
exactly that "sign in again" moment, the same as it would for any other secret rotation.

Verified with `tests/unit/subkey.test.ts`: the same purpose always derives the same key
(determinism matters — a random subkey per call would make every stored hash unverifiable), two
different purposes derive different keys, and neither derived key ever equals the root secret it
came from. What is deliberately *not* pinned is the specific bytes HKDF produces for a given
input — that is Node's `crypto` module's contract to keep, not this codebase's.

---

### A release runbook, and a heartbeat the worker never had (P-4, P-6)

**P-4.** `server.ts` skips auto-migration in production with a comment pointing at "a release
step" that had never been written down anywhere — which is fine as *code*, since
`docker-compose.deploy.yml` already gates the single-instance release correctly
(`migrate` → `service_completed_successfully` → `api`/`worker`), but leaves a real question
unanswered the day this ever runs as more than one instance: what rule keeps a migration safe while
two image versions serve traffic at once. `docs/runbook.md` is that document — the release command
this repository's compose file already gets right needs no runbook of its own; what needed writing
down was the backward-compatibility discipline a rolling deploy would need (additive migrations
first, never renaming or dropping a column the previous image still reads, run `migrate` once
before rolling any instance forward) and the failure procedure (Kysely's `Migrator` runs each
migration in its own transaction, so a failed one rolls back cleanly on its own; `db/migrate.js
down` undoes exactly one step, not the whole chain).

**P-6.** `jobs/processors.ts` already exported `workerHealthy()` — a query that confirms the
database is reachable — with nothing calling it. The deployed worker's container had already
stopped *reporting* a false unhealthy (the inherited HTTP `HEALTHCHECK` was disabled, since the
worker opens no port), but disabling a wrong probe is not the same as having a right one: a
genuinely wedged worker was invisible until whatever depends on its output — recurring bills,
alerts, notification delivery — stopped arriving, which is a symptom several steps removed from the
cause.

The fix is a file-based heartbeat rather than opening a port for the worker to answer on, which
would have reversed a deliberate earlier decision (section 5g/5k: the worker has no HTTP surface).
`worker.ts` writes the current time to `/tmp/worker-heartbeat` every 15 seconds — but only once
`workerHealthy()` has actually confirmed the database is up, so a broken database connection and a
wedged event loop both show up identically to the healthcheck: a file that stops getting newer.
`worker-healthcheck.js` (a new, tiny entrypoint compiled from the same image) is what
`docker-compose.deploy.yml`'s `worker.healthcheck` now runs, replacing the disabled HTTP one — it
reads the file's age and exits non-zero past three missed writes' worth of grace (45s), deliberately
*not* querying the database itself, since a healthcheck that opens its own connection would compete
with the worker for pool slots at exactly the moment — a saturated pool — that answer matters most.

Verified in a real container, not only unit tests: `docker inspect` reported `healthy` continuously
while the worker ran normally, then `unhealthy` after the process was frozen with `docker pause` and
left past the staleness window — proof the check actually distinguishes a live worker from a stuck
one, not just that a file exists. `tests/unit/worker-healthcheck.test.ts` pins the pure staleness
arithmetic on its own (including that an unparsable heartbeat — `NaN` — fails closed rather than
computing a nonsensical age), separated from the file I/O and `process.exit` calls that make the
rest of `worker-healthcheck.ts` awkward to unit test directly.

---

### Secret scanning and SAST run the open-source tools directly, not the marketplace wrappers (L-6)

`npm audit` in `ci.yml` catches a known-vulnerable *dependency*; nothing was watching for a
mistake this codebase's own commits could make — a real secret typed into a file, or a code
pattern a static analyser would flag. C-1 was exactly the first kind, found by a human audit
rather than by anything automated; L-6 is closing that gap for the next one.

**Secret scanning: `gitleaks`, run as its own published container image rather than through
`gitleaks-action`.** The marketplace wrapper's newer major versions gate some behaviour behind a
paid license, and this repository has no license key to give it — the scanner itself is fully
open source, so running the binary directly (`ghcr.io/gitleaks/gitleaks`, as the job's `container:`
image) sidesteps the question entirely rather than gambling on which of the wrapper's features
still work unlicensed.

**This was tested against the repository's real history before `.gitleaks.toml` existed, not
assumed to work.** A local run (same image, same command CI now runs) found three findings, all in
`tests/integration/auth.test.ts` — `'NotMyPassword1'` and similar fixture strings the
`generic-api-key` rule's entropy heuristic could not tell apart from a real key. That is exactly
the shape of false positive this codebase's own testing convention (real Postgres, real credential
flows, no mocks — `CLAUDE.md` section 6) guarantees will recur throughout `apps/api/tests/`, so the
config allowlists that whole path rather than each fixture string individually — a fixture
asserted against in a test is not a secret, and excluding the path keeps the scan's attention on
code that could actually leak one. A second regex-based allowlist covers the handful of
*deliberately* published placeholders this repository already documents:
`production-policy.ts`'s `PUBLISHED_SECRETS` list, copied rather than referenced, because gitleaks
has no way to read a TypeScript source file. **The two lists have to be kept in sync by hand** — a
new placeholder added to one and not the other either breaks this scan on a legitimate value or
stops flagging a real category of mistake, and nothing enforces the pairing beyond this note and
the comment at the top of `.gitleaks.toml`.

**SAST: `codeql.yml`, GitHub's own analysis, free for a public repository with no account or key
needed beyond what `github-actions` already has.** `build-mode: manual` rather than the default
`autobuild`: this monorepo's build order is not obvious to a generic build detector —
`@finance/schemas` has to compile before `apps/api` or `apps/web` will even typecheck (the
shared-package convention, `CLAUDE.md` section 3) — so the workflow's own build step states that
order explicitly instead of hoping autobuild infers it. Runs on push, on pull request, and weekly,
since a dependency-aware query can surface a new finding in unchanged code as CodeQL's own query
packs are updated, not only when this repository's code changes.

**CodeQL's first real run found ten alerts, and all ten were triaged and dismissed, not
ignored.** Every one traces to the same root cause: CodeQL's standard JavaScript/TypeScript query
pack models well-known packages (`express-rate-limit`, `csurf`/`lusca`, `express-validator`) and
does not know this codebase's bespoke equivalents — a Redis-backed rate limiter
(`middleware/rate-limit.ts`), a `SameSite=Lax` cookie standing in for a CSRF token
(`docs/decisions.md`, "One origin, because the cookie says so"), and Zod-based request validation
(`middleware/validate.ts`) — count as the same protection. Each alert was read against the actual
code before dismissal, not dismissed on the pattern alone:

| Rule | Where | Why it's a false positive here |
| --- | --- | --- |
| `js/cors-permissive-configuration` | `app.ts` CORS config | Permissive only when `NODE_ENV=development`; production is an explicit allowlist (section 5i) |
| `js/clear-text-storage-of-sensitive-data` | `setRefreshCookie` | The refresh cookie must carry the real token to the client by design (HttpOnly/Lax/Secure); only its HMAC is ever persisted (M-11) |
| `js/missing-token-validation` (×1, many instances folded into it) | `cookieParser()` | `SameSite=Lax` on the refresh cookie is the CSRF mitigation (H-4, section 5n) |
| `js/insecure-helmet-configuration` | `helmet({ contentSecurityPolicy: false })` | This API returns JSON; the real CSP lives in nginx serving the document (section 5n) |
| `js/type-confusion-through-parameter-tampering` (×4) | `dates.ts`'s `parseDate`, an analytics CSV filename | Every caller's input is Zod-validated (`dateField`/`dateSchema`) before reaching these lines — never reachable with an array |
| `js/missing-rate-limiting` (×2) | `/login`, `/verify-email` | `authRateLimit` is mounted directly on both routes, one line above where CodeQL flagged them |

All ten are dismissed with `false positive` and a comment on the alert itself citing the specific
file and the decision that makes it one, so a human re-reading the Security tab later does not
have to re-derive this table from scratch. **A CodeQL query that starts flagging a genuinely new
pattern — not one of the six above — is a real finding and should be treated as one**; this table
describes what was true the day L-6 shipped, not a blanket license to dismiss anything this rule
ever reports again.
