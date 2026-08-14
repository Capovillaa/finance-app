import { sql } from 'kysely';
import { db, type Executor } from '../../db/client.js';
import type { ImportBatchStatus } from '../../db/types.js';
import { parseCsv, type CsvDelimiter } from '../../lib/csv.js';
import { type DateOnly } from '../../lib/dates.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { abs, compare, convert, money, subtract, sum as sumMoney } from '../../lib/money.js';
import { invalidateWorkspaceCache } from '../../lib/redis.js';
import { getAccount } from '../accounts/service.js';
import { recordActivity } from '../activity/service.js';
import { convertAmount } from '../currencies/service.js';
import {
  descriptionsMatch,
  guessDecimalSeparator,
  guessMapping,
  guessSignConvention,
  inferDateFormat,
  mappingIsComplete,
  normaliseDescription,
  normaliseHeader,
  parseAmount,
  parseDateValue,
  parseDirectionFlag,
  type ColumnMapping,
  type DateFormat,
  type DecimalSeparator,
  type SignConvention,
} from './mapping.js';

/**
 * Import is preview-then-commit. The preview parses, maps, converts and checks
 * for duplicates, and writes nothing to the ledger; only a commit inserts, and
 * it inserts everything or nothing. A file that fails on row 147 must leave no
 * trace, which is impossible to guarantee if rows are streamed in as they parse.
 */

/** A file large enough to blow through this is a database export, not a statement. */
export const MAX_IMPORT_BYTES = 512_000;
export const MAX_IMPORT_ROWS = 2000;
/** Long enough to review a statement carefully, short enough to be collectable. */
export const PREVIEW_TTL_MINUTES = 120;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A translation key plus its params, resolved to a sentence by the route layer. */
export interface ImportRowError {
  field: string;
  key: string;
  params?: Record<string, unknown>;
}

export interface ImportPreviewRow {
  /** 1-based line in the source file, header included, so it matches a text editor. */
  lineNumber: number;
  occurredOn: DateOnly | null;
  description: string;
  merchant: string | null;
  notes: string | null;
  /** Signed, in the account's currency: negative is money leaving. */
  amount: string | null;
  type: 'income' | 'expense' | null;
  categoryId: string | null;
  categoryName: string | null;
  externalId: string | null;
  errors: ImportRowError[];
  /** An existing ledger row this looks like. */
  duplicateOfTransactionId: string | null;
  /** An earlier row of this same file this looks like. */
  duplicateOfLineNumber: number | null;
  raw: string[];
}

/** Everything about how the file was read, echoed back so nothing is implicit. */
export interface ResolvedImportOptions {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  mapping: ColumnMapping;
  dateFormat: DateFormat;
  decimalSeparator: DecimalSeparator;
  signConvention: SignConvention;
  invertAmounts: boolean;
}

export interface ImportPreview {
  batchId: string;
  accountId: string;
  accountName: string;
  currency: string;
  filename: string | null;
  headers: string[];
  options: ResolvedImportOptions;
  /** The mapping was recalled from this account's last import rather than guessed. */
  mappingRecalled: boolean;
  /**
   * The file could be read day-first or month-first and nothing in it settles
   * the question. The client must ask before this preview can be committed.
   */
  dateFormatAmbiguous: boolean;
  rows: ImportPreviewRow[];
  counts: { total: number; ready: number; invalid: number; duplicate: number };
  totals: { inflow: string; outflow: string; net: string };
  expiresAt: Date;
}

export interface ImportBatchSummary {
  id: string;
  accountId: string;
  accountName: string;
  status: ImportBatchStatus;
  filename: string | null;
  rowCount: number;
  importedCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
  committedAt: Date | null;
  revertedAt: Date | null;
}

