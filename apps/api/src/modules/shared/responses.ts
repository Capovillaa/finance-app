import { globalRegistry, z, type ZodType } from 'zod/v4';

/**
 * The vocabulary every response schema is written in.
 *
 * `shared/schemas.ts` is this module's opposite number: it holds the pieces the
 * *request* side needs beyond what `@finance/schemas` shares. Nothing here is
 * shared with `apps/web` as source — the client's half of this contract is
 * generated from `docs/openapi.json`, which these declarations produce.
 *
 * **These describe the wire, not the row.** A `timestamp` column comes back from
 * `pg` as a JS `Date` and only becomes a string when Express serialises it; the
 * schemas below describe the string, and `responds()` checks them against the
 * serialised body for that reason. A money column comes back as a string
 * already, because `db/client.ts` deliberately leaves `NUMERIC` unparsed.
 */

const NAMED = new Set<string>();

/**
 * Names a schema so it is published once under `components/schemas` and
 * referenced everywhere it appears.
 *
 * Name the things a caller has a word for — an `Account`, a `Category` — and
 * leave the envelope that wraps them anonymous. `{ account: Account }` is not a
 * concept, it is one endpoint's packaging, and naming it would fill the
 * component list with wrappers nobody refers to.
 */
export function component<T extends ZodType>(id: string, schema: T): T {
  if (NAMED.has(id)) {
    throw new Error(
      `Two response schemas are both named "${id}". A component name is the key it is published ` +
        'under, so the second would silently replace the first.',
    );
  }
  NAMED.add(id);

  // Zod's registry is a module-level singleton and refuses a repeated id, but it
  // does not share this module's lifetime: a test runner that re-evaluates
  // `src/` for each file while leaving `node_modules` cached — which is exactly
  // what `pool: forks, singleFork` does — registers these names once per file
  // and would fail on the second. `NAMED` above is the guard that matters,
  // because it is reset by the same re-evaluation that causes this; what is
  // dropped here is a registration belonging to a module instance the process
  // has already finished with.
  const stale = globalRegistry._idmap.get(id);
  if (stale) globalRegistry.remove(stale);

  return schema.meta({ id }) as T;
}

/** Whether a component name has been taken — for the unit tests, not for routes. */
export const isComponentNamed = (id: string): boolean => NAMED.has(id);

// ---------------------------------------------------------------------------
// The scalar vocabulary
// ---------------------------------------------------------------------------

/**
 * The five scalars below are components too, which is worth a word because it
 * looks like over-naming.
 *
 * Their validation is genuinely long — an ISO instant compiles to a 300-character
 * pattern — and inlining that beside every `createdAt` in a hundred operations
 * buries the document in the same regular expression. Named, each is written
 * once and every use is a `$ref`, which is both smaller and more readable: a
 * field typed `Money` says what it is in a way `string, pattern: ^-?\d…` does
 * not. A generated client picks the names up as type aliases for free.
 *
 * They stay composable. Zod does not carry a component's `id` onto a derivative,
 * so `money.describe('…')` publishes a description beside the `$ref` and
 * `timestamp.nullable()` an `anyOf` around it, instead of quietly redefining the
 * component under the same name.
 */

/**
 * A monetary amount. Always a decimal string, never a JSON number: the ledger is
 * `NUMERIC(19,4)` and a float cannot hold it. Exchange rates carry ten decimal
 * places rather than four, so the pattern bounds neither side.
 */
export const money = component(
  'Money',
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .meta({ description: 'A decimal amount as a string, never a JSON number. Stored as NUMERIC(19,4).' }),
);

/** A calendar date, `YYYY-MM-DD`, with no time and no zone. */
export const dateOnly = component(
  'DateOnly',
  z.iso.date().meta({ description: 'A calendar date, `YYYY-MM-DD`. No time, no zone.' }),
);

/** An instant, ISO 8601 in UTC — what `JSON.stringify` makes of a `Date`. */
export const timestamp = component(
  'Timestamp',
  z.iso.datetime().meta({ description: 'An instant in UTC, ISO 8601: `2026-08-14T12:00:00.000Z`.' }),
);

export const uuid = component('Uuid', z.uuid());

/** An ISO 4217 code, upper case. */
export const currencyCode = component(
  'CurrencyCode',
  z.string().meta({ description: 'ISO 4217 code, upper case — `BRL`, `USD`.' }),
);

/**
 * A whole number. Named for the same reason as the scalars above: Zod publishes
 * the safe-integer range with every one, and that pair of sixteen-digit bounds
 * is not worth repeating beside every count in the API.
 */
export const integer = component('Integer', z.int());

/** A percentage as the API computes it: 0–100 with two decimal places, not a fraction. */
export const percent = z.number();

/** A free-form JSON object the API stores but does not constrain. */
export const jsonObject = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Envelopes shared across modules
// ---------------------------------------------------------------------------

/**
 * The pagination envelope from `lib/http.ts`'s `buildPage`.
 *
 * Built per item type rather than named as one component, because OpenAPI 3.1
 * has no generics: a named `Page` would have to say `items: array of anything`,
 * which is worse for a generated client than the same six fields written out
 * around a `$ref` to the item.
 */
export function page<T extends ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: integer,
    pageSize: integer,
    total: integer,
    totalPages: integer,
    hasMore: z.boolean(),
  });
}

/**
 * The window an analytic figure covers, both ends inclusive.
 *
 * Here rather than in `analytics` because reports, the dashboard and the
 * comparison endpoint all return one, and a component belongs with whoever owns
 * it — which, for a shape three modules return, is nobody in particular.
 */
export const dateRange = component('DateRange', z.object({ start: dateOnly, end: dateOnly }));

/**
 * Income against expenses for a window, in the workspace's base currency.
 *
 * **Transfers are excluded**, everywhere in analytics: moving money between your
 * own accounts is neither income nor expense, and counting it would inflate
 * both sides at once.
 */
export const periodTotals = component(
  'PeriodTotals',
  z.object({
    income: money,
    expenses: money.describe('Positive: the magnitude spent, not the signed ledger total.'),
    net: money,
    savingsRate: percent.describe('Net as a percentage of income. 0 when there was no income.'),
  }),
);
