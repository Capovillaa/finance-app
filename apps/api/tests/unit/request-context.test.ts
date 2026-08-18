/**
 * `middleware/request-context.ts` imports `lib/logger.ts`, which imports
 * `config/env.ts` — stubbed here the same way `tests/unit/openapi.test.ts`
 * and `tests/unit/db-client.test.ts` do, via `await import` so the
 * assignments below run before env.ts is ever evaluated.
 */
process.env.DATABASE_URL ??= 'postgres://request-context-test:x@localhost:5432/request_context_test_not_connected';
process.env.JWT_ACCESS_SECRET ??= 'request-context-test-placeholder-secret';
process.env.JWT_REFRESH_SECRET ??= 'request-context-test-placeholder-secret';
process.env.EMAIL_TOKEN_SECRET ??= 'request-context-test-placeholder-secret';

import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

const { requestId } = await import('../../src/middleware/request-context.js');

/**
 * L-1 in AUDIT_REPORT.md: a length cap alone still let a client hand this
 * process a newline or a control character, which then landed verbatim in
 * every log line for the request and in the echoed response header.
 */
function fakeRequest(headerValue: string | undefined): Request {
  return { header: () => headerValue } as unknown as Request;
}

function fakeResponse(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response;
  return { res, headers };
}

describe('requestId', () => {
  it('adopts a plain, well-shaped incoming id', () => {
    const req = fakeRequest('a-real-trace-id_123');
    const { res, headers } = fakeResponse();
    requestId(req, res, vi.fn());

    expect(req.requestId).toBe('a-real-trace-id_123');
    expect(headers['x-request-id']).toBe('a-real-trace-id_123');
  });

  it('generates a fresh id when none was sent', () => {
    const req = fakeRequest(undefined);
    const { res } = fakeResponse();
    requestId(req, res, vi.fn());

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a newline instead of embedding it in every log line', () => {
    const req = fakeRequest('legit-id\nfake log line injected here');
    const { res, headers } = fakeResponse();
    requestId(req, res, vi.fn());

    expect(req.requestId).not.toContain('\n');
    expect(headers['x-request-id']).not.toContain('\n');
  });

  it('refuses anything outside the safe charset', () => {
    for (const bad of ['id with spaces', 'id\twith\ttabs', 'id;drop table', '日本語', '']) {
      const req = fakeRequest(bad);
      const { res } = fakeResponse();
      requestId(req, res, vi.fn());
      expect(req.requestId).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('refuses an id over 128 characters', () => {
    const req = fakeRequest('a'.repeat(129));
    const { res } = fakeResponse();
    requestId(req, res, vi.fn());

    expect(req.requestId).not.toBe('a'.repeat(129));
  });
});
