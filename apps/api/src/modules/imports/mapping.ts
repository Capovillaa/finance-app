import { formatDate, isDateOnly, type DateOnly } from '../../lib/dates.js';
import { money } from '../../lib/money.js';

/**
 * Everything here is pure: header names in, a guess out. Nothing in this file
 * touches the database or the request, which is what makes the parts of an
 * import that are actually hard to get right — which column is the amount, which
 * way round the date is, which sign means money left the account — unit
 * testable in isolation.
 */

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const IMPORT_COLUMNS = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'direction',
  'merchant',
  'notes',
  'category',
  'externalId',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Column name -> zero-based index into the file's fields. Absent means unmapped. */
export type ColumnMapping = Partial<Record<ImportColumn, number>>;

/**
 * Header synonyms, English/Portuguese/Spanish, matched after normalisation.
 * Order matters: the first entry that a header contains wins, so the more
 * specific terms are listed before the ones that are substrings of them.
 */
const HEADER_SYNONYMS: Record<ImportColumn, string[]> = {
  date: ['datadetransacao', 'datatransacao', 'transactiondate', 'postingdate', 'datalancamento', 'fechavalor', 'data', 'date', 'fecha', 'dia'],
  description: ['historico', 'descricao', 'description', 'descripcion', 'concepto', 'detalhe', 'detalle', 'details', 'memo', 'narrative', 'lancamento'],
  amount: ['valorbrl', 'valor', 'amount', 'importe', 'monto', 'quantia', 'montante', 'value'],
  debit: ['debito', 'debit', 'saida', 'salida', 'withdrawal', 'cargo', 'paidout'],
  credit: ['credito', 'credit', 'entrada', 'deposit', 'abono', 'paidin'],
  direction: ['tipolancamento', 'debitocredito', 'dc', 'tipo', 'type', 'sentido', 'natureza', 'indicator'],
  merchant: ['estabelecimento', 'merchant', 'payee', 'beneficiario', 'comercio', 'contraparte', 'counterparty'],
  notes: ['observacao', 'observacoes', 'notes', 'note', 'nota', 'notas', 'obs', 'comentario'],
  category: ['categoria', 'category', 'classificacao', 'rubrica'],
  externalId: ['idtransacao', 'transactionid', 'identificador', 'documento', 'referencia', 'reference', 'fitid', 'id'],
};

/**
 * Strips accents, case and punctuation so `Histórico`, `HISTORICO` and
 * `Histórico ` are one header, and `Data de Transação` matches `datatransacao`.
 */
export function normaliseHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Guesses which file column feeds which field. Exact matches are taken first
 * across every column, so a header that is exactly `Data` cannot be stolen by a
 * `Data de Compensação` that merely contains a synonym.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalised = headers.map(normaliseHeader);
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();

  const claim = (column: ImportColumn, index: number) => {
    if (mapping[column] !== undefined || taken.has(index)) return;
    mapping[column] = index;
    taken.add(index);
  };

  for (const column of IMPORT_COLUMNS) {
    for (const synonym of HEADER_SYNONYMS[column]) {
      const index = normalised.indexOf(synonym);
      if (index !== -1) {
        claim(column, index);
        break;
      }
    }
  }

  for (const column of IMPORT_COLUMNS) {
    if (mapping[column] !== undefined) continue;
    for (const synonym of HEADER_SYNONYMS[column]) {
      const index = normalised.findIndex((header, i) => !taken.has(i) && header.includes(synonym));
      if (index !== -1) {
        claim(column, index);
        break;
      }
    }
  }

  return mapping;
}

/** `true` when the mapping names every column an import cannot proceed without. */
export function mappingIsComplete(mapping: ColumnMapping): boolean {
  if (mapping.date === undefined) return false;
  if (mapping.description === undefined && mapping.merchant === undefined) return false;
  return mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined;
}

// ---------------------------------------------------------------------------
// Sign convention
// ---------------------------------------------------------------------------

/**
 * The three shapes a bank export uses for direction, all of which occur:
 * one signed amount; separate debit and credit columns; or a positive amount
 * beside a `D`/`C` flag. Guessing this wrong inverts a whole statement, so the
 * resolved choice is always echoed back in the preview for the user to see.
 */
export type SignConvention = 'signed' | 'debit_credit' | 'direction_flag';

export function guessSignConvention(mapping: ColumnMapping): SignConvention {
  if (mapping.debit !== undefined || mapping.credit !== undefined) return 'debit_credit';
  if (mapping.direction !== undefined) return 'direction_flag';
  return 'signed';
}

const DEBIT_FLAGS = ['d', 'db', 'debito', 'debit', 'deb', 'saida', 'salida', 'withdrawal', 'w', 'out', '-'];
const CREDIT_FLAGS = ['c', 'cr', 'credito', 'credit', 'entrada', 'deposit', 'abono', 'in', '+'];

