/**
 * Response shapes returned by @finance/api.
 *
 * These are hand-written for now and mirror the service-layer interfaces in
 * `apps/api/src/modules/*`. They are deliberately the *only* place the client
 * describes the wire format, so when the shared-schema package lands (see
 * CLAUDE.md, next task 3) this file is the single thing that gets replaced by
 * generated types.
 *
 * Money is always a decimal string — never a number. Anything that looks like a
 * currency amount here is typed `Money` to make that impossible to forget.
 */

/** A decimal amount with up to four places, e.g. `"1250.0000"`. */
export type Money = string;

/** A calendar date, `YYYY-MM-DD`. */
export type DateOnly = string;

/** An ISO 8601 timestamp. Dates cross the wire serialised, not as `Date`. */
export type Timestamp = string;

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'investment' | 'cash' | 'loan';

export type TransactionType = 'income' | 'expense' | 'transfer';

export type TransactionStatus = 'cleared' | 'pending' | 'scheduled' | 'void';

export type CategoryKind = 'income' | 'expense';

export type BudgetStatus = 'on_track' | 'warning' | 'exceeded';

export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/** The single error envelope every endpoint uses. See docs/api.md. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  };
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Auth and users
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  fullName: string;
  locale: string;
  timezone: string;
  baseCurrency: string;
  avatarUrl: string | null;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  /** Also set as an HttpOnly cookie; the browser client ignores this field. */
  refreshToken: string;
  expiresIn: number;
  defaultWorkspaceId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  locale?: string;
  timezone?: string;
  baseCurrency?: string;
  workspaceName?: string;
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  baseCurrency: string;
  timezone: string;
  role: WorkspaceRole;
  memberCount: number;
  settings?: Record<string, unknown>;
  createdAt: Timestamp;
  archivedAt: Timestamp | null;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: Timestamp;
}

/**
 * A pending seat. The token itself is never returned by the list endpoint — it
 * only ever leaves the server inside the invitation email — so the client can
 * show and revoke an invitation but cannot re-send its link.
 */
export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | string;
  invitedByName: string | null;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  initialBalance: Money;
  currentBalance: Money;
  /** Cleared balance plus anything still pending. */
  availableBalance: Money;
  creditLimit: Money | null;
  statementDay: number | null;
  dueDay: number | null;
  color: string | null;
  icon: string | null;
  isArchived: boolean;
  createdAt: Timestamp;
}

export interface AccountListResponse {
  accounts: Account[];
  totalBalance: Money;
  balanceByCurrency: Record<string, Money>;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  kind: CategoryKind;
  depth: number;
  color: string | null;
  icon: string | null;
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
}

