import type { ColumnType, Generated, JSONColumnType } from 'kysely';

/** `NUMERIC` values are read as strings by node-postgres to preserve precision. */
export type Numeric = ColumnType<string, string | number, string | number>;
export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
/** `DATE` columns are read as `YYYY-MM-DD` strings (see db/client.ts type parser). */
export type DateString = ColumnType<string, string, string>;

// Kysely's `Generated<S>` expands to `ColumnType<S, S | undefined, S>` without
// unwrapping a nested ColumnType, so `GeneratedTimestamp` would select as the
// wrapper type rather than as `Date`. These aliases spell out the same intent
// ("has a database default, so optional on insert") for our composite types.
export type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
export type GeneratedNumeric = ColumnType<string, string | number | undefined, string | number>;

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type WorkspaceType = 'personal' | 'shared';
export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'investment'
  | 'cash'
  | 'loan';
export type CategoryKind = 'income' | 'expense' | 'transfer';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'cleared' | 'pending' | 'scheduled' | 'void';
export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'cancelled';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type ImportBatchStatus = 'preview' | 'committed' | 'reverted';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationChannel = 'in_app' | 'email' | 'push';
export type AlertRuleType =
  | 'budget_threshold'
  | 'budget_exceeded'
  | 'large_transaction'
  | 'unusual_spending'
  | 'duplicate_transaction'
  | 'bill_due'
  | 'goal_milestone'
  | 'low_balance';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string | null;
  full_name: string;
  avatar_url: string | null;
  locale: Generated<string>;
  timezone: Generated<string>;
  base_currency: Generated<string>;
  status: Generated<'active' | 'suspended' | 'deleted'>;
  email_verified_at: Timestamp | null;
  last_login_at: Timestamp | null;
  /**
   * Access tokens issued before this instant are rejected. Set by
   * `revokeAllUserTokens`; NULL means nothing has been revoked.
   */
  tokens_valid_from: Timestamp | null;
  /**
   * When the account holder asked to be erased. The erasure itself happens
   * `ACCOUNT_DELETION_GRACE_DAYS` later, in a maintenance task; signing in
   * before then clears this. NULL means no deletion is pending.
   */
  deletion_requested_at: Timestamp | null;
  /**
   * The HMAC of an outstanding password-reset token, and when it expires.
   * NULL means no reset is pending. A new request overwrites both, which is
   * what makes only the newest emailed link work.
   */
  password_reset_token_hash: string | null;
  password_reset_expires_at: Timestamp | null;
  /** Same shape as the reset pair above, for the email-verification link. */
  email_verification_token_hash: string | null;
  email_verification_expires_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface UserIdentitiesTable {
  id: Generated<string>;
  user_id: string;
  provider: 'google' | 'apple' | 'microsoft';
  provider_user_id: string;
  email: string | null;
  created_at: GeneratedTimestamp;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  replaced_by_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: GeneratedTimestamp;
}

