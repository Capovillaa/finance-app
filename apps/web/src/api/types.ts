import type {
  AccountType as SharedAccountType,
  BudgetPeriod as SharedBudgetPeriod,
  GoalCategory as SharedGoalCategory,
  GoalStatus as SharedGoalStatus,
  LedgerStatus,
  LedgerType,
  RecurringFrequency,
  WorkspaceRole as SharedWorkspaceRole,
} from '@finance/schemas';
import type { components, operations } from './schema';

/**
 * The names this app calls the API's response shapes by.
 *
 * **Nothing here describes a structure any more.** Every shape below is read out
 * of `schema.d.ts`, which `npm run generate:openapi` writes from
 * `docs/openapi.json`, which the API generates from the Zod schemas beside each
 * service — and those are checked against real responses by the integration
 * suite. The chain has no hand-copied link in it, so a field that changes on the
 * server is a compile error here rather than `undefined` at runtime.
 *
 * What this file still does is *name* things, for two reasons. A generated name
 * like `operations['getWorkspacesByWorkspaceIdAnalyticsDashboard']['responses']['200']['content']['application/json']`
 * is not something to write at a call site; and the closed value sets
 * (`AccountType`, `WorkspaceRole`, …) are better taken from `@finance/schemas`,
 * where both apps read them from one declaration, than from the spec's inlined
 * copy of the same list.
 *
 * Adding a name: alias `components['schemas'][…]` for anything the API publishes
 * as a component, and `Ok<'operationId'>` for an envelope that only one endpoint
 * returns. Never write a field list.
 */

type Schemas = components['schemas'];

/** The 200/201 JSON body of one operation, by its `operationId` in the spec. */
type Ok<Id extends keyof operations> = operations[Id]['responses'] extends {
  200: { content: { 'application/json': infer Body } };
}
  ? Body
  : operations[Id]['responses'] extends { 201: { content: { 'application/json': infer Body } } }
    ? Body
    : never;

/** The JSON request body of one operation. */
type Sends<Id extends keyof operations> = operations[Id] extends {
  requestBody: { content: { 'application/json': infer Body } };
}
  ? Body
  : never;

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

/** A decimal amount with up to four places, e.g. `"1250.0000"`. Never a number. */
export type Money = Schemas['Money'];

/** A calendar date, `YYYY-MM-DD`. */
export type DateOnly = Schemas['DateOnly'];

/** An ISO 8601 instant. Dates cross the wire serialised, not as `Date`. */
export type Timestamp = Schemas['Timestamp'];

// ---------------------------------------------------------------------------
// Closed value sets
//
// From `@finance/schemas` rather than from the spec: both apps read them from
// one declaration there, so adding an account type on the server is a compile
// error here without a regeneration step in between.
// ---------------------------------------------------------------------------

export type WorkspaceRole = SharedWorkspaceRole;

export type AccountType = SharedAccountType;

/** Everything the ledger can hold, including the legs a transfer produces. */
export type TransactionType = LedgerType;

export type TransactionStatus = LedgerStatus;

export type CategoryKind = Schemas['Category']['kind'];

/** Derived by the API from spend against limit; not a value any request sends. */
export type BudgetStatus = Schemas['BudgetLineProgress']['status'];

export type BudgetPeriod = SharedBudgetPeriod;

export type NotificationSeverity = Schemas['Notification']['severity'];

export type GoalCategory = SharedGoalCategory;

export type GoalStatus = SharedGoalStatus;

export type RecurrenceFrequency = RecurringFrequency;

export type AlertRuleType = Schemas['AlertRule']['type'];

export type NotificationChannel = Schemas['AlertRule']['channels'][number];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The single error envelope every endpoint uses. */
export type ApiErrorBody = Schemas['Error'];

export type ApiErrorDetail = NonNullable<NonNullable<ApiErrorBody['error']['details']>[number]>;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * The pagination envelope, which the client wants as a generic and the API
 * cannot publish as one — OpenAPI 3.1 has no generics, so the six fields are
 * written around each item type separately.
 *
 * Bridged rather than retyped: the fields come from a real paginated operation
 * with its `items` swapped out, so a change to the envelope on the server
 * reaches every `Page<T>` here without anyone editing this line.
 */
type PageEnvelope = Omit<Ok<'getWorkspacesByWorkspaceIdTransactions'>, 'items'>;

export type Page<T> = PageEnvelope & { items: T[] };

// ---------------------------------------------------------------------------
// Auth and users
// ---------------------------------------------------------------------------

export type User = Schemas['User'];

export type AuthResult = Ok<'postAuthLogin'>;

export type TokenPair = Ok<'postAuthRefresh'>;

/** What `DELETE /users/me` answers: an erasure booked for later, not done. */
export type DeletionScheduled = Ok<'deleteUsersMe'>;

export type LoginRequest = Sends<'postAuthLogin'>;

export type RegisterRequest = Sends<'postAuthRegister'>;

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export type Workspace = Schemas['Workspace'];