/** `-1` for money leaving the account, `1` for money arriving, `null` if unrecognised. */
export function parseDirectionFlag(raw: string): -1 | 1 | null {
  const value = normaliseHeader(raw) || raw.trim();
  if (DEBIT_FLAGS.includes(value)) return -1;
  if (CREDIT_FLAGS.includes(value)) return 1;
  return null;
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

export type DecimalSeparator = '.' | ',';

/**
 * Decides whether `1.234,56` or `1,234.56` is in play by looking at which mark
 * comes last in a value that has both, and — for values with only one — whether
 * it is followed by exactly three digits, which makes it a thousands separator.
 * A file with nothing conclusive falls back to `.`.
 */
export function guessDecimalSeparator(samples: readonly string[]): DecimalSeparator {
  let comma = 0;
  let dot = 0;

  for (const sample of samples) {
    const text = sample.trim();
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) comma += 1;
      else dot += 1;
      continue;
    }
    // A lone mark with exactly three trailing digits is a thousands separator
    // (`1.234`), and therefore evidence for the *other* mark being the decimal.
    if (lastComma !== -1) {
      if (/,\d{3}$/.test(text)) dot += 1;
      else comma += 1;
    } else if (lastDot !== -1) {
      if (/\.\d{3}$/.test(text)) comma += 1;
      else dot += 1;
    }
  }

  return comma > dot ? ',' : '.';
}

/**
 * Parses one amount cell into a signed decimal string, or `null` if the cell is
 * not a number at all. Handles a currency symbol, thousands separators, a
 * trailing minus (`123,45-`, common in German and Brazilian exports) and
 * accounting parentheses (`(123.45)`), all of which mean negative.
 */
export function parseAmount(raw: string, decimalSeparator: DecimalSeparator = '.'): string | null {
  let text = raw.trim();
  if (text === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1).trim();
  }
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }

  // Drop currency symbols, spaces (including the non-breaking kind Excel emits)
  // and any letters a code like `BRL` contributes.
  text = text.replace(/[^\d.,]/g, '');
  if (text === '') return null;

  const thousands = decimalSeparator === ',' ? '.' : ',';
  text = text.split(thousands).join('');
  if (decimalSeparator === ',') text = text.replace(',', '.');

  if (!/^\d*\.?\d+$/.test(text) && !/^\d+\.$/.test(text)) return null;

  try {
    const value = money(text.endsWith('.') ? text.slice(0, -1) : text);
    return negative ? money(`-${value}`) : value;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * `iso` is unambiguous; `dmy` and `mdy` are the two readings of the same
 * `01/02/2026` and are indistinguishable for the first twelve days of a month,
 * which is why inference reports ambiguity instead of picking one.
 */
export type DateFormat = 'iso' | 'dmy' | 'mdy';

const DATE_PARTS = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/;

export interface DateInference {
  format: DateFormat | null;
  /** True when the file could be read either way round and nothing settles it. */
  ambiguous: boolean;
}

/**
 * Infers the date layout from the file itself: a component above 12 in the first
 * position means day-first, in the second means month-first. Where no sample
 * settles it, `ambiguous` is set and the caller must ask rather than guess —
 * silently choosing would move half a statement by up to eleven months.
 */
export function inferDateFormat(samples: readonly string[]): DateInference {
  let iso = 0;
  let dayFirst = false;
  let monthFirst = false;
  let slashed = 0;

  for (const sample of samples) {
    const text = sample.trim();
    if (text === '') continue;

    const match = DATE_PARTS.exec(text.split(/[ T]/)[0] ?? text);
    if (!match) continue;

    const [, a, b] = match as unknown as [string, string, string, string];
    if (a.length === 4) {
      iso += 1;
      continue;
    }

    slashed += 1;
    if (Number(a) > 12) dayFirst = true;
    if (Number(b) > 12) monthFirst = true;
  }

  if (iso > 0 && slashed === 0) return { format: 'iso', ambiguous: false };
  if (slashed === 0) return { format: null, ambiguous: false };
  // Both readings contradicted: the file is not internally consistent, so no
  // format is safe. Treated as ambiguous, which forces an explicit choice.
  if (dayFirst && monthFirst) return { format: null, ambiguous: true };
  if (dayFirst) return { format: 'dmy', ambiguous: false };
  if (monthFirst) return { format: 'mdy', ambiguous: false };
  // Every sample readable both ways: default to day-first (this app's locales)
  // but flag it, so the preview asks before anything is written.
  return { format: 'dmy', ambiguous: true };
}

/** Parses one date cell under a known format, or `null` if it is not a date. */
export function parseDateValue(raw: string, format: DateFormat): DateOnly | null {
  const text = (raw.trim().split(/[ T]/)[0] ?? '').trim();
  if (text === '') return null;

  const match = DATE_PARTS.exec(text);
  if (!match) return null;
  const [, a, b, c] = match as unknown as [string, string, string, string];

  let year: number;
  let month: number;
  let day: number;

  if (a.length === 4) {
    // `YYYY-MM-DD` regardless of the requested format: it cannot mean anything else.
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else if (format === 'mdy') {
    month = Number(a);
    day = Number(b);
    year = Number(c);
  } else {
    day = Number(a);
    month = Number(b);
    year = Number(c);
  }

  // A two-digit year: 70-99 is the twentieth century, everything else this one.
  if (String(year).length <= 2) year += year >= 70 ? 1900 : 2000;

  const candidate = formatDate({ year, month, day });
  return isDateOnly(candidate) ? candidate : null;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Reduces a description to the part worth comparing: no accents, no case, no
 * punctuation, and no trailing reference number, which banks vary between
 * exports of the same transaction.
 */
export function normaliseDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Whether two descriptions are close enough to call the same transaction.
 * Deliberately conservative and prefix-based rather than an edit distance: this
 * only ever *flags* a row for the user to judge, and a wrong flag on a genuine
 * pair of identical coffees costs more attention than a missed one.
 */
export function descriptionsMatch(a: string, b: string): boolean {
  const left = normaliseDescription(a);
  const right = normaliseDescription(b);
  if (left === '' || right === '') return false;
  if (left === right) return true;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 6 && longer.startsWith(shorter);
}
