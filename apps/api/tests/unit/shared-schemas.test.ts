import {
  LIMITS,
  VALIDATION_LOCALES,
  VALIDATION_MESSAGES,
  VALIDATION_PARAMS,
  dateField,
  isDateOnlyText,
  isMoneyText,
  isPositiveMoneyText,
  isSafeUrl,
  isWholeNumberInRange,
  leadTimeDaysField,
  moneyField,
  occurrenceLimitField,
  passwordField,
  positiveMoneyField,
  recurringIntervalField,
  urlField,
  validationParamsFor,
} from '@finance/schemas';
import { describe, expect, it } from 'vitest';

/**
 * The rules `apps/api` and `apps/web` now share.
 *
 * These tests exist because of a specific failure: the two used to declare the
 * same bounds separately and drifted, so a form accepted values the API refused.
 * The `agrees with the text form` cases below are the ones that matter — they
 * check the two halves of each shared rule against each other, which is exactly
 * what nothing checked before.
 */

describe('money shapes', () => {
  it('accepts the forms a ledger amount can take', () => {
    for (const value of ['0', '1', '1.5', '1250.0000', '-42.75', '999999999999999.9999']) {
      expect(isMoneyText(value)).toBe(true);
    }
  });

  it('rejects anything that is not a plain decimal', () => {
    for (const value of ['', ' ', '1,50', '1.23456', 'abc', '1e3', '+1', '.5', '1.']) {
      expect(isMoneyText(value)).toBe(false);
    }
  });

  it('caps the decimals at what NUMERIC(19,4) stores', () => {
    expect(isMoneyText(`1.${'0'.repeat(LIMITS.money.decimals)}`)).toBe(true);
    expect(isMoneyText(`1.${'0'.repeat(LIMITS.money.decimals + 1)}`)).toBe(false);
  });

  it('treats zero and negatives as not-an-amount where a magnitude is wanted', () => {
    expect(isPositiveMoneyText('0')).toBe(false);
    expect(isPositiveMoneyText('0.0000')).toBe(false);
    expect(isPositiveMoneyText('-1')).toBe(false);
    expect(isPositiveMoneyText('0.0001')).toBe(true);
  });

  it('accepts a JSON number as well as a string on the wire', () => {
    expect(moneyField.safeParse(12.5).success).toBe(true);
    expect(moneyField.safeParse('12.5').success).toBe(true);
    expect(positiveMoneyField.safeParse(0).success).toBe(false);
  });
});

describe('date shapes', () => {
  it('accepts a real calendar date', () => {
    expect(isDateOnlyText('2026-02-28')).toBe(true);
    expect(isDateOnlyText('2024-02-29')).toBe(true); // leap year
  });

  it('rejects a well-shaped date that does not exist', () => {
    expect(isDateOnlyText('2025-02-30')).toBe(false);
    expect(isDateOnlyText('2025-02-29')).toBe(false); // not a leap year
    expect(isDateOnlyText('2025-13-01')).toBe(false);
    expect(isDateOnlyText('2025-00-10')).toBe(false);
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    for (const value of ['', '2025-1-1', '01/02/2025', '2025-01-01T00:00:00Z']) {
      expect(dateField.safeParse(value).success).toBe(false);
    }
  });
});

