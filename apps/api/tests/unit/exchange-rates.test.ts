import { describe, expect, it } from 'vitest';
import {
  createRateProvider,
  rebase,
  type FetchLike,
  type RateQuote,
} from '../../src/modules/currencies/providers.js';

/**
 * The provider layer is pure apart from one injectable `fetch`, so every case
 * below runs with no network, no database and no environment.
 */

interface StubOptions {
  ok?: boolean;
  status?: number;
}

function stubFetch(body: unknown, options: StubOptions = {}): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    return {
      ok: options.ok ?? true,
      status: options.status ?? 200,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  return { fetchImpl, calls };
}

const FRANKFURTER_BODY = {
  amount: 1,
  base: 'BRL',
  date: '2026-08-14',
  rates: { USD: 0.19319, EUR: 0.16702, JPY: 30.72 },
};

describe('frankfurter provider', () => {
  it('asks for our base and only the currencies we can store', async () => {
    const { fetchImpl, calls } = stubFetch(FRANKFURTER_BODY);
    const provider = createRateProvider('frankfurter', { fetchImpl });

    await provider.fetchLatest(['BRL', 'USD', 'EUR', 'JPY'], 'BRL');

    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/v1/latest');
    expect(url.searchParams.get('base')).toBe('BRL');
    // The base itself is not a symbol to ask for — its rate against itself is 1.
    expect(url.searchParams.get('symbols')).toBe('EUR,JPY,USD');
  });

  it('reports the provider\'s own date, not the day we asked', async () => {
    const { fetchImpl } = stubFetch(FRANKFURTER_BODY);
    const quote = await createRateProvider('frankfurter', { fetchImpl }).fetchLatest(['USD'], 'BRL');

    // The ECB publishes on business days, so a weekend refresh legitimately
    // stores Friday's rates under Friday's date.
    expect(quote.asOf).toBe('2026-08-14');
    expect(quote.base).toBe('BRL');
  });

  it('converts every rate to a decimal string, keeping the digits the provider printed', async () => {
    const { fetchImpl } = stubFetch(FRANKFURTER_BODY);
    const quote = await createRateProvider('frankfurter', { fetchImpl }).fetchLatest(['USD'], 'BRL');

    expect(quote.rates.USD).toBe('0.19319');
    expect(quote.rates.JPY).toBe('30.72');
    expect(typeof quote.rates.EUR).toBe('string');
  });

  it('drops a non-positive quote instead of failing the whole refresh', async () => {
    const { fetchImpl } = stubFetch({ ...FRANKFURTER_BODY, rates: { USD: 0.19319, EUR: 0, GBP: -1 } });
    const quote = await createRateProvider('frankfurter', { fetchImpl }).fetchLatest(['USD', 'EUR', 'GBP'], 'BRL');

    expect(Object.keys(quote.rates)).toEqual(['USD']);
  });

  it('rejects a date it cannot store', async () => {
    const { fetchImpl } = stubFetch({ ...FRANKFURTER_BODY, date: '14/08/2026' });
    const provider = createRateProvider('frankfurter', { fetchImpl });

    await expect(provider.fetchLatest(['USD'], 'BRL')).rejects.toThrow(/unusable date/);
  });

  it('honours an endpoint override, trailing slash or not', async () => {
    const { fetchImpl, calls } = stubFetch(FRANKFURTER_BODY);
    const provider = createRateProvider('frankfurter', { fetchImpl, apiUrl: 'http://localhost:9999/api/' });

    await provider.fetchLatest(['USD'], 'BRL');

    expect(new URL(calls[0]!).href).toContain('http://localhost:9999/api/latest?');
  });

  it('treats a blank endpoint override as no override at all', async () => {
    // `EXCHANGE_RATE_API_URL=` in a .env file arrives as '', which `??` keeps —
    // and an empty endpoint makes `new URL('/latest')` throw "Invalid URL".
    const { fetchImpl, calls } = stubFetch(FRANKFURTER_BODY);
    const provider = createRateProvider('frankfurter', { fetchImpl, apiUrl: '  ' });

    await provider.fetchLatest(['USD'], 'BRL');

    expect(new URL(calls[0]!).origin).toBe('https://api.frankfurter.dev');
  });
});

