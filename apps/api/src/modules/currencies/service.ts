import { sql } from 'kysely';
import { env } from '../../config/env.js';
import { db, type Executor } from '../../db/client.js';
import { today, type DateOnly } from '../../lib/dates.js';
import { unprocessable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { Decimal, rate as formatRate } from '../../lib/money.js';
import { createRateProvider, rebase, type RateProvider } from './providers.js';

export interface CurrencyRecord {
  code: string;
  name: string;
  symbol: string;
  decimalDigits: number;
}

export async function listCurrencies(): Promise<CurrencyRecord[]> {
  const rows = await db.selectFrom('currencies').selectAll().orderBy('code').execute();
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    symbol: r.symbol,
    decimalDigits: r.decimal_digits,
  }));
}

export async function assertCurrencyExists(code: string): Promise<void> {
  const row = await db
    .selectFrom('currencies')
    .select('code')
    .where('code', '=', code.toUpperCase())
    .executeTakeFirst();
  if (!row) throw unprocessable('currencies.unsupported', { code: code.toUpperCase() });
}

/**
 * The conversion factor from `from` into `to`, using the most recent rate at or
 * before `asOf`. Historical transactions therefore keep the rate that applied
 * on the day they happened rather than today's.
 *
 * Falls back through the inverse pair and through a cross rate so a table that
 * only stores `BRL -> X` can still answer `USD -> EUR`.
 */
