import { z } from 'zod';

/**
 * Client-side mirror of `createSchema` / the PATCH body in
 * `apps/api/src/modules/transactions/routes.ts`.
 *
 * Income and expense rows use `transactionFormSchema`. Transfers are created
 * through their own endpoint with `transferFormSchema`; an existing transfer
 * leg can still be *edited* through the main form, but only in the fields the
 * server allows — see `TransactionFormDialog`.
 */
export const TRANSACTION_TYPES = ['income', 'expense'] as const;
export type TransactionFormType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['cleared', 'pending', 'scheduled'] as const;

const amountInputSchema = z
  .string()
  .trim()
  .min(1, 'validation.amountRequired')
  .refine((v) => /^\d{1,15}(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'validation.amountPositive');

export const transactionFormSchema = z.object({
  accountId: z.string().min(1, 'validation.accountRequired'),
  categoryId: z.string(),
  type: z.enum(TRANSACTION_TYPES),
  amount: amountInputSchema,
  description: z.string().min(1, 'validation.descriptionRequired').max(200),
  merchant: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  occurredOn: z.string().min(1, 'validation.dateRequired'),
  status: z.enum(TRANSACTION_STATUSES),
  /** Controlled with `setValue`/`watch`, never `register()` — see the note below. */
  tagIds: z.array(z.string()).max(20, 'validation.maxTags'),
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
 * Mirror of the `/transactions/transfers` body. A transfer cannot be
 * `scheduled` — the server only accepts `cleared` or `pending`, because a
 * scheduled transfer is a recurring rule, not a ledger entry.
 */
export const TRANSFER_STATUSES = ['cleared', 'pending'] as const;

export const transferFormSchema = z
  .object({
    fromAccountId: z.string().min(1, 'validation.fromAccountRequired'),
    toAccountId: z.string().min(1, 'validation.toAccountRequired'),
    amount: amountInputSchema,
    /** Only sent when the two accounts hold different currencies. */
    destinationAmount: z.string().optional(),
    description: z.string().min(1, 'validation.descriptionRequired').max(200),
    notes: z.string().max(2000).optional(),
    occurredOn: z.string().min(1, 'validation.dateRequired'),
    status: z.enum(TRANSFER_STATUSES),
  })
  .refine((values) => values.fromAccountId !== values.toAccountId, {
    message: 'validation.differentAccounts',
    path: ['toAccountId'],
  })
  .refine(
    (values) =>
      !values.destinationAmount?.trim() ||
      (/^\d{1,15}(\.\d{1,4})?$/.test(values.destinationAmount.trim()) && Number(values.destinationAmount) > 0),
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

/** Mirror of the `POST /tags` body in `apps/api/src/modules/tags/routes.ts`. */
export const tagFormSchema = z.object({
  name: z.string().trim().min(1, 'validation.nameRequired').max(40),
  color: z.string().max(20).optional(),
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
export const SPLIT_MODES = ['even', 'weight', 'exact'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

/** Catalogue keys, not labels — resolve with `t()` at the point of render. */
export const SPLIT_MODE_LABEL_KEYS: Record<SplitMode, string> = {
  even: 'transactions.splitMode.even',
  weight: 'transactions.splitMode.weight',
  exact: 'transactions.splitMode.exact',
};
