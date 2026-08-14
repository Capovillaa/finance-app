import { describe, expect, it } from 'vitest';
import {
  descriptionsMatch,
  guessDecimalSeparator,
  guessMapping,
  guessSignConvention,
  inferDateFormat,
  mappingIsComplete,
  parseAmount,
  parseDateValue,
  parseDirectionFlag,
} from '../../src/modules/imports/mapping.js';

describe('guessMapping', () => {
  it('recognises an English header row', () => {
    expect(guessMapping(['Date', 'Description', 'Amount'])).toEqual({ date: 0, description: 1, amount: 2 });
  });

  it('recognises a Brazilian header row, accents and all', () => {
    expect(guessMapping(['Data', 'Histórico', 'Valor'])).toEqual({ date: 0, description: 1, amount: 2 });
  });

  it('recognises a Spanish header row', () => {
    expect(guessMapping(['Fecha', 'Concepto', 'Importe'])).toEqual({ date: 0, description: 1, amount: 2 });
  });

  it('maps separate debit and credit columns', () => {
    const mapping = guessMapping(['Date', 'Description', 'Debit', 'Credit']);
    expect(mapping).toEqual({ date: 0, description: 1, debit: 2, credit: 3 });
    expect(guessSignConvention(mapping)).toBe('debit_credit');
  });

  it('maps a direction flag column', () => {
    const mapping = guessMapping(['Data', 'Histórico', 'Valor', 'Tipo']);
    expect(mapping.direction).toBe(3);
    expect(guessSignConvention(mapping)).toBe('direction_flag');
  });

  it('prefers an exact header over one that merely contains a synonym', () => {
    // "Data de Compensação" contains `data`; the bare "Data" must still win.
    const mapping = guessMapping(['Data de Compensação', 'Data', 'Histórico', 'Valor']);
    expect(mapping.date).toBe(1);
  });

  it('never assigns one column to two fields', () => {
    const mapping = guessMapping(['Date', 'Details', 'Amount']);
    const indexes = Object.values(mapping);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it('leaves unknown headers unmapped', () => {
    const mapping = guessMapping(['col1', 'col2']);
    expect(mappingIsComplete(mapping)).toBe(false);
  });

  it('accepts a merchant column in place of a description', () => {
    expect(mappingIsComplete({ date: 0, merchant: 1, amount: 2 })).toBe(true);
    expect(mappingIsComplete({ date: 0, description: 1 })).toBe(false);
    expect(mappingIsComplete({ description: 0, amount: 1 })).toBe(false);
  });
});

describe('parseAmount', () => {
  it('reads a plain dot-decimal amount', () => {
    expect(parseAmount('123.45')).toBe('123.4500');
    expect(parseAmount('-123.45')).toBe('-123.4500');
  });

  it('reads a comma-decimal amount with dot thousands', () => {
    expect(parseAmount('1.234,56', ',')).toBe('1234.5600');
    expect(parseAmount('-1.234,56', ',')).toBe('-1234.5600');
  });

  it('reads a dot-decimal amount with comma thousands', () => {
    expect(parseAmount('1,234.56', '.')).toBe('1234.5600');
  });

  it('strips currency symbols and spaces', () => {
    expect(parseAmount('R$ 1.234,56', ',')).toBe('1234.5600');
    expect(parseAmount('$1,234.56', '.')).toBe('1234.5600');
    expect(parseAmount('1 234,56 BRL', ',')).toBe('1234.5600');
  });

  it('treats accounting parentheses and a trailing minus as negative', () => {
    expect(parseAmount('(123.45)')).toBe('-123.4500');
    expect(parseAmount('123,45-', ',')).toBe('-123.4500');
  });

  it('rejects text and blanks', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
    expect(parseAmount('R$')).toBeNull();
  });

  it('keeps precision beyond two places', () => {
    expect(parseAmount('0.0001')).toBe('0.0001');
  });
});

describe('guessDecimalSeparator', () => {
  it('picks the mark that comes last when a value has both', () => {
    expect(guessDecimalSeparator(['1.234,56', '9.876,54'])).toBe(',');
    expect(guessDecimalSeparator(['1,234.56', '9,876.54'])).toBe('.');
  });

  it('reads a lone mark with three trailing digits as a thousands separator', () => {
    expect(guessDecimalSeparator(['1.234', '5.678'])).toBe(',');
    expect(guessDecimalSeparator(['1,234', '5,678'])).toBe('.');
  });

  it('reads a lone mark with two trailing digits as the decimal', () => {
    expect(guessDecimalSeparator(['10,50', '99,90'])).toBe(',');
    expect(guessDecimalSeparator(['10.50', '99.90'])).toBe('.');
  });

  it('falls back to a dot with nothing to go on', () => {
    expect(guessDecimalSeparator([])).toBe('.');
    expect(guessDecimalSeparator(['100', '200'])).toBe('.');
  });
});

describe('inferDateFormat', () => {
  it('recognises ISO dates outright', () => {
    expect(inferDateFormat(['2026-03-01', '2026-03-02'])).toEqual({ format: 'iso', ambiguous: false });
  });

  it('reads a day above 12 in first position as day-first', () => {
    expect(inferDateFormat(['01/03/2026', '25/03/2026'])).toEqual({ format: 'dmy', ambiguous: false });
  });

  it('reads a day above 12 in second position as month-first', () => {
    expect(inferDateFormat(['03/01/2026', '03/25/2026'])).toEqual({ format: 'mdy', ambiguous: false });
  });

  it('flags a file where every date reads both ways', () => {
    // The first twelve days of a month are genuinely indistinguishable.
    expect(inferDateFormat(['01/02/2026', '03/04/2026'])).toEqual({ format: 'dmy', ambiguous: true });
  });

  it('flags a file that contradicts itself rather than choosing', () => {
    expect(inferDateFormat(['25/03/2026', '03/25/2026'])).toEqual({ format: null, ambiguous: true });
  });

  it('reports nothing when there are no dates at all', () => {
    expect(inferDateFormat(['', 'not a date'])).toEqual({ format: null, ambiguous: false });
  });
});

describe('parseDateValue', () => {
  it('applies the requested reading', () => {
    expect(parseDateValue('01/03/2026', 'dmy')).toBe('2026-03-01');
    expect(parseDateValue('01/03/2026', 'mdy')).toBe('2026-01-03');
  });

  it('reads an ISO date as ISO whatever format was requested', () => {
    expect(parseDateValue('2026-03-01', 'mdy')).toBe('2026-03-01');
  });

  it('accepts dots and dashes as separators, and a trailing time', () => {
    expect(parseDateValue('01.03.2026', 'dmy')).toBe('2026-03-01');
    expect(parseDateValue('01-03-2026', 'dmy')).toBe('2026-03-01');
    expect(parseDateValue('01/03/2026 14:32', 'dmy')).toBe('2026-03-01');
  });

  it('expands a two-digit year', () => {
    expect(parseDateValue('01/03/26', 'dmy')).toBe('2026-03-01');
    expect(parseDateValue('01/03/99', 'dmy')).toBe('1999-03-01');
  });

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseDateValue('31/02/2026', 'dmy')).toBeNull();
    expect(parseDateValue('13/13/2026', 'dmy')).toBeNull();
    expect(parseDateValue('', 'dmy')).toBeNull();
    expect(parseDateValue('yesterday', 'dmy')).toBeNull();
  });
});