describe('bounds that had drifted between the two sides', () => {
  // Each pair is the server's own field and the predicate the web form applies
  // to the same value typed as text. They must answer identically, or a form
  // accepts input the API rejects — which is exactly what used to happen.
  const cases = [
    { name: 'recurrence interval', field: recurringIntervalField, bounds: LIMITS.recurringInterval },
    { name: 'occurrence limit', field: occurrenceLimitField, bounds: LIMITS.occurrenceLimit },
    { name: 'lead time in days', field: leadTimeDaysField, bounds: LIMITS.leadTimeDays },
  ] as const;

  for (const { name, field, bounds } of cases) {
    it(`${name} agrees with the text form at every boundary`, () => {
      const probes = [bounds.min - 1, bounds.min, bounds.min + 1, bounds.max - 1, bounds.max, bounds.max + 1];
      for (const probe of probes) {
        expect(isWholeNumberInRange(String(probe), bounds.min, bounds.max)).toBe(
          field.safeParse(probe).success,
        );
      }
    });

    it(`${name} rejects a value past its ceiling`, () => {
      expect(field.safeParse(bounds.max).success).toBe(true);
      expect(field.safeParse(bounds.max + 1).success).toBe(false);
    });
  }

  it('reads a whole number only, never a fraction or a sign', () => {
    expect(isWholeNumberInRange('3', 0, 90)).toBe(true);
    expect(isWholeNumberInRange('3.5', 0, 90)).toBe(false);
    expect(isWholeNumberInRange('-3', -10, 90)).toBe(false);
    expect(isWholeNumberInRange('', 0, 90)).toBe(false);
  });
});

describe('URL shape', () => {
  // M-2 in AUDIT_REPORT.md: `javascript:`, `data:` and `file:` all parse
  // successfully as a URL, so a bare format check lets them through a field
  // every other workspace member's browser then fetches.
  it('accepts only https:', () => {
    expect(isSafeUrl('https://example.com/avatar.png')).toBe(true);
    expect(isSafeUrl('http://example.com/avatar.png')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('not a url at all')).toBe(false);
  });

  it('urlField agrees with isSafeUrl', () => {
    for (const value of ['https://example.com', 'http://example.com', 'javascript:alert(1)']) {
      expect(urlField.safeParse(value).success).toBe(isSafeUrl(value));
    }
  });
});

describe('password rule', () => {
  it('needs the shared minimum length and both character classes', () => {
    const short = 'a1'.repeat(Math.floor((LIMITS.password.min - 1) / 2));
    expect(passwordField.safeParse(short).success).toBe(false);
    expect(passwordField.safeParse('a'.repeat(LIMITS.password.min)).success).toBe(false);
    expect(passwordField.safeParse('1'.repeat(LIMITS.password.min)).success).toBe(false);
    expect(passwordField.safeParse(`abcdefgh${'9'.repeat(LIMITS.password.min - 8)}`).success).toBe(true);
  });
});

describe('validation catalogue', () => {
  const placeholders = (text: string): string[] =>
    [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!);

  it('interpolates only values the schemas actually supply', () => {
    for (const locale of VALIDATION_LOCALES) {
      for (const [name, text] of Object.entries(VALIDATION_MESSAGES[locale])) {
        const supplied = Object.keys(validationParamsFor(`validation.${name}`) ?? {});
        for (const placeholder of placeholders(text)) {
          expect(
            supplied,
            `${locale} "validation.${name}" interpolates {{${placeholder}}}, which nothing supplies`,
          ).toContain(placeholder);
        }
      }
    }
  });

  it('never drops a number in translation', () => {
    for (const [key, params] of Object.entries(VALIDATION_PARAMS)) {
      const name = key.replace('validation.', '');
      for (const locale of VALIDATION_LOCALES) {
        const text = VALIDATION_MESSAGES[locale][name as keyof (typeof VALIDATION_MESSAGES)['en']];
        for (const param of Object.keys(params ?? {})) {
          expect(
            placeholders(text),
            `${locale} "${key}" must interpolate {{${param}}}, or the sentence loses the bound it is quoting`,
          ).toContain(param);
        }
      }
    }
  });

  it('quotes the bound the schemas enforce, not a copy of it', () => {
    expect(validationParamsFor('validation.occurrenceLimitRange')).toEqual({
      min: LIMITS.occurrenceLimit.min,
      max: LIMITS.occurrenceLimit.max,
    });
    expect(validationParamsFor('validation.maxTags')).toEqual({ max: LIMITS.tagsPerTransaction.max });
    expect(validationParamsFor('validation.nameRequired')).toBeUndefined();
  });
});