export interface PreviewImportInput {
  workspaceId: string;
  accountId: string;
  content: string;
  filename?: string | null;
  createdBy: string;
  delimiter?: CsvDelimiter;
  hasHeader?: boolean;
  mapping?: ColumnMapping;
  dateFormat?: DateFormat;
  decimalSeparator?: DecimalSeparator;
  signConvention?: SignConvention;
  invertAmounts?: boolean;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export async function previewImport(input: PreviewImportInput): Promise<ImportPreview> {
  const account = await getAccount(input.workspaceId, input.accountId);
  if (account.isArchived) throw unprocessable('imports.archivedAccount');

  if (Buffer.byteLength(input.content, 'utf8') > MAX_IMPORT_BYTES) {
    throw badRequest('imports.fileTooLarge', { limit: Math.floor(MAX_IMPORT_BYTES / 1000) });
  }

  const parsed = parseCsv(input.content, input.delimiter ? { delimiter: input.delimiter } : {});
  if (parsed.rows.length === 0) throw badRequest('imports.emptyFile');

  const firstRow = parsed.rows[0]!;
  const guessedFromHeader = guessMapping(firstRow);
  // Two or more recognised column names is a header; a data row does not look
  // like one by accident.
  const hasHeader = input.hasHeader ?? Object.keys(guessedFromHeader).length >= 2;

  const headers = hasHeader ? firstRow : firstRow.map((_, index) => `#${index + 1}`);
  const dataRows = hasHeader ? parsed.rows.slice(1) : parsed.rows;

  if (dataRows.length === 0) throw badRequest('imports.noDataRows');
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw badRequest('imports.tooManyRows', { limit: MAX_IMPORT_ROWS, count: dataRows.length });
  }

  const headerSignature = signatureOf(headers);
  const recalled = input.mapping ? null : await recallMapping(input.accountId, headerSignature);

  const mapping = input.mapping ?? recalled?.mapping ?? (hasHeader ? guessedFromHeader : {});
  if (!mappingIsComplete(mapping)) throw unprocessable('imports.incompleteMapping');

  const dateSamples = columnSamples(dataRows, mapping.date);
  const inferred = inferDateFormat(dateSamples);
  const dateFormat = input.dateFormat ?? recalled?.options.dateFormat ?? inferred.format ?? 'dmy';
  // A remembered or explicit format settles the question; only a fresh guess
  // that the file itself cannot confirm is reported as ambiguous.
  const dateFormatAmbiguous = !input.dateFormat && !recalled && inferred.ambiguous;

  const amountSamples = [
    ...columnSamples(dataRows, mapping.amount),
    ...columnSamples(dataRows, mapping.debit),
    ...columnSamples(dataRows, mapping.credit),
  ];
  const decimalSeparator =
    input.decimalSeparator ?? recalled?.options.decimalSeparator ?? guessDecimalSeparator(amountSamples);
  const signConvention = input.signConvention ?? recalled?.options.signConvention ?? guessSignConvention(mapping);
  const invertAmounts = input.invertAmounts ?? recalled?.options.invertAmounts ?? false;

  const options: ResolvedImportOptions = {
    delimiter: parsed.delimiter,
    hasHeader,
    mapping,
    dateFormat,
    decimalSeparator,
    signConvention,
    invertAmounts,
  };

  const categoriesByName = await categoryIndex(input.workspaceId);

  const headerOffset = hasHeader ? 2 : 1;
  const rows = dataRows.map((raw, index) =>
    buildRow(raw, index + headerOffset, options, categoriesByName, headers.length),
  );

  await flagDuplicates(input.workspaceId, input.accountId, rows);