export async function getRate(
  from: string,
  to: string,
  asOf: DateOnly = today('UTC'),
  executor: Executor = db,
): Promise<string> {
  const base = from.toUpperCase();
  const quote = to.toUpperCase();
  if (base === quote) return '1';

  const direct = await executor
    .selectFrom('exchange_rates')
    .select(['rate'])
    .where('base_code', '=', base)
    .where('quote_code', '=', quote)
    .where('as_of', '<=', asOf)
    .orderBy('as_of', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (direct) return formatRate(direct.rate);

  const inverse = await executor
    .selectFrom('exchange_rates')
    .select(['rate'])
    .where('base_code', '=', quote)
    .where('quote_code', '=', base)
    .where('as_of', '<=', asOf)
    .orderBy('as_of', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (inverse) {
    const value = new Decimal(inverse.rate);
    if (!value.isZero()) return formatRate(new Decimal(1).div(value));
  }

  // Cross rate via any currency quoted against both sides on the same day.
  const cross = await sql<{ rate: string }>`
    SELECT (b.rate / a.rate)::numeric(20,10) AS rate
    FROM (
      SELECT DISTINCT ON (base_code) base_code, rate
      FROM exchange_rates
      WHERE quote_code = ${base} AND as_of <= ${asOf}
      ORDER BY base_code, as_of DESC
    ) a
    JOIN (
      SELECT DISTINCT ON (base_code) base_code, rate
      FROM exchange_rates
      WHERE quote_code = ${quote} AND as_of <= ${asOf}
      ORDER BY base_code, as_of DESC
    ) b ON b.base_code = a.base_code
    LIMIT 1
  `.execute(executor);

  const crossRow = cross.rows[0];
  if (crossRow) return formatRate(crossRow.rate);

  throw unprocessable('currencies.noRate', { base, quote, asOf });
}

export interface ConversionResult {
  amount: string;
  rate: string;
}

/** Converts and returns both the converted amount and the rate actually used. */
export async function convertAmount(
  amount: string,
  from: string,
  to: string,
  asOf: DateOnly = today('UTC'),
  executor: Executor = db,
): Promise<ConversionResult> {
  if (from.toUpperCase() === to.toUpperCase()) {
    return { amount, rate: '1' };
  }
  const conversionRate = await getRate(from, to, asOf, executor);
  const converted = new Decimal(amount).times(conversionRate).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  return { amount: converted.toFixed(4), rate: conversionRate };
}

export interface UpsertRateInput {
  baseCode: string;
  quoteCode: string;
  rate: string;
  asOf: DateOnly;
  source?: string;
}

export async function upsertRates(rates: UpsertRateInput[], executor: Executor = db): Promise<number> {
  if (rates.length === 0) return 0;

  const result = await executor
    .insertInto('exchange_rates')
    .values(
      rates.map((r) => ({
        base_code: r.baseCode.toUpperCase(),
        quote_code: r.quoteCode.toUpperCase(),
        rate: r.rate,
        as_of: r.asOf,
        source: r.source ?? 'manual',
      })),
    )
    .onConflict((oc) =>
      oc.columns(['base_code', 'quote_code', 'as_of']).doUpdateSet((eb) => ({
        rate: eb.ref('excluded.rate'),
        source: eb.ref('excluded.source'),
      })),
    )
    .executeTakeFirst();

  return Number(result.numInsertedOrUpdatedRows ?? rates.length);
}

/**
 * Indicative BRL-based rates used when no live provider is configured, so local
 * development and tests have a working multi-currency path out of the box.
 */
const STATIC_BRL_RATES: Record<string, string> = {
  USD: '0.1850',
  EUR: '0.1700',
  GBP: '0.1450',
  ARS: '190.0000',
  JPY: '28.5000',
  CHF: '0.1600',
  CAD: '0.2550',
};

export async function refreshStaticRates(asOf: DateOnly = today('UTC')): Promise<number> {
  const rows: UpsertRateInput[] = Object.entries(STATIC_BRL_RATES).map(([quote, value]) => ({
    baseCode: 'BRL',
    quoteCode: quote,
    rate: value,
    asOf,
    source: 'static',
  }));

  const count = await upsertRates(rows);
  logger.info({ count, asOf }, 'Refreshed static exchange rates');
  return count;
}

/**
 * Pulls today's rates from a live provider and stores them against the
 * configured base currency.
 *
 * Two things are deliberate. The rows are stamped with the **provider's** own
 * date rather than today's, because that is the day the rates are for — the ECB
 * publishes on business days, so a Sunday refresh legitimately rewrites Friday's
 * row. And only currencies the `currencies` table knows are stored; a provider
 * publishing thirty of them against our eight would otherwise fail the insert on
 * the first one we have never heard of.
 */
export async function fetchLiveRates(provider: RateProvider, base: string = env.BASE_CURRENCY): Promise<number> {
  const supported = new Set((await listCurrencies()).map((c) => c.code.toUpperCase()));
  const target = base.toUpperCase();
  if (!supported.has(target)) {
    throw new Error(`Base currency ${target} is not in the currencies table, so rates cannot be stored against it`);
  }

  const quote = await provider.fetchLatest([...supported], target);
  const rows: UpsertRateInput[] = rebase(quote, target, supported).map((row) => ({
    ...row,
    asOf: quote.asOf,
    source: provider.name,
  }));

  if (rows.length === 0) {
    throw new Error(`${provider.name} returned no rates this workspace can store`);
  }

  const count = await upsertRates(rows);
  logger.info(
    { provider: provider.name, base: target, asOf: quote.asOf, count, quoted: rows.map((r) => r.quoteCode) },
    'Refreshed live exchange rates',
  );
  return count;
}

/**
 * The entry point the maintenance job calls: whichever provider the environment
 * selects, with a fallback that cannot do harm.
 *
 * A failed live refresh must **not** overwrite good rates with indicative ones —
 * `getRate` already resolves the most recent rate at or before the date it is
 * asked about, so a missed day costs freshness and nothing else. The static
 * table is therefore only written when there is nothing at all to fall back on,
 * which is a fresh install whose very first refresh could not reach the network.
 */
export async function refreshRates(asOf: DateOnly = today('UTC')): Promise<number> {
  if (env.EXCHANGE_RATE_PROVIDER === 'static') return refreshStaticRates(asOf);

  try {
    const provider = createRateProvider(env.EXCHANGE_RATE_PROVIDER, {
      apiUrl: env.EXCHANGE_RATE_API_URL,
      apiKey: env.EXCHANGE_RATE_API_KEY,
      timeoutMs: env.EXCHANGE_RATE_TIMEOUT_MS,
    });
    return await fetchLiveRates(provider);
  } catch (err) {
    logger.error({ err, provider: env.EXCHANGE_RATE_PROVIDER }, 'Live exchange-rate refresh failed');
    return seedStaticRatesIfEmpty(asOf);
  }
}

async function seedStaticRatesIfEmpty(asOf: DateOnly): Promise<number> {
  const existing = await db.selectFrom('exchange_rates').select('id').limit(1).executeTakeFirst();
  if (existing) return 0;

  logger.warn({ asOf }, 'No exchange rates on record; falling back to the indicative static table');
  return refreshStaticRates(asOf);
}