export interface PushDevicesTable {
  id: Generated<string>;
  user_id: string;
  platform: 'ios' | 'android' | 'web';
  token: string;
  last_seen_at: GeneratedTimestamp;
  created_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

export interface CurrenciesTable {
  code: string;
  name: string;
  symbol: string;
  decimal_digits: Generated<number>;
}

export interface ExchangeRatesTable {
  id: Generated<string>;
  base_code: string;
  quote_code: string;
  rate: Numeric;
  as_of: DateString;
  source: Generated<string>;
  created_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export interface WorkspacesTable {
  id: Generated<string>;
  name: string;
  type: Generated<WorkspaceType>;
  owner_id: string;
  base_currency: Generated<string>;
  timezone: Generated<string>;
  settings: JSONColumnType<Record<string, unknown>, string | undefined, string>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  archived_at: Timestamp | null;
}

export interface WorkspaceMembersTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  role: MemberRole;
  invited_by: string | null;
  joined_at: GeneratedTimestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface WorkspaceInvitationsTable {
  id: Generated<string>;
  workspace_id: string;
  email: string;
  role: MemberRole;
  token_hash: string;
  status: Generated<InvitationStatus>;
  invited_by: string;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  accepted_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface AccountsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  initial_balance: GeneratedNumeric;
  /** Maintained by trigger: initial_balance + sum of cleared transactions. */
  current_balance: GeneratedNumeric;
  credit_limit: Numeric | null;
  statement_day: number | null;
  due_day: number | null;
  color: string | null;
  icon: string | null;
  is_archived: Generated<boolean>;
  created_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AccountReconciliationsTable {
  id: Generated<string>;
  workspace_id: string;
  account_id: string;
  statement_date: DateString;
  statement_balance: Numeric;
  computed_balance: Numeric;
  difference: Numeric;
  status: Generated<'open' | 'completed'>;
  notes: string | null;
  reconciled_by: string | null;
  completed_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------
// Categories & tags
// ---------------------------------------------------------------------------

export interface CategoriesTable {
  id: Generated<string>;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  kind: Generated<CategoryKind>;
  depth: Generated<number>;
  color: string | null;
  icon: string | null;
  is_system: Generated<boolean>;
  is_archived: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface TagsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  color: string | null;
  created_at: GeneratedTimestamp;
}

export interface TransactionTagsTable {
  transaction_id: string;
  tag_id: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface TransactionsTable {
  id: Generated<string>;
  workspace_id: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  status: Generated<TransactionStatus>;
  /** Signed: negative for outflow, positive for inflow. */
  amount: Numeric;
  currency: string;
  /** `amount` converted into the workspace base currency at `exchange_rate`. */
  base_amount: Numeric;
  exchange_rate: GeneratedNumeric;
  description: string;
  merchant: string | null;
  notes: string | null;
  occurred_on: DateString;
  transfer_group_id: string | null;
  counter_account_id: string | null;
  recurring_transaction_id: string | null;
  reconciliation_id: string | null;
  is_reconciled: Generated<boolean>;
  external_id: string | null;
  import_batch_id: string | null;
  paid_by_user_id: string | null;
  created_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

/**
 * One CSV import, from the preview that wrote nothing through to the commit
 * that wrote the ledger. `preview_rows` holds the parsed payload only while the
 * batch is still a preview; committing clears it, because from then on the rows
 * are the transactions carrying this batch's id.
 */
export interface ImportBatchesTable {
  id: Generated<string>;
  workspace_id: string;
  account_id: string;
  status: Generated<ImportBatchStatus>;
  filename: string | null;
  mapping: JSONColumnType<Record<string, unknown>, string, string>;
  header_signature: string | null;
  preview_rows: ColumnType<unknown[] | null, string | null | undefined, string | null>;
  row_count: Generated<number>;
  imported_count: Generated<number>;
  created_by: string | null;
  created_at: GeneratedTimestamp;
  expires_at: Timestamp;
  committed_at: Timestamp | null;
  reverted_at: Timestamp | null;
}

export interface TransactionSplitsTable {
  id: Generated<string>;
  workspace_id: string;
  transaction_id: string;
  user_id: string;
  share_amount: Numeric;
  share_percent: Numeric | null;
  settled_at: Timestamp | null;
  note: string | null;
  created_at: GeneratedTimestamp;
}

export interface TransactionCommentsTable {
  id: Generated<string>;
  workspace_id: string;
  transaction_id: string;
  user_id: string;
  body: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

export interface RecurringTransactionsTable {
  id: Generated<string>;
  workspace_id: string;
  account_id: string;
  category_id: string | null;
  name: string;
  type: TransactionType;
  amount: Numeric;
  currency: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  frequency: RecurrenceFrequency;
  interval_count: Generated<number>;
  by_weekday: number[] | null;
  day_of_month: number | null;
  month_of_year: number | null;
  start_date: DateString;
  end_date: DateString | null;
  occurrence_limit: number | null;
  occurrences_created: Generated<number>;
  next_occurrence_on: DateString | null;
  last_generated_on: DateString | null;
  /** When true generated rows are `cleared`; otherwise `scheduled` until confirmed. */
  auto_post: Generated<boolean>;
  /** Days ahead of the due date to materialise/notify. */
  lead_time_days: Generated<number>;
  is_active: Generated<boolean>;
  created_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface BudgetsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  period: BudgetPeriod;
  start_date: DateString;
  end_date: DateString;
  currency: string;
  rollover: Generated<boolean>;
  is_active: Generated<boolean>;
  created_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface BudgetLinesTable {
  id: Generated<string>;
  budget_id: string;
  workspace_id: string;
  category_id: string;
  limit_amount: Numeric;
  include_subcategories: Generated<boolean>;
  alert_threshold_percent: Generated<number>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface BudgetRevisionsTable {
  id: Generated<string>;
  budget_line_id: string;
  workspace_id: string;
  previous_limit: Numeric;
  new_limit: Numeric;
  effective_from: DateString;
  reason: string | null;
  changed_by: string | null;
  created_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface FinancialGoalsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  description: string | null;
  category: Generated<string>;
  target_amount: Numeric;
  current_amount: GeneratedNumeric;
  currency: string;
  target_date: DateString | null;
  account_id: string | null;
  status: Generated<GoalStatus>;
  priority: Generated<number>;
  color: string | null;
  achieved_at: Timestamp | null;
  created_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface GoalContributionsTable {
  id: Generated<string>;
  goal_id: string;
  workspace_id: string;
  amount: Numeric;
  occurred_on: DateString;
  transaction_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------
// Alerts, notifications, activity
// ---------------------------------------------------------------------------

export interface AlertRulesTable {
  id: Generated<string>;
  workspace_id: string;
  type: AlertRuleType;
  is_enabled: Generated<boolean>;
  config: JSONColumnType<Record<string, unknown>, string | undefined, string>;
  channels: NotificationChannel[];
  scope_category_id: string | null;
  scope_account_id: string | null;
  created_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface NotificationsTable {
  id: Generated<string>;
  workspace_id: string | null;
  user_id: string;
  type: string;
  severity: Generated<NotificationSeverity>;
  title: string;
  message: string;
  data: JSONColumnType<Record<string, unknown>, string | undefined, string>;
  /** Idempotency key so a repeated alert scan cannot spam the same user. */
  dedupe_key: string | null;
  read_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

export interface NotificationDeliveriesTable {
  id: Generated<string>;
  notification_id: string;
  channel: NotificationChannel;
  status: Generated<'pending' | 'sent' | 'failed' | 'skipped'>;
  error: string | null;
  attempts: Generated<number>;
  last_attempt_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

export interface ActivityEventsTable {
  id: Generated<string>;
  workspace_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes: JSONColumnType<Record<string, unknown>, string | undefined, string>;
  /** Audit-only rows are excluded from the user-facing collaboration feed. */
  is_audit_only: Generated<boolean>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: GeneratedTimestamp;
}

// ---------------------------------------------------------------------------

export interface Database {
  users: UsersTable;
  user_identities: UserIdentitiesTable;
  refresh_tokens: RefreshTokensTable;
  push_devices: PushDevicesTable;
  currencies: CurrenciesTable;
  exchange_rates: ExchangeRatesTable;
  workspaces: WorkspacesTable;
  workspace_members: WorkspaceMembersTable;
  workspace_invitations: WorkspaceInvitationsTable;
  accounts: AccountsTable;
  account_reconciliations: AccountReconciliationsTable;
  categories: CategoriesTable;
  tags: TagsTable;
  transaction_tags: TransactionTagsTable;
  transactions: TransactionsTable;
  import_batches: ImportBatchesTable;
  transaction_splits: TransactionSplitsTable;
  transaction_comments: TransactionCommentsTable;
  recurring_transactions: RecurringTransactionsTable;
  budgets: BudgetsTable;
  budget_lines: BudgetLinesTable;
  budget_revisions: BudgetRevisionsTable;
  financial_goals: FinancialGoalsTable;
  goal_contributions: GoalContributionsTable;
  alert_rules: AlertRulesTable;
  notifications: NotificationsTable;
  notification_deliveries: NotificationDeliveriesTable;
  activity_events: ActivityEventsTable;
}