describe('parseDirectionFlag', () => {
  it('reads the usual debit and credit markers in three languages', () => {
    for (const flag of ['D', 'debito', 'Débito', 'Debit', 'saida', 'W']) {
      expect(parseDirectionFlag(flag)).toBe(-1);
    }
    for (const flag of ['C', 'credito', 'Crédito', 'Credit', 'entrada', 'abono']) {
      expect(parseDirectionFlag(flag)).toBe(1);
    }
  });

  it('returns null for anything it does not recognise', () => {
    expect(parseDirectionFlag('X')).toBeNull();
    expect(parseDirectionFlag('')).toBeNull();
  });
});

describe('descriptionsMatch', () => {
  it('ignores case, accents and punctuation', () => {
    expect(descriptionsMatch('PADARIA CENTRAL', 'Padaria Central')).toBe(true);
    expect(descriptionsMatch('Mercado São João', 'MERCADO SAO JOAO')).toBe(true);
    expect(descriptionsMatch('Uber *trip', 'UBER TRIP')).toBe(true);
  });

  it('matches when one is a prefix of the other with enough to go on', () => {
    expect(descriptionsMatch('Padaria Central', 'Padaria Central 4417')).toBe(true);
  });

  it('does not match on a short common prefix', () => {
    expect(descriptionsMatch('Uber', 'Uber Eats')).toBe(false);
  });

  it('does not match unrelated descriptions', () => {
    expect(descriptionsMatch('Padaria Central', 'Aluguel')).toBe(false);
    expect(descriptionsMatch('', 'Aluguel')).toBe(false);
  });
});
