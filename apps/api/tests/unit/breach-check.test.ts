import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkPasswordBreach, type HttpResponseLike } from '../../src/modules/auth/breachCheck.js';

/**
 * L-7 in AUDIT_REPORT.md: this module is pure apart from a single injectable
 * `fetch`, so it runs in the unit lane with no network at all — the same
 * pattern `modules/currencies/providers.ts` uses.
 */

function suffixFor(password: string): string {
  return createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase().slice(5);
}

function textResponse(body: string, ok = true, status = 200): HttpResponseLike {
  return { ok, status, text: async () => body };
}

describe('checkPasswordBreach', () => {
  it('reports a breach when the suffix appears in the range response', async () => {
    const suffix = suffixFor('Password12345');
    const body = `0000000000000000000000000000000000:1\r\n${suffix}:14421\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2\r\n`;

    const result = await checkPasswordBreach('Password12345', { fetchImpl: async () => textResponse(body) });

    expect(result).toEqual({ breached: true, count: 14421 });
  });

  it('reports no breach when the suffix is absent', async () => {
    const body = '0000000000000000000000000000000000:1\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2\r\n';

    const result = await checkPasswordBreach('A Genuinely Unguessable Passphrase 9931', {
      fetchImpl: async () => textResponse(body),
    });

    expect(result).toEqual({ breached: false, count: 0 });
  });

  it('matches the suffix case-insensitively', async () => {
    const suffix = suffixFor('LowercaseSuffixTest1');
    const body = `${suffix.toLowerCase()}:3\r\n`;

    const result = await checkPasswordBreach('LowercaseSuffixTest1', { fetchImpl: async () => textResponse(body) });

    expect(result).toEqual({ breached: true, count: 3 });
  });

  it('sends only the 5-character prefix, never the password or the full hash', async () => {
    let requestedUrl = '';
    await checkPasswordBreach('SomeRealPassword123', {
      fetchImpl: async (url) => {
        requestedUrl = url;
        return textResponse('');
      },
    });

    const prefix = createHash('sha1').update('SomeRealPassword123', 'utf8').digest('hex').toUpperCase().slice(0, 5);
    expect(requestedUrl).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
    expect(requestedUrl).not.toContain('SomeRealPassword123');
  });

  it('respects an apiUrl override, and falls back on a blank one', async () => {
    let requestedUrl = '';
    await checkPasswordBreach('x', {
      apiUrl: 'https://mirror.example.internal/range/',
      fetchImpl: async (url) => {
        requestedUrl = url;
        return textResponse('');
      },
    });
    expect(requestedUrl.startsWith('https://mirror.example.internal/range/')).toBe(true);

    let fallbackUrl = '';
    await checkPasswordBreach('x', {
      apiUrl: '   ',
      fetchImpl: async (url) => {
        fallbackUrl = url;
        return textResponse('');
      },
    });
    expect(fallbackUrl.startsWith('https://api.pwnedpasswords.com/range/')).toBe(true);
  });

  it('throws on a non-OK HTTP response', async () => {
    await expect(
      checkPasswordBreach('x', { fetchImpl: async () => textResponse('', false, 503) }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it('throws when the fetch itself fails', async () => {
    await expect(
      checkPasswordBreach('x', {
        fetchImpl: async () => {
          throw new Error('getaddrinfo ENOTFOUND');
        },
      }),
    ).rejects.toThrow(/pwned-passwords request failed/);
  });

  it('describes a timeout distinctly from any other failure', async () => {
    await expect(
      checkPasswordBreach('x', {
        fetchImpl: async () => {
          const err = new Error('aborted');
          err.name = 'TimeoutError';
          throw err;
        },
      }),
    ).rejects.toThrow(/timed out/);
  });
});