  const ready = rows.filter(isReady);
  const inflow = sumMoney(ready.filter((row) => row.type === 'income').map((row) => row.amount!));
  const outflow = sumMoney(ready.filter((row) => row.type === 'expense').map((row) => abs(row.amount!)));

  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MINUTES * 60_000);

  const batch = await db
    .insertInto('import_batches')
    .values({
      workspace_id: input.workspaceId,
      account_id: input.accountId,
      status: 'preview',
      filename: input.filename ?? null,
      mapping: JSON.stringify(options),
      header_signature: headerSignature,
      preview_rows: JSON.stringify(rows),
      row_count: rows.length,
      created_by: input.createdBy,
      expires_at: expiresAt,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  return {
    batchId: batch.id,
    accountId: account.id,
    accountName: account.name,
    currency: account.currency,
    filename: input.filename ?? null,
    headers,
    options,
    mappingRecalled: recalled !== null,
    dateFormatAmbiguous,
    rows,
    counts: {
      total: rows.length,
      ready: ready.length,
      invalid: rows.filter((row) => row.errors.length > 0).length,
      duplicate: rows.filter(isDuplicate).length,
    },
    totals: { inflow, outflow, net: subtract(inflow, outflow) },
    expiresAt,
  };
}

const isDuplicate = (row: ImportPreviewRow): boolean =>
  row.duplicateOfTransactionId !== null || row.duplicateOfLineNumber !== null;

const isReady = (row: ImportPreviewRow): boolean => row.errors.length === 0 && !isDuplicate(row);

/** Identifies "this bank's export" well enough to recall a mapping for it. */
function signatureOf(headers: string[]): string {
  return headers.map(normaliseHeader).join('|');
}

function columnSamples(rows: string[][], index: number | undefined, limit = 50): string[] {
  if (index === undefined) return [];
  return rows
    .slice(0, limit)
    .map((row) => row[index] ?? '')
    .filter((value) => value.trim() !== '');
}

/**
 * The second import of the same bank should be one click. The mapping is
 * recalled from the newest committed batch for this account whose header row
 * was identical — a different layout falls back to guessing, rather than
 * silently applying a mapping built for another file.
 */
async function recallMapping(
  accountId: string,
  headerSignature: string,
): Promise<{ mapping: ColumnMapping; options: ResolvedImportOptions } | null> {
  if (headerSignature === '') return null;

  const previous = await db
    .selectFrom('import_batches')
    .select('mapping')
    .where('account_id', '=', accountId)
    .where('status', '=', 'committed')
    .where('header_signature', '=', headerSignature)
    .orderBy('committed_at', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (!previous) return null;
  const options = previous.mapping as unknown as ResolvedImportOptions;
  return options?.mapping ? { mapping: options.mapping, options } : null;
}

/** Category names, normalised, so a `Category` column in the file can be honoured. */
async function categoryIndex(workspaceId: string): Promise<Map<string, { id: string; name: string }>> {
  const rows = await db
    .selectFrom('categories')
    .select(['id', 'name'])
    .where('workspace_id', '=', workspaceId)
    .where('is_archived', '=', false)
    .execute();

  const index = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    const key = normaliseDescription(row.name);
    if (key !== '' && !index.has(key)) index.set(key, { id: row.id, name: row.name });
  }
  return index;
}

function buildRow(
  raw: string[],
  lineNumber: number,
  options: ResolvedImportOptions,
  categories: Map<string, { id: string; name: string }>,
  expectedWidth: number,
): ImportPreviewRow {
  const errors: ImportRowError[] = [];
  const cell = (column: keyof ColumnMapping): string => {
    const index = options.mapping[column];
    return index === undefined ? '' : (raw[index] ?? '').trim();
  };

  if (raw.length < expectedWidth) {
    errors.push({
      field: 'row',
      key: 'imports.row.shortRow',
      params: { expected: expectedWidth, actual: raw.length },
    });
  }

  const occurredOn = parseDateValue(cell('date'), options.dateFormat);
  if (occurredOn === null) {
    errors.push({ field: 'date', key: 'imports.row.badDate', params: { value: cell('date') } });
  }

  const merchant = cell('merchant') || null;
  const description = cell('description') || merchant || '';
  if (description === '') errors.push({ field: 'description', key: 'imports.row.missingDescription' });

  const amount = resolveAmount(cell, options, errors);
  const type = amount === null ? null : compare(amount, '0') > 0 ? 'income' : 'expense';

  const categoryCell = cell('category');
  const category = categoryCell === '' ? null : (categories.get(normaliseDescription(categoryCell)) ?? null);

  return {
    lineNumber,
    occurredOn,
    description: description.slice(0, 200),
    merchant: merchant ? merchant.slice(0, 120) : null,
    notes: cell('notes') ? cell('notes').slice(0, 2000) : null,
    amount,
    type,
    categoryId: category?.id ?? null,
    // An unmatched name is reported, not an error: the row still imports, just
    // uncategorised, which beats rejecting a statement over a spelling.
    categoryName: category?.name ?? (categoryCell || null),
    externalId: cell('externalId') || null,
    errors,
    duplicateOfTransactionId: null,
    duplicateOfLineNumber: null,
    raw,
  };
}

/**
 * Turns whichever direction convention the file uses into one signed amount.
 * Negative means money left the account, matching the `transactions.amount`
 * column, so there is exactly one representation from here on.
 */
function resolveAmount(
  cell: (column: keyof ColumnMapping) => string,
  options: ResolvedImportOptions,
  errors: ImportRowError[],
): string | null {
  const parse = (value: string) => parseAmount(value, options.decimalSeparator);
  let amount: string | null = null;

  if (options.signConvention === 'debit_credit') {
    const debit = parse(cell('debit'));
    const credit = parse(cell('credit'));
    // Some exports fill both columns and zero the unused one.
    const debitValue = debit && !isZeroish(debit) ? debit : null;
    const creditValue = credit && !isZeroish(credit) ? credit : null;

    if (debitValue && creditValue) {
      errors.push({ field: 'amount', key: 'imports.row.bothDebitAndCredit' });
      return null;
    }
    if (debitValue) amount = money(`-${abs(debitValue)}`);
    else if (creditValue) amount = abs(creditValue);
  } else if (options.signConvention === 'direction_flag') {
    const magnitude = parse(cell('amount'));
    const direction = parseDirectionFlag(cell('direction'));
    if (magnitude !== null && direction === null) {
      errors.push({ field: 'direction', key: 'imports.row.badDirection', params: { value: cell('direction') } });
      return null;
    }
    if (magnitude !== null) amount = direction === -1 ? money(`-${abs(magnitude)}`) : abs(magnitude);
  } else {
    amount = parse(cell('amount'));
  }

  if (amount === null) {
    errors.push({ field: 'amount', key: 'imports.row.badAmount', params: { value: cell('amount') } });
    return null;
  }
  if (isZeroish(amount)) {
    errors.push({ field: 'amount', key: 'imports.row.zeroAmount' });
    return null;
  }

  return options.invertAmounts ? money(`-${amount}`) : amount;
}

const isZeroish = (value: string): boolean => compare(value, '0') === 0;

/**
 * Flags rather than drops. Two identical coffees on one day are a real pair, not
 * a mistake, so the user decides per row — but a re-imported overlapping month
 * arrives entirely pre-flagged, which is the case that actually doubles someone's
 * balances.
 */
async function flagDuplicates(
  workspaceId: string,
  accountId: string,
  rows: ImportPreviewRow[],
): Promise<void> {
  const dated = rows.filter((row) => row.occurredOn !== null && row.amount !== null);
  if (dated.length === 0) return;

  const dates = dated.map((row) => row.occurredOn!).sort();

  const existing = await db
    .selectFrom('transactions')
    .select(['id', 'occurred_on', 'amount', 'description', 'external_id'])
    .where('workspace_id', '=', workspaceId)
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .where('occurred_on', '>=', dates[0]!)
    .where('occurred_on', '<=', dates[dates.length - 1]!)
    .execute();

  // Each ledger row can absorb only one file row: otherwise a genuine pair of
  // identical charges would both be flagged against the single existing one.
  const claimed = new Set<string>();
  const byExternalId = new Map<string, string>();
  for (const row of existing) {
    if (row.external_id) byExternalId.set(row.external_id, row.id);
  }

  const seenInFile = new Map<string, number>();

  for (const row of dated) {
    const fingerprint = `${row.occurredOn}|${row.amount}|${normaliseDescription(row.description)}`;
    const earlier = seenInFile.get(fingerprint);
    if (earlier !== undefined) {
      row.duplicateOfLineNumber = earlier;
      continue;
    }
    seenInFile.set(fingerprint, row.lineNumber);

    if (row.externalId) {
      const match = byExternalId.get(row.externalId);
      if (match !== undefined && !claimed.has(match)) {
        row.duplicateOfTransactionId = match;
        claimed.add(match);
        continue;
      }
    }

    const match = existing.find(
      (candidate) =>
        !claimed.has(candidate.id) &&
        candidate.occurred_on === row.occurredOn &&
        compare(candidate.amount, row.amount!) === 0 &&
        descriptionsMatch(candidate.description, row.description),
    );

    if (match) {
      row.duplicateOfTransactionId = match.id;
      claimed.add(match.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export interface CommitRowSelection {
  lineNumber: number;
  /** Overrides whatever the file's category column resolved to. */
  categoryId?: string | null;
}

export interface CommitImportResult {
  batchId: string;
  imported: number;
  accountId: string;
}

export async function commitImport(
  workspaceId: string,
  batchId: string,
  selections: CommitRowSelection[],
  userId: string,
): Promise<CommitImportResult> {
  const batch = await loadBatch(workspaceId, batchId);
  if (batch.status !== 'preview') throw conflict('imports.alreadyCommitted');
  if (batch.expires_at.getTime() < Date.now()) throw conflict('imports.previewExpired');

  const account = await getAccount(workspaceId, batch.account_id);
  if (account.isArchived) throw unprocessable('imports.archivedAccount');

  const workspace = await db
    .selectFrom('workspaces')
    .select('base_currency')
    .where('id', '=', workspaceId)
    .executeTakeFirstOrThrow();

  const previewRows = (batch.preview_rows ?? []) as ImportPreviewRow[];
  const byLine = new Map(previewRows.map((row) => [row.lineNumber, row]));

  const chosen = selections.map((selection) => {
    const row = byLine.get(selection.lineNumber);
    if (!row) throw unprocessable('imports.unknownRow', { line: selection.lineNumber });
    if (row.errors.length > 0 || row.occurredOn === null || row.amount === null) {
      throw unprocessable('imports.invalidRowSelected', { line: selection.lineNumber });
    }
    return {
      row,
      categoryId: selection.categoryId === undefined ? row.categoryId : selection.categoryId,
    };
  });

  if (chosen.length === 0) throw unprocessable('imports.nothingSelected');

  await assertCategoriesUsable(workspaceId, chosen);

  // One rate lookup per distinct date rather than per row: a statement covering
  // one month is thirty lookups, not two thousand.
  const rates = new Map<string, string>();
  for (const { row } of chosen) {
    if (rates.has(row.occurredOn!)) continue;
    const { rate } = await convertAmount('1', account.currency, workspace.base_currency, row.occurredOn!);
    rates.set(row.occurredOn!, rate);
  }

  const values = chosen.map(({ row, categoryId }) => {
    const rate = rates.get(row.occurredOn!)!;
    return {
      workspace_id: workspaceId,
      account_id: account.id,
      category_id: categoryId,
      type: row.type!,
      status: 'cleared' as const,
      amount: row.amount!,
      currency: account.currency,
      base_amount: convert(row.amount!, rate),
      exchange_rate: rate,
      description: row.description,
      merchant: row.merchant,
      notes: row.notes,
      occurred_on: row.occurredOn!,
      external_id: row.externalId,
      import_batch_id: batchId,
      paid_by_user_id: userId,
      created_by: userId,
    };
  });

  await db.transaction().execute(async (trx) => {
    // Chunked because Postgres caps a statement at 65535 bind parameters and
    // each row here spends eighteen of them.
    for (let index = 0; index < values.length; index += 500) {
      await trx.insertInto('transactions').values(values.slice(index, index + 500)).execute();
    }

    await trx
      .updateTable('import_batches')
      .set({
        status: 'committed',
        imported_count: values.length,
        committed_at: new Date(),
        // Scaffolding, not a record: the committed rows are the transactions.
        preview_rows: null,
      })
      .where('id', '=', batchId)
      .execute();
  });

  await recordActivity({
    workspaceId,
    actorUserId: userId,
    action: 'import.committed',
    entityType: 'import_batch',
    entityId: batchId,
    summary: `Imported ${values.length} transaction(s) into ${account.name}${batch.filename ? ` from ${batch.filename}` : ''}`,
    changes: { rowCount: batch.row_count, imported: values.length },
  });

  await invalidateWorkspaceCache(workspaceId);

  return { batchId, imported: values.length, accountId: account.id };
}

/**
 * Validates each distinct category once rather than per row, and names the line
 * that used it — a 2000-row import that fails needs to say where.
 */
async function assertCategoriesUsable(
  workspaceId: string,
  chosen: { row: ImportPreviewRow; categoryId: string | null }[],
): Promise<void> {
  const wanted = new Set<string>();
  for (const { categoryId } of chosen) {
    if (categoryId) wanted.add(categoryId);
  }
  if (wanted.size === 0) return;

  const found = await db
    .selectFrom('categories')
    .select(['id', 'kind', 'is_archived'])
    .where('workspace_id', '=', workspaceId)
    .where('id', 'in', [...wanted])
    .execute();

  const byId = new Map(found.map((category) => [category.id, category]));

  for (const categoryId of wanted) {
    const category = byId.get(categoryId);
    if (!category) throw unprocessable('categories.notInWorkspace');
    if (category.is_archived) throw unprocessable('transactions.archivedCategory');
  }

  // The kind check is per row, not per category: the same category can be
  // legal for one selected row and wrong for another.
  for (const { row, categoryId } of chosen) {
    if (!categoryId) continue;
    const category = byId.get(categoryId)!;
    if (category.kind !== row.type && category.kind !== 'transfer') {
      throw unprocessable('imports.rowKindMismatch', {
        line: row.lineNumber,
        typeKey: `common.transactionKind.${row.type}`,
        kindKey: `common.transactionKind.${category.kind}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

/**
 * Reverses a whole batch. The thing a user wants within thirty seconds of a bad
 * import, so it is a soft delete of every row the batch created — the same
 * `deleted_at` the single-row delete uses, which means the balance trigger
 * unwinds the account exactly as it would one row at a time.
 */
export async function revertImport(workspaceId: string, batchId: string, userId: string): Promise<number> {
  const batch = await loadBatch(workspaceId, batchId);
  if (batch.status === 'preview') throw conflict('imports.notCommitted');
  if (batch.status === 'reverted') throw conflict('imports.alreadyReverted');

  const reconciled = await db
    .selectFrom('transactions')
    .select('id')
    .where('import_batch_id', '=', batchId)
    .where('deleted_at', 'is', null)
    .where('is_reconciled', '=', true)
    .limit(1)
    .executeTakeFirst();

  if (reconciled) throw unprocessable('imports.reconciledRows');

  const reverted = await db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable('transactions')
      .set({ deleted_at: new Date() })
      .where('import_batch_id', '=', batchId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    await trx
      .updateTable('import_batches')
      .set({ status: 'reverted', reverted_at: new Date() })
      .where('id', '=', batchId)
      .execute();

    return Number(result.numUpdatedRows);
  });

  await recordActivity({
    workspaceId,
    actorUserId: userId,
    action: 'import.reverted',
    entityType: 'import_batch',
    entityId: batchId,
    summary: `Undid an import of ${reverted} transaction(s)`,
  });

  await invalidateWorkspaceCache(workspaceId);
  return reverted;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listImportBatches(workspaceId: string, limit = 20): Promise<ImportBatchSummary[]> {
  const rows = await db
    .selectFrom('import_batches')
    .innerJoin('accounts', 'accounts.id', 'import_batches.account_id')
    .leftJoin('users', 'users.id', 'import_batches.created_by')
    .select([
      'import_batches.id as id',
      'import_batches.account_id as account_id',
      'accounts.name as account_name',
      'import_batches.status as status',
      'import_batches.filename as filename',
      'import_batches.row_count as row_count',
      'import_batches.imported_count as imported_count',
      'import_batches.created_by as created_by',
      'users.full_name as created_by_name',
      'import_batches.created_at as created_at',
      'import_batches.committed_at as committed_at',
      'import_batches.reverted_at as reverted_at',
    ])
    .where('import_batches.workspace_id', '=', workspaceId)
    // Previews are scaffolding; only imports that actually happened are history.
    .where('import_batches.status', '!=', 'preview')
    .orderBy('import_batches.created_at', 'desc')
    .limit(limit)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    status: row.status,
    filename: row.filename,
    rowCount: row.row_count,
    importedCount: row.imported_count,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    revertedAt: row.reverted_at,
  }));
}

async function loadBatch(workspaceId: string, batchId: string) {
  const batch = await db
    .selectFrom('import_batches')
    .selectAll()
    .where('id', '=', batchId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();

  if (!batch) throw notFound('resources.importBatch');
  return batch;
}

/**
 * Drops previews nobody committed. Called by the maintenance job; a preview is
 * pure scaffolding, so this deletes the row outright rather than archiving it.
 */
export async function purgeExpiredPreviews(executor: Executor = db): Promise<number> {
  const result = await executor
    .deleteFrom('import_batches')
    .where('status', '=', 'preview')
    .where('expires_at', '<', sql<Date>`now()`)
    .executeTakeFirst();

  return Number(result.numDeletedRows);
}
