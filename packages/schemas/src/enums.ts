/**
 * Every closed set of values the API accepts.
 *
 * Each tuple is `as const` so both a Zod enum and a TypeScript union can be
 * derived from the same declaration — add a member here and the compiler finds
 * the switch statements and label tables that have not caught up.
 *
 * These carry values, never labels. A label is language-dependent and is
 * resolved at render through the i18n catalogues; see the i18n conventions in
 * CLAUDE.md, and `docs/decisions.md`, "The client is translated; the API is not".
 */

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'loan'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** What a user can create directly. A transfer is made through its own endpoint. */
export const TRANSACTION_TYPES = ['income', 'expense'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** What a stored row can be, including the two the ledger produces itself. */
export const LEDGER_TYPES = ['income', 'expense', 'transfer'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/** The states a row may be created in. */
export const TRANSACTION_STATUSES = ['cleared', 'pending', 'scheduled'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * Every state a stored row may hold. `void` is reachable only by voiding an
 * existing row, which is why it is absent from the create schema.
 */
export const LEDGER_STATUSES = ['cleared', 'pending', 'scheduled', 'void'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/**
 * A transfer cannot be scheduled: a transfer that has not happened yet is a
 * recurring rule, not a ledger entry.
 */
export const TRANSFER_STATUSES = ['cleared', 'pending'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSACTION_SORT_FIELDS = ['occurredOn', 'amount', 'createdAt'] as const;
export type TransactionSortField = (typeof TRANSACTION_SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * How a split works out each share. The server infers the mode from the
 * payload — every share carrying an amount means exact, any share carrying a
 * weight means weighted, neither means even — but the client names the three
 * so the choice is deliberate rather than implied by which fields got filled in.
 */
export const SPLIT_MODES = ['even', 'weight', 'exact'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const BUDGET_PERIODS = ['monthly', 'quarterly', 'yearly', 'custom'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const GOAL_CATEGORIES = [
  'emergency_fund',
  'vacation',
  'car',
  'house',
  'education',
  'retirement',
  'investment',
  'other',
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_STATUSES = ['active', 'achieved', 'paused', 'cancelled'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const WORKSPACE_TYPES = ['personal', 'shared'] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export const WORKSPACE_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * Ownership moves through its own transfer endpoint rather than by editing a
 * membership, so `owner` is not a role anyone can be granted.
 */
export const GRANTABLE_ROLES = ['admin', 'editor', 'viewer'] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];
