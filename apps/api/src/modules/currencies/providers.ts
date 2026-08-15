import { z } from 'zod/v4';
import { fromUtcDate, isDateOnly, type DateOnly } from '../../lib/dates.js';
import { Decimal, rate as formatRate } from '../../lib/money.js';

/**
 * Live exchange-rate providers.
 *
 * Everything in this file is pure apart from a single `fetch`, and that call is
 * injectable, so the whole module is unit-testable with neither a network nor a
 * database. It deliberately imports neither `config/env` nor `db/client`: the
 * service decides *which* provider to build and from what configuration, and
 * this module only knows how to talk to one.
 */

export const LIVE_PROVIDERS = ['openexchangerates', 'frankfurter'] as const;
export type LiveProviderName = (typeof LIVE_PROVIDERS)[number];

/** One provider response, normalised: rates as decimal strings, never floats. */
export interface RateQuote {
  provider: LiveProviderName;
  /** The currency the provider quoted against, which is not necessarily ours. */
  base: string;
  /** The day the provider says these rates are for, not the day we asked. */
  asOf: DateOnly;
  rates: Record<string, string>;
}

export interface RateProvider {
  readonly name: LiveProviderName;
  /**
   * `symbols` is what we can store (the `currencies` table); `preferredBase` is
   * what we would rather have them quoted against. A provider is free to ignore
   * either — the caller rebases and filters afterwards regardless.
   */
  fetchLatest(symbols: readonly string[], preferredBase: string): Promise<RateQuote>;
}

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<HttpResponseLike>;

export interface ProviderOptions {
  /** Overrides the provider's default endpoint, for a proxy or a test double. */
  apiUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * A blank override is an unset override. `EXCHANGE_RATE_API_URL=` in a `.env`
 * file arrives as `''`, which `??` keeps — and an empty endpoint turns
 * `${endpoint}/latest` into a relative URL that `new URL` rejects outright.
 */
function endpointOrDefault(apiUrl: string | undefined, fallback: string): string {
  const trimmed = apiUrl?.trim();
  return (trimmed ? trimmed : fallback).replace(/\/+$/, '');
}

/**
 * Rates arrive as JSON numbers. They are converted to strings immediately and
 * nothing downstream ever sees the number again — `Decimal` reads a float
 * through its shortest round-trip representation, so the digits stored are the
 * digits the provider printed.
 *
 * A rate is only rejected here if it cannot be one; the value type stays a plain
 * `number` so that a single zero or negative quote costs that one currency its
 * update rather than costing every other currency theirs.
 */
const ratesPayload = z.record(z.string(), z.number());

const frankfurterPayload = z.object({
  base: z.string().length(3),
  date: z.string(),
  rates: ratesPayload,
});

const openExchangeRatesPayload = z.object({
  base: z.string().length(3),
  timestamp: z.number().int().positive(),
  rates: ratesPayload,
});

export function createRateProvider(name: LiveProviderName, options: ProviderOptions = {}): RateProvider {
  switch (name) {
    case 'frankfurter':
      return frankfurterProvider(options);
    case 'openexchangerates':
      return openExchangeRatesProvider(options);
  }
}

/**
 * Frankfurter republishes the European Central Bank's daily reference rates.
 * It needs no API key and accepts an arbitrary base, which is what makes the
 * live path verifiable on a fresh checkout without signing up for anything.
 * The ECB publishes on business days only, so a Sunday refresh legitimately
 * returns Friday's date — that date is what gets stored.
 */
function frankfurterProvider(options: ProviderOptions): RateProvider {
  const endpoint = endpointOrDefault(options.apiUrl, 'https://api.frankfurter.dev/v1');

  return {
    name: 'frankfurter',
    async fetchLatest(symbols, preferredBase) {
      const base = preferredBase.toUpperCase();
      const url = new URL(`${endpoint}/latest`);
      url.searchParams.set('base', base);

      const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))].filter((s) => s !== base).sort();
      // Asking for nothing is not the same as asking for everything; omit the
      // parameter entirely rather than sending an empty one.
      if (wanted.length > 0) url.searchParams.set('symbols', wanted.join(','));

      const payload = frankfurterPayload.parse(await requestJson(url, 'frankfurter', options));
      if (!isDateOnly(payload.date)) {
        throw new Error(`frankfurter returned an unusable date: ${payload.date}`);
      }

      return {
        provider: 'frankfurter',
        base: payload.base.toUpperCase(),
        asOf: payload.date,
        rates: normaliseRates(payload.rates),
      };
    },
  };
}

