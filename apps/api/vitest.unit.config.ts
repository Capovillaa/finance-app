import { defineConfig } from 'vitest/config';

/**
 * Pure-logic tests only: money, dates, recurrence, anomaly detectors, CSV.
 * No global setup, so these run with no Postgres or Redis available — useful in
 * CI's fast lane and when the database is not reachable.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
