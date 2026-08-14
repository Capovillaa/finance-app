import {
  UUID_PATTERN,
  currencyField,
  dateField,
  moneyField,
  positiveMoneyField,
} from '@finance/schemas';
import { z } from 'zod/v4';
import { money } from '../../lib/money.js';

/**
 * The API's side of the shared contract.
 *
 * The shapes and bounds come from `@finance/schemas`, which `apps/web` reads
 * too; what this module adds is the part only a server can do — turning a
 * validated amount into the canonical `NUMERIC(19,4)` string the database
 * stores, and parsing the query-string encodings Express hands over.
 */

/**
 * Money crosses the wire as a decimal string. Accepting a JS number would let
 * 0.1 + 0.2 into the ledger, so numeric input is normalised through the Decimal
 * helpers immediately and everything downstream deals in strings.
 */
export const moneySchema = moneyField.transform((value) => money(value));

/** Same as `moneySchema` but rejects zero and negatives. */
export const positiveMoneySchema = positiveMoneyField.transform((value) => money(value));

export const dateSchema = dateField;

/**
 * Boolean from a query string. `z.coerce.boolean()` is wrong here: it applies
 * JavaScript truthiness, so the string `"false"` becomes `true` and silently
 * inverts the caller's intent.
 */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1' || value === 'yes'))
  .meta({ description: 'A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false.' });

/** Same, with a default when the parameter is absent. */
export const booleanQueryWithDefault = (fallback: boolean) => booleanQuerySchema.default(fallback);

export const currencySchema = currencyField.transform((value) => value.toUpperCase());

export const dateRangeSchema = z
  .object({ from: dateSchema.optional(), to: dateSchema.optional() })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'validation.dateRangeOrder',
    path: ['from'],
  });

/** Accepts `a,b,c` or repeated query params and normalises to an array. */
export const csvUuidArray = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = Array.isArray(value) ? value : value.split(',');
    return list.map((item) => item.trim()).filter((item) => item.length > 0);
  })
  .refine(
    (value) => value === undefined || value.every((item) => UUID_PATTERN.test(item)),
    'validation.uuidList',
  )
  .meta({
    description: 'UUIDs, either comma-separated in one parameter or repeated across several. Every entry must be a UUID.',
  });

export const csvStringArray = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = Array.isArray(value) ? value : value.split(',');
    return list.map((item) => item.trim()).filter((item) => item.length > 0);
  });