export type WorkspaceMember = Schemas['WorkspaceMember'];

/**
 * A pending seat. The token itself is never returned by the list endpoint — it
 * only ever leaves the server inside the invitation email — so the client can
 * show and revoke an invitation but cannot re-send its link.
 */
export type WorkspaceInvitation = Schemas['WorkspaceInvitation'];

export type ActivityItem = Schemas['ActivityItem'];

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type Account = Schemas['Account'];

export type AccountListResponse = Ok<'getWorkspacesByWorkspaceIdAccounts'>;

export type AccountReconciliation = Schemas['AccountReconciliation'];

export type ReconciliationResult = Schemas['ReconciliationResult'];

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type Category = Schemas['Category'];

/** `GET /categories?shape=tree` returns the same rows nested. */
export type CategoryNode = Schemas['CategoryNode'];

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type Transaction = Schemas['Transaction'];

export type Tag = Schemas['Tag'];

/**
 * One person's share of a transaction.
 *
 * `shareAmount` is always the *magnitude*, never signed, and the server
 * guarantees the shares of a transaction add up to the absolute value of its
 * amount — so the client never has to reconcile them.
 */
export type TransactionSplit = Schemas['TransactionSplit'];

export type TransactionComment = Schemas['TransactionComment'];

/** `GET /transactions/:id` returns the row with everything hanging off it. */
export type TransactionDetail = Ok<'getWorkspacesByWorkspaceIdTransactionsById'>;

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export type BudgetLineProgress = Schemas['BudgetLineProgress'];

export type BudgetProgress = Schemas['BudgetProgress'];

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type Goal = Schemas['Goal'];

export type GoalContribution = Schemas['GoalContribution'];

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------

export type RecurringTransaction = Schemas['RecurringTransaction'];

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertRule = Schemas['AlertRule'];

export type AlertEvaluationSummary = Ok<'postWorkspacesByWorkspaceIdAlertsEvaluate'>;

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export type DateRange = Schemas['DateRange'];

export type PeriodTotals = Schemas['PeriodTotals'];

export type CategoryBreakdownItem = Schemas['CategoryBreakdownItem'];

export type ComparisonResult = Ok<'getWorkspacesByWorkspaceIdAnalyticsCompare'>;

export type TrendPoint = Schemas['TrendPoint'];

export type NetWorthPoint = Ok<'getWorkspacesByWorkspaceIdAnalyticsNetWorth'>['points'][number];

export type SavingsRatePoint = Ok<'getWorkspacesByWorkspaceIdAnalyticsSavingsRate'>['points'][number];

export type SpendingInsight = Ok<'getWorkspacesByWorkspaceIdAnalyticsInsights'>['insights'][number];

export type BudgetVarianceRow = Ok<'getWorkspacesByWorkspaceIdAnalyticsBudgetVariance'>['rows'][number];

export type DashboardSummary = Ok<'getWorkspacesByWorkspaceIdAnalyticsDashboard'>;

export type DashboardBudget = DashboardSummary['budgets'][number];

export type UpcomingBill = DashboardSummary['upcomingBills'][number];

export type DashboardGoal = DashboardSummary['goals'][number];

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/**
 * A closed statement for one month.
 *
 * `openingBalance` is derived from the ledger *before* the range rather than
 * stored, so a statement for any past month is reproducible — re-requesting it
 * next year returns the same figures. Both balances are in `baseCurrency`;
 * `accounts[].closingBalance` is in each account's own currency.
 */
export type MonthlyStatement = Ok<'getWorkspacesByWorkspaceIdReportsStatement'>['statement'];

export type StatementAccountBalance = MonthlyStatement['accounts'][number];

export type StatementBudget = MonthlyStatement['budgets'][number];

export type YearOverYearRow = Ok<'getWorkspacesByWorkspaceIdReportsYearOverYear'>['rows'][number];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type Notification = Schemas['Notification'];

export type NotificationPage = Ok<'getNotifications'>;

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

export type Currency = Schemas['Currency'];

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/** The fields an import can fill, each mapped to a zero-based column index. */
export type ImportColumnMapping = Schemas['ImportColumnMapping'];

export type ImportColumn = keyof ImportColumnMapping;

/** `dmy` and `mdy` are the two readings of the same `01/02/2026`. */
export type ImportDateFormat = ImportOptions['dateFormat'];

/** One signed column, separate debit/credit columns, or a magnitude plus a D/C flag. */
export type ImportSignConvention = ImportOptions['signConvention'];

export type ImportOptions = Schemas['ImportOptions'];

/** Everything the client may override when asking for a fresh preview. */
export type ImportOptionOverrides = Partial<ImportOptions>;

export type ImportRowIssue = Schemas['ImportRowIssue'];

export type ImportPreviewRow = Schemas['ImportPreviewRow'];

export type ImportPreview = Schemas['ImportPreview'];

export type ImportBatch = Schemas['ImportBatch'];

export type ImportBatchStatus = ImportBatch['status'];
