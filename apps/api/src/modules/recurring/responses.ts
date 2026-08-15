import { RECURRING_FREQUENCIES, TRANSACTION_TYPES } from '@finance/schemas';
import { z } from 'zod/v4';
import { component, currencyCode, dateOnly, integer, money, uuid } from '../shared/responses.js';

/**
 * What this module returns.
 *
 * **`amount` is signed here, unlike the create and update input.** A caller
 * sends a positive magnitude plus a `type`; what comes back is the stored value,
 * negative for an expense, exactly as a transaction reports it. The client got
 * this wrong once and rendered "R$ NaN" across the whole screen — see
 * `docs/decisions.md`, "Recurring-transaction amounts are signed at rest".
 */

export const recurringSchema = component(
  'RecurringTransaction',
  z.object({
    id: uuid,
    name: z.string(),
    accountId: uuid,
    accountName: z.string().optional().describe('Joined by the list and detail queries only.'),
    categoryId: uuid.nullable(),
    categoryName: z.string().nullable().optional().describe('Joined by the list and detail queries only.'),
    type: z.enum(TRANSACTION_TYPES),
    amount: money.describe('Signed as stored — negative for an expense — unlike the create/update input.'),
    currency: currencyCode,
    description: z.string(),
    merchant: z.string().nullable(),
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalCount: integer.describe('Every N periods. 1 unless `frequency` is `custom`.'),
    byWeekday: z.array(integer).nullable().describe('0–6, Sunday first. Weekly schedules only.'),
    dayOfMonth: integer.nullable(),
    monthOfYear: integer.nullable(),
    startDate: dateOnly,
    endDate: dateOnly.nullable(),
    occurrenceLimit: integer.nullable(),
    occurrencesCreated: integer,
    nextOccurrenceOn: dateOnly.nullable().describe('Null once the schedule is finished or inactive.'),
    autoPost: z
      .boolean()
      .describe('True posts generated rows as `cleared`; false leaves them `scheduled` for confirmation.'),
    leadTimeDays: integer.describe('How far ahead of the due date a row is generated.'),
    isActive: z.boolean(),
    summary: z.string().describe('The schedule in words, e.g. "Monthly on the 1st". Already translated.'),
  }),
);

export const recurringListResponse = z.object({ recurring: z.array(recurringSchema) });

export const recurringResponse = z.object({ recurring: recurringSchema });

export const recurringDetailResponse = z
  .object({
    recurring: recurringSchema,
    upcoming: z.array(dateOnly).describe('The next twelve dates the schedule would fire on.'),
  })
  .describe('The schedule and a preview of where it goes next.');

export const materializeResponse = z
  .object({
    scheduleId: uuid,
    created: integer,
    nextOccurrenceOn: dateOnly.nullable(),
  })
  .describe('Generation is idempotent: an occurrence that already produced a transaction is skipped.');