/** `GET /categories?shape=tree` returns the same rows nested. */
export interface CategoryNode extends Category {
  children: CategoryNode[];
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface Transaction {
  id: string;
  accountId: string;
  accountName?: string;
  categoryId: string | null;
  categoryName?: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: Money;
  currency: string;
  baseAmount: Money;
  exchangeRate: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  occurredOn: DateOnly;
  transferGroupId: string | null;
  counterAccountId: string | null;
  recurringTransactionId: string | null;
  isReconciled: boolean;
  paidByUserId: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  tags?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  /** Present on the list endpoint only — `POST /tags` does not compute it. */
  usageCount?: number;
}

/**
 * One person's share of a transaction.
 *
 * `shareAmount` is always the *magnitude*, never signed, and the server
 * guarantees the shares of a transaction add up to the absolute value of its
 * amount — so the client never has to reconcile them.
 */
export interface TransactionSplit {
  id: string;
  userId: string;
  fullName: string;
  shareAmount: Money;
  sharePercent: string | null;
  settledAt: Timestamp | null;
  note: string | null;
}

export interface TransactionComment {
  id: string;
  body: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `GET /transactions/:id` returns the row with everything hanging off it. */
export interface TransactionDetail {
  transaction: Transaction;
  splits: TransactionSplit[];
  comments: TransactionComment[];
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface BudgetLineProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  includeSubcategories: boolean;
  limitAmount: Money;
  spentAmount: Money;
  remainingAmount: Money;
  percentUsed: number;
  alertThresholdPercent: number;
  status: BudgetStatus;
}

export interface BudgetProgress {
  id: string;
  name: string;
  period: BudgetPeriod;
  startDate: DateOnly;
  endDate: DateOnly;
  currency: string;
  rollover: boolean;
  isActive: boolean;
  totalLimit: Money;
  totalSpent: Money;
  totalRemaining: Money;
  percentUsed: number;
  /** Fraction of the period elapsed, so the UI can show pace vs spend. */
  periodProgressPercent: number;
  lines: BudgetLineProgress[];
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type GoalCategory =
  | 'emergency_fund'
  | 'vacation'
  | 'car'
  | 'house'
  | 'education'
  | 'retirement'
  | 'investment'
  | 'other';

export type GoalStatus = 'active' | 'achieved' | 'paused' | 'cancelled';

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  category: GoalCategory;
  targetAmount: Money;
  currentAmount: Money;
  remainingAmount: Money;
  progressPercent: number;
  currency: string;
  targetDate: DateOnly | null;
  accountId: string | null;
  status: GoalStatus;
  priority: number;
  color: string | null;
  achievedAt: Timestamp | null;
  /** Contribution per month needed to hit the target by `targetDate`. */
  requiredMonthlyContribution: Money | null;
  daysRemaining: number | null;
  /** True when the goal is behind the pace implied by its deadline. */
  offTrack: boolean;
  createdAt: Timestamp;
}

export interface GoalContribution {
  id: string;
  amount: Money;
  occurredOn: DateOnly;
  note: string | null;
  transactionId: string | null;
  createdByName: string | null;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface RecurringTransaction {
  id: string;
  name: string;
  accountId: string;
  accountName?: string;
  categoryId: string | null;
  categoryName?: string | null;
  type: 'income' | 'expense';
  /** Signed, as stored (negative for expenses) — unlike the create/update input, which takes a positive magnitude. */
  amount: Money;
  currency: string;
  description: string;
  merchant: string | null;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  byWeekday: number[] | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: DateOnly;
  endDate: DateOnly | null;
  occurrenceLimit: number | null;
  occurrencesCreated: number;
  nextOccurrenceOn: DateOnly | null;
  autoPost: boolean;
  leadTimeDays: number;
  isActive: boolean;
  /** Human-readable description of the schedule, e.g. "Monthly on the 1st". */
  summary: string;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertRuleType =
  | 'budget_threshold'
  | 'budget_exceeded'
  | 'large_transaction'
  | 'unusual_spending'
  | 'duplicate_transaction'
  | 'bill_due'
  | 'goal_milestone'
  | 'low_balance';

export type NotificationChannel = 'in_app' | 'email' | 'push';

export interface AlertRule {
  id: string;
  type: AlertRuleType;
  isEnabled: boolean;
  config: Record<string, unknown>;
  channels: NotificationChannel[];
  scopeCategoryId: string | null;
  scopeAccountId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AlertEvaluationSummary {
  workspaceId: string;
  notificationsCreated: number;
  byType: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface DateRange {
  start: DateOnly;
  end: DateOnly;
}

export interface PeriodTotals {
  income: Money;
  expenses: Money;
  net: Money;
  savingsRate: number;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  parentId: string | null;
  total: Money;
  transactionCount: number;
  percentOfTotal: number;
}

export interface ComparisonResult {
  current: PeriodTotals & { range: DateRange };
  previous: PeriodTotals & { range: DateRange };
  incomeChangePercent: number;
  expenseChangePercent: number;
  netChange: Money;
}

export interface TrendPoint {
  period: string;
  periodStart: DateOnly;
  income: Money;
  expenses: Money;
  net: Money;
}

export interface NetWorthPoint {
  periodEnd: DateOnly;
  balance: Money;
}

export interface SavingsRatePoint {
  period: string;
  income: Money;
  expenses: Money;
  saved: Money;
  savingsRate: number;
}

export interface SpendingInsight {
  type: 'overspend' | 'savings_opportunity' | 'trend' | 'positive';
  title: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface DashboardBudget {
  id: string;
  name: string;
  percentUsed: number;
  status: BudgetStatus | string;
  totalLimit: Money;
  totalSpent: Money;
}

export interface UpcomingBill {
  id: string;
  name: string;
  amount: Money;
  currency: string;
  dueOn: DateOnly;
}

export interface DashboardGoal {
  id: string;
  name: string;
  progressPercent: number;
  targetAmount: Money;
  currentAmount: Money;
}

export interface DashboardSummary {
  asOf: DateOnly;
  baseCurrency: string;
  totalBalance: Money;
  balanceByCurrency: Record<string, Money>;
  accounts: Account[];
  month: PeriodTotals & { range: DateRange };
  monthOverMonth: ComparisonResult;
  topCategories: CategoryBreakdownItem[];
  budgets: DashboardBudget[];
  recentTransactions: Transaction[];
  upcomingBills: UpcomingBill[];
  goals: DashboardGoal[];
  unreadNotifications: number;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface StatementAccountBalance {
  id: string;
  name: string;
  currency: string;
  closingBalance: Money;
}

export interface StatementBudget {
  name: string;
  totalLimit: Money;
  totalSpent: Money;
  percentUsed: number;
}

/**
 * A closed statement for one month.
 *
 * `openingBalance` is derived from the ledger *before* the range rather than
 * stored, so a statement for any past month is reproducible — re-requesting it
 * next year returns the same figures. Both balances are in `baseCurrency`;
 * `accounts[].closingBalance` is in each account's own currency.
 */
export interface MonthlyStatement {
  workspaceId: string;
  range: DateRange;
  baseCurrency: string;
  openingBalance: Money;
  closingBalance: Money;
  totals: PeriodTotals;
  /** Top-level categories only — the server rolls subcategories up at depth 0. */
  categories: CategoryBreakdownItem[];
  accounts: StatementAccountBalance[];
  budgets: StatementBudget[];
  transactionCount: number;
}

export interface YearOverYearRow {
  /** The `MM` half of the month key, shared by both years. */
  month: string;
  currentIncome: Money;
  currentExpenses: Money;
  previousIncome: Money;
  previousExpenses: Money;
  /** 0 when the prior year had no spending in that month — not a 100% fall. */
  expenseChangePercent: number;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  workspaceId: string | null;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  data: Record<string, unknown>;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}

export type NotificationPage = Page<Notification> & { unreadCount: number };

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/** The fields an import can fill, each mapped to a zero-based column index. */
export interface ImportColumnMapping {
  date?: number;
  description?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  direction?: number;
  merchant?: number;
  notes?: number;
  category?: number;
  externalId?: number;
}

export type ImportColumn = keyof ImportColumnMapping;

/** `dmy` and `mdy` are the two readings of the same `01/02/2026`. */
export type ImportDateFormat = 'iso' | 'dmy' | 'mdy';

/** One signed column, separate debit/credit columns, or a magnitude plus a D/C flag. */
export type ImportSignConvention = 'signed' | 'debit_credit' | 'direction_flag';

export interface ImportOptions {
  delimiter: string;
  hasHeader: boolean;
  mapping: ImportColumnMapping;
  dateFormat: ImportDateFormat;
  decimalSeparator: '.' | ',';
  signConvention: ImportSignConvention;
  invertAmounts: boolean;
}

/** Everything the client may override when asking for a fresh preview. */
export type ImportOptionOverrides = Partial<ImportOptions>;

export interface ImportRowIssue {
  field: string;
  /** Already rendered in the request's locale by the server. */
  message: string;
}

export interface ImportPreviewRow {
  /** 1-based line in the source file, header included. */
  lineNumber: number;
  occurredOn: DateOnly | null;
  description: string;
  merchant: string | null;
  notes: string | null;
  /** Signed, in the account's currency: negative is money leaving. */
  amount: Money | null;
  type: 'income' | 'expense' | null;
  categoryId: string | null;
  /** The file's own category text when it matched nothing in the workspace. */
  categoryName: string | null;
  externalId: string | null;
  errors: ImportRowIssue[];
  duplicateOfTransactionId: string | null;
  duplicateOfLineNumber: number | null;
  raw: string[];
}

export interface ImportPreview {
  batchId: string;
  accountId: string;
  accountName: string;
  currency: string;
  filename: string | null;
  headers: string[];
  options: ImportOptions;
  /** The mapping came from this account's last import rather than from a guess. */
  mappingRecalled: boolean;
  /** The file reads either way round and nothing in it settles the question. */
  dateFormatAmbiguous: boolean;
  rows: ImportPreviewRow[];
  counts: { total: number; ready: number; invalid: number; duplicate: number };
  totals: { inflow: Money; outflow: Money; net: Money };
  expiresAt: Timestamp;
}

export type ImportBatchStatus = 'preview' | 'committed' | 'reverted';

export interface ImportBatch {
  id: string;
  accountId: string;
  accountName: string;
  status: ImportBatchStatus;
  filename: string | null;
  rowCount: number;
  importedCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Timestamp;
  committedAt: Timestamp | null;
  revertedAt: Timestamp | null;
}
