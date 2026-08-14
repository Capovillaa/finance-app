/**
 * CSV in both directions. The writer moved here from `modules/reports` when the
 * reader was written, because a file that can only produce a format it cannot
 * consume is half a library — the round trip is now testable in one place.
 */

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Escapes a CSV field. The leading-character guard stops spreadsheet software
 * from interpreting a transaction description as a formula.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) lines.push(row.map(csvField).join(','));
  // CRLF and a UTF-8 BOM keep Excel happy with accented Portuguese text.
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Delimiters worth sniffing for. Brazilian and most European exports use `;`,
 * because those locales already spend the comma on the decimal separator.
 */
export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export interface ParsedCsv {
  delimiter: CsvDelimiter;
  /** One entry per record, each already split into fields and unquoted. */
  rows: string[][];
}

/** Strips a UTF-8 BOM, which Excel writes and every naive parser then reads as part of the first header. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Picks the delimiter that yields the most consistent field count across the
 * first few lines. Counting occurrences alone is not enough: a file of
 * `"Padaria, Central";10,50` has more commas than semicolons and is still
 * semicolon-delimited, so each candidate is actually parsed and judged on
 * whether it produces rows of equal width.
 */
export function sniffDelimiter(text: string): CsvDelimiter {
  const sample = stripBom(text).split(/\r?\n/).slice(0, 20).join('\n');
  if (sample.trim() === '') return ',';

  let best: { delimiter: CsvDelimiter; score: number } = { delimiter: ',', score: -1 };

  for (const delimiter of CSV_DELIMITERS) {
    const rows = parseRows(sample, delimiter).filter((row) => row.length > 0);
    if (rows.length === 0) continue;

    const width = rows[0]!.length;
    if (width < 2) continue;
    const consistent = rows.filter((row) => row.length === width).length / rows.length;
    // Consistency dominates; width only breaks ties between equally tidy reads.
    const score = consistent * 100 + width;
    if (score > best.score) best = { delimiter, score };
  }

  return best.delimiter;
}

export interface ParseCsvOptions {
  delimiter?: CsvDelimiter;
  /** Drop rows whose fields are all blank. On by default: they carry no data. */
  skipEmptyRows?: boolean;
}

/**
 * Parses CSV text into rows of fields. Ragged rows are returned as they are —
 * whether a short row is an error or a trailing artefact is the caller's
 * decision, and the import preview wants to report it against a line number
 * rather than have it silently padded or dropped here.
 */
export function parseCsv(text: string, options: ParseCsvOptions = {}): ParsedCsv {
  const body = stripBom(text);
  const delimiter = options.delimiter ?? sniffDelimiter(body);
  const skipEmpty = options.skipEmptyRows ?? true;

  let rows = parseRows(body, delimiter);
  if (skipEmpty) rows = rows.filter((row) => row.some((field) => field.trim() !== ''));

  return { delimiter, rows };
}

/**
 * The state machine. Written by hand rather than with a regex because a quoted
 * field may contain the delimiter, a newline, or an escaped `""` quote, none of
 * which a line-oriented split can see.
 */
function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }

    // CR, LF and CRLF all end a record; bank exports use all three.
    if (char === '\n' || char === '\r') {
      endRow();
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // A file that does not end in a newline still has a final record.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}
