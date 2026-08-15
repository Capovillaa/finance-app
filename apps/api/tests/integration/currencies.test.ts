import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import type { RateProvider } from '../../src/modules/currencies/providers.js';
import { fetchLiveRates, getRate, refreshStaticRates } from '../../src/modules/currencies/service.js';

/**
 * The provider itself is unit-tested against a stubbed `fetch`; what this file
 * proves is the half that only a database can answer — that a live quote lands
 * as rows the foreign keys accept, and that `getRate` then resolves against
 * them the same way it resolves the static table.
 */

const ASOF = '2026-08-14';

function stubProvider(rates: Record<string, string>, base = 'BRL', asOf = ASOF): RateProvider {
  return {
    name: 'frankfurter',
    fetchLatest: async () => ({ provider: 'frankfurter', base, asOf, rates }),
  };
}

describe('live exchange rates', () => {
  it('stores a quote against the base currency and answers from it', async () => {
    const count = await fetchLiveRates(stubProvider({ USD: '0.19319', EUR: '0.16702' }), 'BRL');
    expect(count).toBe(2);

    expect(await getRate('BRL', 'USD', ASOF)).toBe('0.19319');
    // The inverse falls out of the same row rather than needing its own.
    expect(Number(await getRate('USD', 'BRL', ASOF))).toBeCloseTo(1 / 0.19319, 6);
  });

  it('stamps rows with the provider and the date the provider gave, not today', async () => {
    await fetchLiveRates(stubProvider({ USD: '0.19319' }), 'BRL');

    const rows = await db.selectFrom('exchange_rates').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ base_code: 'BRL', quote_code: 'USD', as_of: ASOF, source: 'frankfurter' });
  });

  it('drops currencies the table does not know instead of failing the insert', async () => {
    // ZAR and ISK are real ECB currencies and are not in `currencies`, whose
    // foreign key would reject the whole statement over one unknown code.
    const count = await fetchLiveRates(stubProvider({ USD: '0.19319', ZAR: '3.4', ISK: '25.1' }), 'BRL');

    expect(count).toBe(1);
    const quoted = await db.selectFrom('exchange_rates').select('quote_code').execute();
    expect(quoted.map((r) => r.quote_code)).toEqual(['USD']);
  });

  it('rewrites the same day rather than accumulating a row per refresh', async () => {
    await fetchLiveRates(stubProvider({ USD: '0.19319' }), 'BRL');
    await fetchLiveRates(stubProvider({ USD: '0.19500' }), 'BRL');

    const rows = await db.selectFrom('exchange_rates').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(await getRate('BRL', 'USD', ASOF)).toBe('0.195');
  });

  it('cross-resolves a pair neither side of which is the base', async () => {
    await fetchLiveRates(stubProvider({ USD: '0.19319', EUR: '0.16702' }), 'BRL');

    // USD -> EUR via BRL. Postgres and decimal.js round the division on
    // different sides of a tie, so this is compared as a number.
    expect(Number(await getRate('USD', 'EUR', ASOF))).toBeCloseTo(0.16702 / 0.19319, 6);
  });

  it('refuses a base currency the table cannot store rates against', async () => {
    await expect(fetchLiveRates(stubProvider({ USD: '0.19319' }), 'XXX')).rejects.toThrow(/currencies table/);
  });

  it('refuses a quote that leaves nothing to store', async () => {
    await expect(fetchLiveRates(stubProvider({ ZAR: '3.4' }), 'BRL')).rejects.toThrow(/no rates/);
  });

  it('leaves an earlier static rate reachable for a date before the live one', async () => {
    await refreshStaticRates('2026-08-01');
    await fetchLiveRates(stubProvider({ USD: '0.19319' }), 'BRL');

    // A transaction dated before the live refresh keeps the rate that applied
    // on its own day — the whole reason `as_of` is truthful.
    expect(await getRate('BRL', 'USD', '2026-08-10')).toBe('0.185');
    expect(await getRate('BRL', 'USD', ASOF)).toBe('0.19319');
  });
});
