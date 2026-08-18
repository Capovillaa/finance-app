import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requestTimeout } from '../../src/middleware/request-timeout.js';

/**
 * `requestTimeout` (M-4 in AUDIT_REPORT.md) is exercised here rather than
 * through a real HTTP request: what matters is purely timer-vs-event
 * ordering, which fake timers and a bare `EventEmitter` standing in for
 * `res` can pin exactly, without a database or a real socket.
 */
function fakeResponse(): Response {
  const res = new EventEmitter() as unknown as Response;
  res.headersSent = false;
  return res;
}

describe('requestTimeout', () => {
  it('lets the request through immediately', () => {
    const next = vi.fn();
    requestTimeout(1000)({} as Request, fakeResponse(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('answers 503 via next(err) when nothing has responded by the deadline', () => {
    vi.useFakeTimers();
    try {
      const next = vi.fn();
      requestTimeout(1000)({} as Request, fakeResponse(), next);
      next.mockClear();

      vi.advanceTimersByTime(1000);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0]![0];
      expect(err).toMatchObject({ code: 'service_unavailable', status: 503 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('never fires once the response has already finished', () => {
    vi.useFakeTimers();
    try {
      const next = vi.fn();
      const res = fakeResponse();
      requestTimeout(1000)({} as Request, res, next);
      res.emit('finish');
      next.mockClear();

      vi.advanceTimersByTime(1000);

      expect(next).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never fires once the connection has closed', () => {
    vi.useFakeTimers();
    try {
      const next = vi.fn();
      const res = fakeResponse();
      requestTimeout(1000)({} as Request, res, next);
      res.emit('close');
      next.mockClear();

      vi.advanceTimersByTime(1000);

      expect(next).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not answer a second time once headers are already sent', () => {
    // The handler behind this middleware started streaming a response of its
    // own — a CSV export, say — before the deadline. A second 503 body would
    // be a write onto an already-started response.
    vi.useFakeTimers();
    try {
      const next = vi.fn();
      const res = fakeResponse();
      requestTimeout(1000)({} as Request, res, next);
      res.headersSent = true;
      next.mockClear();

      vi.advanceTimersByTime(1000);

      expect(next).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
