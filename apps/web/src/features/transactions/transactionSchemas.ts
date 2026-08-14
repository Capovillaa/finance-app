import {
  LIMITS,
  SPLIT_MODES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  TRANSFER_STATUSES,
  isPositiveMoneyText,
  type SplitMode,
} from '@finance/schemas';
import { z } from 'zod';

/**
 * The ledger's forms: an income/expense row, a transfer, a tag, a split.
 *
 * The value sets and bounds come from `@finance/schemas`, shared with
 * `apps/api/src/modules/transactions/routes.ts`. Income and expense rows use
 * `transactionFormSchema`; transfers are created through their own endpoint with
 * `transferFormSchema`. An existing transfer leg can still be *edited* through
 * the main form, but only in the fields the server allows — see
 * `TransactionFormDialog`.
 */
export { TRANSACTION_TYPES, TRANSACTION_STATUSES, TRANSFER_STATUSES, SPLIT_MODES };
export type TransactionFormType = (typeof TRANSACTION_TYPES)[number];

const amountInputSchema = z
  .string()
  .trim()
  .min(1, 'validation.amountRequired')
  .refine(isPositiveMoneyText, 'validation.amountPositive');

export const transactionFormSchema = z.object({
  accountId: z.string().min(1, 'validation.accountRequired'),
  categoryId: z.string(),
  type: z.enum(TRANSACTION_TYPES),
  amount: amountInputSchema,
  description: z
    .string()
    .min(LIMITS.description.min, 'validation.descriptionRequired')
    .max(LIMITS.description.max),
  merchant: z.string().max(LIMITS.merchant.max).optional(),
  notes: z.string().max(LIMITS.notes.max).optional(),
  occurredOn: z.string().min(1, 'validation.dateRequired'),
  status: z.enum(TRANSACTION_STATUSES),
  /** Controlled with `setValue`/`watch`, never `register()` — see the note below. */
  tagIds: z.array(z.string()).max(LIMITS.tagsPerTransaction.max, 'validation.maxTags'),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export function defaultTransactionFormValues(accountId: string, todayIso: string): TransactionFormValues {
  return {
    accountId,
    categoryId: '',
    type: 'expense',
    amount: '',
    description: '',
    merchant: '',
    notes: '',
    occurredOn: todayIso,
    status: 'cleared',
    tagIds: [],
  };
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

/**
 * A transfer cannot be `scheduled` — the server only accepts `cleared` or
 * `pending`, because a scheduled transfer is a recurring rule, not a ledger
 * entry. `TRANSFER_STATUSES` carries that rule for both sides.
 */
export const transferFormSchema = z
  .object({
    fromAccountId: z.string().min(1, 'validation.fromAccountRequired'),
    toAccountId: z.string().min(1, 'validation.toAccountRequired'),
    amount: amountInputSchema,
    /** Only sent when the two accounts hold different currencies. */
    destinationAmount: z.string().optional(),
    description: z
      .string()
      .min(LIMITS.description.min, 'validation.descriptionRequired')
      .max(LIMITS.description.max),
    notes: z.string().max(LIMITS.notes.max).optional(),
    occurredOn: z.string().min(1, 'validation.dateRequired'),
    status: z.enum(TRANSFER_STATUSES),
  })
  .refine((values) => values.fromAccountId !== values.toAccountId, {
    message: 'validation.differentAccounts',
    path: ['toAccountId'],
  })
  .refine(
    (values) => !values.destinationAmount?.trim() || isPositiveMoneyText(values.destinationAmount.trim()),
    { message: 'validation.amountPositive', path: ['destinationAmount'] },
  );

export type TransferFormValues = z.infer<typeof transferFormSchema>;

export function defaultTransferFormValues(fromAccountId: string, todayIso: string): TransferFormValues {
  return {
    fromAccountId,
    toAccountId: '',
    amount: '',
    destinationAmount: '',
    description: '',
    notes: '',
    occurredOn: todayIso,
    status: 'cleared',
  };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Mirrors the `POST /tags` body in `apps/api/src/modules/tags/routes.ts`. */
export const tagFormSchema = z.object({
  name: z.string().trim().min(LIMITS.tagName.min, 'validation.nameRequired').max(LIMITS.tagName.max),
  color: z.string().max(LIMITS.color.max).optional(),
});

export type TagFormValues = z.infer<typeof tagFormSchema>;

// ---------------------------------------------------------------------------
// Splits
// ---------------------------------------------------------------------------

/**
 * How the shares are worked out. The server accepts all three and decides by
 * what the payload contains: every share carrying a `shareAmount` means exact,
 * any share carrying a `weight` means weighted, and neither means an even
 * split. The UI names them so the choice is deliberate rather than implied by
 * which fields happen to be filled in.
 */
export type { SplitMode };

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const SPLIT_MODE_LABEL_KEYS: Record<SplitMode, string> = {
  even: 'transactions.splitMode.even',
  weight: 'transactions.splitMode.weight',
  exact: 'transactions.splitMode.exact',
};
