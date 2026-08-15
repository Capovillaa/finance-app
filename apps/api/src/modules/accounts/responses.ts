import { ACCOUNT_TYPES } from '@finance/schemas';
import { z } from 'zod/v4';
import { component, currencyCode, dateOnly, integer, money, timestamp, uuid } from '../shared/responses.js';

/**
 * What this module returns, in the same folder as the queries that build it.
 *
 * Each schema below mirrors an interface in `service.ts` — `accountSchema` is
 * `AccountRecord` as it appears on the wire — but the mirror is not automatic:
 * a service interface describes the object a handler passes to `res.json()`, and
 * these describe the JSON that comes out the other side. `createdAt` is the
 * difference in miniature: `Date` there, an ISO string here. The integration
 * suite checks every response against the schema below rather than trusting the
 * resemblance; see `middleware/responds.ts`.
 */

export const accountSchema = component(
  'Account',
  z.object({
    id: uuid,
    name: z.string(),
    type: z.enum(ACCOUNT_TYPES),
    currency: currencyCode,
    institution: z.string().nullable(),
    initialBalance: money,
    currentBalance: money,
    availableBalance: money.describe(
      'Cleared balance plus anything still pending — what is really committed. A decimal string.',
    ),
    creditLimit: money.nullable().describe('Credit-card accounts only; `null` on every other type.'),
    statementDay: integer.nullable(),
    dueDay: integer.nullable(),
    color: z.string().nullable(),
    icon: z.string().nullable(),
    isArchived: z.boolean(),
    createdAt: timestamp,
  }),
);

export const accountListResponse = z
  .object({
    accounts: z.array(accountSchema),
    totalBalance: money.describe(
      "Every account converted into the workspace's base currency at today's rate, then summed.",
    ),
    balanceByCurrency: z.record(currencyCode, money),
  })
  .describe('The workspace\'s accounts, with the total held in each currency and the converted total.');

export const accountResponse = z.object({ account: accountSchema });

/**
 * A past reconciliation. `difference` is the bank's figure minus the ledger's,
 * so a positive number is money the ledger has not been told about.
 */
export const reconciliationSchema = component(
  'AccountReconciliation',
  z.object({
    id: uuid,
    statementDate: dateOnly,
    statementBalance: money,
    computedBalance: money,
    difference: money,
    status: z.enum(['open', 'completed']),
    notes: z.string().nullable(),
    completedAt: timestamp.nullable(),
    createdAt: timestamp,
  }),
);

export const reconciliationListResponse = z.object({ reconciliations: z.array(reconciliationSchema) });

/**
 * The outcome of reconciling, which is not the stored row: it carries how many
 * transactions the run froze and omits the fields only a listing needs.
 */
export const reconciliationResultSchema = component(
  'ReconciliationResult',
  z.object({
    id: uuid,
    statementDate: dateOnly,
    statementBalance: money,
    computedBalance: money,
    difference: money,
    status: z.enum(['open', 'completed']).describe('`completed` only when the two balances matched exactly.'),
    transactionsMarked: integer,
  }),
);

export const reconciliationResultResponse = z.object({ reconciliation: reconciliationResultSchema });
