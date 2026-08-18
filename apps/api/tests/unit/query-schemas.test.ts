import { describe, expect, it } from 'vitest';
import { paginationSchema } from '../../src/lib/http.js';
import { csvUuidArray } from '../../src/modules/shared/schemas.js';

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('csvUuidArray', () => {
  it('accepts a normal, small list', () => {
    const result = csvUuidArray.safeParse(`${uuid(1)},${uuid(2)}`);
    expect(result.success).toBe(true);
  });

  it('rejects a list past the cap — L-3 in AUDIT_REPORT.md', () => {
    // `?accountIds=<10k uuids>` used to become a single enormous `IN` clause.
    const tooMany = Array.from({ length: 101 }, (_, i) => uuid(i)).join(',');
    const result = csvUuidArray.safeParse(tooMany);
    expect(result.success).toBe(false);
  });

  it('accepts exactly the cap', () => {
    const atCap = Array.from({ length: 100 }, (_, i) => uuid(i)).join(',');
    expect(csvUuidArray.safeParse(atCap).success).toBe(true);
  });
});

describe('paginationSchema', () => {
  it('accepts an ordinary page', () => {
    expect(paginationSchema.safeParse({ page: 3, pageSize: 50 }).success).toBe(true);
  });

  it('rejects a page past the cap — L-8 in AUDIT_REPORT.md', () => {
    // Unbounded, this was a deep-OFFSET scan available to any caller.
    expect(paginationSchema.safeParse({ page: 100_001 }).success).toBe(false);
  });

  it('accepts exactly the cap', () => {
    expect(paginationSchema.safeParse({ page: 100_000 }).success).toBe(true);
  });
});