describe('openexchangerates provider', () => {
  const body = { base: 'USD', timestamp: 1_755_129_600, rates: { BRL: 5.4, EUR: 0.92 } };

  it('turns the UNIX timestamp into the UTC calendar date it belongs to', async () => {
    const { fetchImpl } = stubFetch(body);
    const quote = await createRateProvider('openexchangerates', { fetchImpl, apiKey: 'k' }).fetchLatest([], 'BRL');

    expect(quote.asOf).toBe(new Date(body.timestamp * 1000).toISOString().slice(0, 10));
    expect(quote.base).toBe('USD');
  });

  it('refuses to be built without an API key, rather than failing at refresh time', () => {
    expect(() => createRateProvider('openexchangerates', {})).toThrow(/EXCHANGE_RATE_API_KEY/);
  });

  it('never puts the API key in an error message', async () => {
    const { fetchImpl } = stubFetch('nope', { ok: false, status: 401 });
    const provider = createRateProvider('openexchangerates', { fetchImpl, apiKey: 'super-secret-key' });

    await expect(provider.fetchLatest([], 'BRL')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('super-secret-key') }),
    );
    await expect(provider.fetchLatest([], 'BRL')).rejects.toThrow(/HTTP 401/);
  });
});

describe('provider transport', () => {
  it('says the body was not JSON rather than surfacing a syntax error', async () => {
    const { fetchImpl } = stubFetch('<html>captive portal</html>');
    const provider = createRateProvider('frankfurter', { fetchImpl });

    await expect(provider.fetchLatest(['USD'], 'BRL')).rejects.toThrow(/not JSON/);
  });

  it('reports a transport failure with the provider and the endpoint', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    };
    const provider = createRateProvider('frankfurter', { fetchImpl });

    await expect(provider.fetchLatest(['USD'], 'BRL')).rejects.toThrow(/frankfurter request to https:\/\/api\.frankfurter\.dev/);
  });
});

describe('rebase', () => {
  const supported = new Set(['BRL', 'USD', 'EUR', 'JPY']);

  it('passes rates through when the provider already quotes our base', () => {
    const quote: RateQuote = {
      provider: 'frankfurter',
      base: 'BRL',
      asOf: '2026-08-14',
      rates: { USD: '0.19319', EUR: '0.16702' },
    };

    expect(rebase(quote, 'BRL', supported)).toEqual([
      { baseCode: 'BRL', quoteCode: 'EUR', rate: '0.16702' },
      { baseCode: 'BRL', quoteCode: 'USD', rate: '0.19319' },
    ]);
  });

  it('divides a USD-based quote onto our base, and inverts the provider\'s own base', () => {
    const quote: RateQuote = {
      provider: 'openexchangerates',
      base: 'USD',
      asOf: '2026-08-14',
      rates: { BRL: '5.4', EUR: '0.92' },
    };

    // BRL -> EUR is (USD -> EUR) / (USD -> BRL); BRL -> USD is 1 / (USD -> BRL).
    expect(rebase(quote, 'BRL', supported)).toEqual([
      { baseCode: 'BRL', quoteCode: 'EUR', rate: '0.1703703704' },
      { baseCode: 'BRL', quoteCode: 'USD', rate: '0.1851851852' },
    ]);
  });

  it('drops currencies the database has never heard of', () => {
    const quote: RateQuote = {
      provider: 'frankfurter',
      base: 'BRL',
      asOf: '2026-08-14',
      // `exchange_rates` has foreign keys into `currencies`; an unknown code
      // here would fail the whole insert rather than just its own row.
      rates: { USD: '0.19319', ZAR: '3.4', ISK: '25.1' },
    };

    expect(rebase(quote, 'BRL', supported).map((r) => r.quoteCode)).toEqual(['USD']);
  });

  it('never emits a row for the base against itself', () => {
    const quote: RateQuote = {
      provider: 'frankfurter',
      base: 'BRL',
      asOf: '2026-08-14',
      rates: { BRL: '1', USD: '0.19319' },
    };

    expect(rebase(quote, 'BRL', supported).map((r) => r.quoteCode)).toEqual(['USD']);
  });

  it('refuses to rebase onto a currency the provider did not quote', () => {
    const quote: RateQuote = {
      provider: 'openexchangerates',
      base: 'USD',
      asOf: '2026-08-14',
      rates: { EUR: '0.92' },
    };

    expect(() => rebase(quote, 'BRL', supported)).toThrow(/cannot be rebased/);
  });

  it('refuses to divide by an unusable pivot rate', () => {
    const quote: RateQuote = {
      provider: 'openexchangerates',
      base: 'USD',
      asOf: '2026-08-14',
      rates: { BRL: '0', EUR: '0.92' },
    };

    expect(() => rebase(quote, 'BRL', supported)).toThrow(/unusable/);
  });
});