/**
 * Open Exchange Rates. The free plan quotes against USD only and rejects the
 * `symbols` parameter, so we ask for everything and narrow locally — `rebase`
 * turns USD-based rates into ours and drops what we cannot store.
 */
function openExchangeRatesProvider(options: ProviderOptions): RateProvider {
  const endpoint = endpointOrDefault(options.apiUrl, 'https://openexchangerates.org/api');
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('EXCHANGE_RATE_API_KEY is required when EXCHANGE_RATE_PROVIDER=openexchangerates');
  }

  return {
    name: 'openexchangerates',
    async fetchLatest() {
      const url = new URL(`${endpoint}/latest.json`);
      url.searchParams.set('app_id', apiKey);

      const payload = openExchangeRatesPayload.parse(await requestJson(url, 'openexchangerates', options));

      return {
        provider: 'openexchangerates',
        base: payload.base.toUpperCase(),
        // A UNIX timestamp, not a calendar date: the day it belongs to is the
        // day in UTC, which is the timezone every other date in this app that
        // is not a user's own is expressed in.
        asOf: fromUtcDate(new Date(payload.timestamp * 1000)),
        rates: normaliseRates(payload.rates),
      };
    },
  };
}

export interface RebasedRate {
  baseCode: string;
  quoteCode: string;
  rate: string;
}

/**
 * Re-expresses a provider's quote against `target`, dropping every currency the
 * database does not know — `exchange_rates` has foreign keys into `currencies`,
 * and a provider publishing thirty currencies against our eight would otherwise
 * fail the whole insert on the first one we have never heard of.
 *
 * Rebasing is division: if the provider quotes USD→BRL and USD→EUR, then
 * BRL→EUR is (USD→EUR) / (USD→BRL), and BRL→USD is its reciprocal.
 */
export function rebase(quote: RateQuote, target: string, supported: ReadonlySet<string>): RebasedRate[] {
  const base = quote.base.toUpperCase();
  const to = target.toUpperCase();
  const rows: RebasedRate[] = [];

  const push = (quoteCode: string, value: Decimal): void => {
    if (quoteCode === to || !supported.has(quoteCode) || !value.isFinite() || value.lte(0)) return;
    rows.push({ baseCode: to, quoteCode, rate: formatRate(value) });
  };

  if (base === to) {
    for (const [code, value] of Object.entries(quote.rates)) push(code, new Decimal(value));
  } else {
    const pivot = quote.rates[to];
    if (pivot === undefined) {
      throw new Error(`${quote.provider} quotes against ${base} and did not include ${to}, so its rates cannot be rebased`);
    }
    const pivotValue = new Decimal(pivot);
    if (!pivotValue.isFinite() || pivotValue.lte(0)) {
      throw new Error(`${quote.provider} returned an unusable ${base} -> ${to} rate: ${pivot}`);
    }

    // The provider's own base becomes one of our quote currencies.
    push(base, new Decimal(1).div(pivotValue));
    for (const [code, value] of Object.entries(quote.rates)) {
      if (code === base) continue;
      push(code, new Decimal(value).div(pivotValue));
    }
  }

  // Sorted so a log line, a test and a diff of two refreshes all read the same
  // way regardless of the order the provider happened to serialise its keys in.
  return rows.sort((a, b) => (a.quoteCode < b.quoteCode ? -1 : a.quoteCode > b.quoteCode ? 1 : 0));
}

async function requestJson(url: URL, provider: LiveProviderName, options: ProviderOptions): Promise<unknown> {
  const doFetch: FetchLike = options.fetchImpl ?? ((target, init) => globalThis.fetch(target, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: HttpResponseLike;
  try {
    response = await doFetch(url.toString(), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : String(err);
    throw new Error(`${provider} request to ${redact(url)} failed: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(`${provider} request to ${redact(url)} returned HTTP ${response.status}`);
  }

  // Read as text and parse here rather than trusting `response.json()`: a
  // captive portal or a provider error page answers 200 with HTML, and the
  // failure should say so instead of surfacing a bare syntax error.
  const body = await response.text();
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`${provider} request to ${redact(url)} returned a body that is not JSON`);
  }
}

/**
 * A provider URL carries the API key in its query string, so only the origin and
 * path may ever reach a log line or an error message.
 */
function redact(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

function normaliseRates(rates: Record<string, number>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [code, value] of Object.entries(rates)) {
    if (!Number.isFinite(value) || value <= 0) continue;
    result[code.toUpperCase()] = formatRate(new Decimal(value));
  }
  return result;
}
