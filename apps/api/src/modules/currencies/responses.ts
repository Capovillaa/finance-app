import { z } from 'zod/v4';
import { component, currencyCode, dateOnly, integer, money } from '../shared/responses.js';

/** What this module returns: the supported currencies and one rate at a time. */

export const currencySchema = component(
  'Currency',
  z.object({
    code: currencyCode,
    name: z.string(),
    symbol: z.string(),
    decimalDigits: integer.describe('The minor unit — 2 for most currencies, 0 for JPY.'),
  }),
);

export const currencyListResponse = z.object({ currencies: z.array(currencySchema) });

export const exchangeRateResponse = z
  .object({
    from: currencyCode,
    to: currencyCode,
    asOf: dateOnly,
    rate: money.describe('Ten decimal places. Multiply an amount in `from` by this to get `to`. Exactly "1" when they match.'),
  })
  .describe('The rate in force on `asOf`, which is the rate a transaction on that day was converted at.');
