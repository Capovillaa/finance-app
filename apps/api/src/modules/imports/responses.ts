import { z } from 'zod/v4';
import { CSV_DELIMITERS } from '../../lib/csv.js';
import { component, currencyCode, dateOnly, integer, money, timestamp, uuid } from '../shared/responses.js';
import { IMPORT_COLUMNS } from './mapping.js';

/**
 * What this module returns.
 *
 * The preview is the interesting one, and it is deliberately verbose: the three
 * inferences that can silently corrupt a whole statement — the sign convention,
 * the decimal mark and the date layout — are echoed back in `options` so the
 * client can show them as editable controls rather than apply them invisibly.
 * `dateFormatAmbiguous` says the file reads both ways and nothing in it settles
 * the question, which is the one case the server refuses to guess.
 *
 * A row's `errors[].message` is **already rendered in the request's locale**.
 * The stored preview keeps catalogue keys so the same batch read by a
 * Portuguese and an English client comes back in each one's own words; the route
 * localises on the way out.
 */

export const importColumnMappingSchema = component(
  'ImportColumnMapping',
  z
    .object(Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, integer.optional()])))
    .describe('Field name to zero-based column index. An absent key is an unmapped field.'),
);

export const importOptionsSchema = component(
  'ImportOptions',
  z
    .object({
      delimiter: z.enum(CSV_DELIMITERS),
      hasHeader: z.boolean(),
      mapping: importColumnMappingSchema,
      dateFormat: z.enum(['iso', 'dmy', 'mdy']).describe('`dmy` and `mdy` are the two readings of `01/02/2026`.'),
      decimalSeparator: z.enum(['.', ',']),
      signConvention: z
        .enum(['signed', 'debit_credit', 'direction_flag'])
        .describe('One signed column, separate debit/credit columns, or a magnitude plus a D/C flag.'),
      invertAmounts: z.boolean(),
    })
    .describe('How the file was read, echoed back so nothing about the parse is implicit.'),
);

export const importRowIssueSchema = component(
  'ImportRowIssue',
  z.object({
    field: z.string(),
    message: z.string().describe("Already rendered in the request's locale."),
  }),
);

export const importPreviewRowSchema = component(
  'ImportPreviewRow',
  z.object({
    lineNumber: integer.describe('1-based line in the source file, header included, so it matches a text editor.'),
    occurredOn: dateOnly.nullable(),
    description: z.string(),
    merchant: z.string().nullable(),
    notes: z.string().nullable(),
    amount: money.nullable().describe("Signed, in the account's currency: negative is money leaving."),
    type: z.enum(['income', 'expense']).nullable(),
    categoryId: uuid.nullable(),
    categoryName: z.string().nullable().describe("The file's own category text when it matched nothing here."),
    externalId: z.string().nullable(),
    errors: z.array(importRowIssueSchema),
    duplicateOfTransactionId: uuid.nullable().describe('An existing ledger row this looks like.'),
    duplicateOfLineNumber: integer.nullable().describe('An earlier row of this same file this looks like.'),
    raw: z.array(z.string()).describe('The unparsed fields, so the client can show what it read.'),
  }),
);

export const importPreviewSchema = component(
  'ImportPreview',
  z.object({
    batchId: uuid.describe('The preview id and the batch id are the same thing; commit takes it.'),
    accountId: uuid,
    accountName: z.string(),
    currency: currencyCode,
    filename: z.string().nullable(),
    headers: z.array(z.string()),
    options: importOptionsSchema,
    mappingRecalled: z.boolean().describe("The mapping came from this account's last import rather than a guess."),
    dateFormatAmbiguous: z
      .boolean()
      .describe('The file reads either way round and nothing in it settles it. Ask before committing.'),
    rows: z.array(importPreviewRowSchema),
    counts: z.object({ total: integer, ready: integer, invalid: integer, duplicate: integer }),
    totals: z.object({ inflow: money, outflow: money, net: money }),
    expiresAt: timestamp.describe('Abandoned previews are swept hourly.'),
  }),
);

export const importPreviewResponse = z
  .object({ preview: importPreviewSchema })
  .describe('The whole file parsed and checked. Nothing has been written to the ledger.');

export const importBatchSchema = component(
  'ImportBatch',
  z.object({
    id: uuid,
    accountId: uuid,
    accountName: z.string(),
    status: z.enum(['preview', 'committed', 'reverted']),
    filename: z.string().nullable(),
    rowCount: integer,
    importedCount: integer,
    createdBy: uuid.nullable(),
    createdByName: z.string().nullable(),
    createdAt: timestamp,
    committedAt: timestamp.nullable(),
    revertedAt: timestamp.nullable(),
  }),
);

export const importBatchListResponse = z.object({ batches: z.array(importBatchSchema) });

export const importCommitResponse = z
  .object({ batchId: uuid, imported: integer, accountId: uuid })
  .describe('Every kept row was inserted, or none was. Keep `batchId` — it is what undo takes.');

export const importRevertResponse = z
  .object({ reverted: integer })
  .describe('How many rows the undo removed from the ledger.');
