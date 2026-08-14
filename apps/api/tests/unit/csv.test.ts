import { describe, expect, it } from 'vitest';
import { csvField, parseCsv, sniffDelimiter, toCsv } from '../../src/lib/csv.js';

describe('csvField', () => {
  it('passes ordinary values through', () => {
    expect(csvField('Mercado')).toBe('Mercado');
    expect(csvField(42)).toBe('42');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes fields containing separators or newlines', () => {
    expect(csvField('Padaria, Central')).toBe('"Padaria, Central"');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('escapes embedded quotes by doubling them', () => {
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('neutralises spreadsheet formula injection', () => {
    // A description starting with = would execute as a formula in Excel.
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('+HYPERLINK("http://evil")')).toBe('"\'+HYPERLINK(""http://evil"")"');
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('-2+3')).toBe("'-2+3");
  });
});

describe('toCsv', () => {
  it('emits a BOM and CRLF line endings', () => {
    const csv = toCsv(['a', 'b'], [['1', '2']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
  });

  it('writes the header followed by each row', () => {
    const csv = toCsv(['Date', 'Amount'], [['2026-01-01', '10.00'], ['2026-01-02', '20.00']]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Date,Amount');
    expect(lines[1]).toBe('2026-01-01,10.00');
    expect(lines).toHaveLength(3);
  });
});

describe('parseCsv', () => {
  it('reads plain rows', () => {
    const { rows } = parseCsv('Date,Amount\n2026-01-01,10.00');
    expect(rows).toEqual([
      ['Date', 'Amount'],
      ['2026-01-01', '10.00'],
    ]);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    const { rows } = parseCsv('﻿Date,Amount\n2026-01-01,10.00');
    expect(rows[0]).toEqual(['Date', 'Amount']);
  });

  it('handles CRLF, bare CR and a missing trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n').rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps delimiters and newlines that sit inside quotes', () => {
    const { rows } = parseCsv('desc,amount\n"Padaria, Central","10.00"\n"line1\nline2",20.00');
    expect(rows[1]).toEqual(['Padaria, Central', '10.00']);
    expect(rows[2]).toEqual(['line1\nline2', '20.00']);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"He said ""hi"""').rows[1]).toEqual(['He said "hi"']);
  });

  it('round-trips its own writer', () => {
    const written = toCsv(['Description', 'Amount'], [['Padaria, "Central"\nunit 2', '-10.00']]);
    // The writer's formula guard prefixes a leading `-`, which is not the
    // parser's business to undo — the field otherwise survives intact.
    expect(parseCsv(written).rows[1]).toEqual(['Padaria, "Central"\nunit 2', "'-10.00"]);
  });

  it('drops blank rows but preserves ragged ones for the caller to report', () => {
    const { rows } = parseCsv('a,b,c\n1,2,3\n\n4,5');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5'],
    ]);
  });

  it('preserves empty fields inside a row', () => {
    expect(parseCsv('a,b,c\n1,,3').rows[1]).toEqual(['1', '', '3']);
  });
});

describe('sniffDelimiter', () => {
  it('detects the common delimiters', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(sniffDelimiter('a|b|c\n1|2|3')).toBe('|');
  });

  it('is not fooled by commas that only appear inside quoted fields', () => {
    // A Brazilian export: semicolon-separated, comma as the decimal mark.
    const text = 'Data;Histórico;Valor\n01/03/2026;"Padaria, Central";-10,50\n02/03/2026;"Mercado, Bom";-99,90';
    expect(sniffDelimiter(text)).toBe(';');
    expect(parseCsv(text).rows[1]).toEqual(['01/03/2026', 'Padaria, Central', '-10,50']);
  });

  it('falls back to a comma when there is nothing to go on', () => {
    expect(sniffDelimiter('')).toBe(',');
    expect(sniffDelimiter('single-column')).toBe(',');
  });
});
