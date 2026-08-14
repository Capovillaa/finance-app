import { z } from 'zod';
import { isDateOnly } from '../../lib/dates.js';
import { money } from '../../lib/money.js';

/**
 * Money crosses the wire as a decimal string. Accepting a JS number here would
 * let 0.1 + 0.2 into the ledger, so numeric input is normalised through the
 * Decimal helpers immediately and everything downstream deals in strings.
 */
export const moneySchema = z
  .union([z.string(), z.number()])
  .refine((value) => {
    const text = String(value).trim();
    return /^-?\d{1,15}(\.\d{1,4})?$/.test(text);
  }, 'Must be a decimal amount with at most 4 decimal places')
  .transform((value) => money(String(value)));

/** Same as `moneySchema` but rejects zero and negatives. */
export const positiveMoneySchema = moneySchema.refine(
  (value) => Number(value) > 0,
  'Must be greater than zero',
);

export const dateSchema = z
  .string()
  .refine((value) => isDateOnly(value), 'Must be a valid YYYY-MM-DD date');

/**
 * Boolean from a query string. `z.coerce.boolean()` is wrong here: it applies
 * JavaScript truthiness, so the string `"false"` becomes `true` and silently
 * inverts the caller's intent.
 */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1' || value === 'yes'));

/** Same, with a default when the parameter is absent. */
export const booleanQueryWithDefault = (fallback: boolean) => booleanQuerySchema.default(fallback);

export const currencySchema = z
  .string()
  .length(3)
  .transform((value) => value.toUpperCase());

export const dateRangeSchema = z
  .object({ from: dateSchema.optional(), to: dateSchema.optional() })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must be on or before `to`',
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
    (value) =>
      value === undefined ||
      value.every((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)),
    'Must be a comma-separated list of UUIDs',
  );

export const csvStringArray = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = Array.isArray(value) ? value : value.split(',');
    return list.map((item) => item.trim()).filter((item) => item.length > 0);
  });
