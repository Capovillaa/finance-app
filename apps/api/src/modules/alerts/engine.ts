import { sql } from 'kysely';
import { db } from '../../db/client.js';
import type { AlertRuleType, NotificationChannel } from '../../db/types.js';
import { addDays, addMonths, endOfMonth, startOfMonth, today, type DateOnly } from '../../lib/dates.js';
import { t } from '../../lib/i18n.js';
import { logger } from '../../lib/logger.js';
import { abs, compare, Decimal } from '../../lib/money.js';
import { getBudgetProgress } from '../budgets/service.js';
import { notifyWorkspace } from '../notifications/service.js';
import {
  classifyBudgetUsage,
  detectDeviation,
  detectDuplicates,
  detectLargeTransaction,
  type DuplicateCandidate,
  type MonthlyPoint,
} from './detectors.js';

interface AlertRuleRow {
  id: string;
  workspace_id: string;
  type: AlertRuleType;
  is_enabled: boolean;
  config: Record<string, unknown>;
  channels: NotificationChannel[];
  scope_category_id: string | null;
  scope_account_id: string | null;
}

export interface AlertEvaluationSummary {
  workspaceId: string;
  notificationsCreated: number;
  byType: Partial<Record<AlertRuleType, number>>;
}

async function enabledRules(workspaceId: string): Promise<AlertRuleRow[]> {
  const rows = await db
    .selectFrom('alert_rules')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('is_enabled', '=', true)
    .execute();
  return rows as unknown as AlertRuleRow[];
}

const num = (config: Record<string, unknown>, key: string, fallback: number): number => {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const str = (config: Record<string, unknown>, key: string, fallback: string): string => {
  const value = config[key];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
};

/**
 * Runs every enabled rule for a workspace.
 *
 * Each finding gets a stable dedupe key built from what it is about, so a scan
 * that runs hourly still notifies at most once per distinct finding.
 */
export async function evaluateWorkspaceAlerts(
  workspaceId: string,
  asOf: DateOnly = today('UTC'),
): Promise<AlertEvaluationSummary> {
  const rules = await enabledRules(workspaceId);
  const summary: AlertEvaluationSummary = { workspaceId, notificationsCreated: 0, byType: {} };

  for (const rule of rules) {
    try {
      const created = await evaluateRule(rule, asOf);
      summary.notificationsCreated += created;
      summary.byType[rule.type] = (summary.byType[rule.type] ?? 0) + created;
    } catch (err) {
      // One failing rule must not stop the rest from running.
      logger.error({ err, workspaceId, ruleType: rule.type }, 'Alert rule evaluation failed');
    }
  }

  return summary;
}

async function evaluateRule(rule: AlertRuleRow, asOf: DateOnly): Promise<number> {
  switch (rule.type) {
    case 'budget_threshold':
    case 'budget_exceeded':
      return evaluateBudgets(rule, asOf);
    case 'large_transaction':
      return evaluateLargeTransactions(rule, asOf);
    case 'unusual_spending':
      return evaluateUnusualSpending(rule, asOf);
    case 'duplicate_transaction':
      return evaluateDuplicates(rule, asOf);
    case 'bill_due':
      return evaluateBillsDue(rule, asOf);
    case 'goal_milestone':
      return evaluateGoalMilestones(rule);
    case 'low_balance':
      return evaluateLowBalance(rule);
    default:
      return 0;
  }
}

async function workspaceBaseCurrency(workspaceId: string): Promise<string> {
  const row = await db
    .selectFrom('workspaces')
    .select('base_currency')
    .where('id', '=', workspaceId)
    .executeTakeFirstOrThrow();
  return row.base_currency;
}

async function evaluateBudgets(rule: AlertRuleRow, asOf: DateOnly): Promise<number> {
  const baseCurrency = await workspaceBaseCurrency(rule.workspace_id);

  const budgets = await db
    .selectFrom('budgets')
    .select('id')
    .where('workspace_id', '=', rule.workspace_id)
    .where('is_active', '=', true)
    .where('start_date', '<=', asOf)
    .where('end_date', '>=', asOf)
    .execute();

  let created = 0;

  for (const budget of budgets) {
    const progress = await getBudgetProgress(rule.workspace_id, budget.id, baseCurrency, asOf);

    for (const line of progress.lines) {
      if (rule.scope_category_id && rule.scope_category_id !== line.categoryId) continue;

      const threshold = num(rule.config, 'thresholdPercent', line.alertThresholdPercent);
      const usage = classifyBudgetUsage(line.spentAmount, line.limitAmount, threshold);

      const wantExceeded = rule.type === 'budget_exceeded';
      if (wantExceeded && usage.status !== 'exceeded') continue;
      if (!wantExceeded && usage.status !== 'warning') continue;

      const overBy = wantExceeded
        ? new Decimal(line.spentAmount).minus(line.limitAmount).toDecimalPlaces(2).toFixed(2)
        : null;

      const count = await notifyWorkspace(rule.workspace_id, {
        type: rule.type,
        severity: wantExceeded ? 'critical' : 'warning',
        content: (locale) => ({
          title: wantExceeded
            ? t(locale, 'alertNotifications.budgetThreshold.titleExceeded', { category: line.categoryName })
            : t(locale, 'alertNotifications.budgetThreshold.titleWarning', {
                percent: usage.percentUsed,
                category: line.categoryName,
              }),
          message: wantExceeded
            ? t(locale, 'alertNotifications.budgetThreshold.messageExceeded', {
                currency: baseCurrency,
                spent: line.spentAmount,
                limit: line.limitAmount,
                category: line.categoryName,
                overBy,
              })
            : t(locale, 'alertNotifications.budgetThreshold.messageWarning', {
                category: line.categoryName,
                percent: usage.percentUsed,
                currency: baseCurrency,
                limit: line.limitAmount,
                remaining: 100 - Math.round(progress.periodProgressPercent),
              }),
        }),
        data: {
          budgetId: budget.id,
          budgetLineId: line.id,
          categoryId: line.categoryId,
          spent: line.spentAmount,
          limit: line.limitAmount,
          percentUsed: usage.percentUsed,
        },
        channels: rule.channels,
        // One alert per line per budget period.
        dedupeKey: `${rule.type}:${line.id}:${progress.startDate}`,
      });

      created += count;
    }
  }

  return created;
}

async function evaluateLargeTransactions(rule: AlertRuleRow, asOf: DateOnly): Promise<number> {
  const lookbackStart = addDays(asOf, -num(rule.config, 'lookbackDays', 1));
  const baseCurrency = await workspaceBaseCurrency(rule.workspace_id);

  let recentQuery = db
    .selectFrom('transactions')
    .select(['id', 'base_amount', 'description', 'occurred_on', 'account_id', 'category_id'])
    .where('workspace_id', '=', rule.workspace_id)
    .where('type', '=', 'expense')
    .where('deleted_at', 'is', null)
    .where('occurred_on', '>=', lookbackStart)
    .where('occurred_on', '<=', asOf);

  if (rule.scope_account_id) recentQuery = recentQuery.where('account_id', '=', rule.scope_account_id);
  if (rule.scope_category_id) recentQuery = recentQuery.where('category_id', '=', rule.scope_category_id);

  const recent = await recentQuery.execute();
  if (recent.length === 0) return 0;

  // Trailing average expense, so the relative arm of the test reflects this
  // workspace's own habits rather than a global constant.
  const averageRow = await db
    .selectFrom('transactions')
    .select((eb) => eb.fn.avg<string>(sql<string>`abs(base_amount)`).as('average'))
    .where('workspace_id', '=', rule.workspace_id)
    .where('type', '=', 'expense')
    .where('deleted_at', 'is', null)
    .where('occurred_on', '>=', addMonths(asOf, -6))
    .executeTakeFirst();

  const average = averageRow?.average ?? '0';
  let created = 0;

  for (const transaction of recent) {
    const verdict = detectLargeTransaction(transaction.base_amount, {
      minAmount: str(rule.config, 'minAmount', '1000.0000'),
      multipleOfAverage: num(rule.config, 'multipleOfAverage', 3),
      averageAmount: average,
    });

    if (!verdict.isLarge) continue;

    created += await notifyWorkspace(rule.workspace_id, {
      type: 'large_transaction',
      severity: 'warning',
      content: (locale) => ({
        title: t(locale, 'alertNotifications.largeTransaction.title'),
        message: t(locale, 'alertNotifications.largeTransaction.message', {
          description: transaction.description,
          currency: baseCurrency,
          amount: abs(transaction.base_amount),
          date: transaction.occurred_on,
          suffix:
            verdict.reason === 'multiple_of_average'
              ? t(locale, 'alertNotifications.largeTransaction.suffixMultiple', {
                  multiple: num(rule.config, 'multipleOfAverage', 3),
                })
              : '',
        }),
      }),
      data: {
        transactionId: transaction.id,
        amount: abs(transaction.base_amount),
        reason: verdict.reason,
        threshold: verdict.threshold,
      },
      channels: rule.channels,
      dedupeKey: `large_transaction:${transaction.id}`,
    });
  }

  return created;
}

async function evaluateUnusualSpending(rule: AlertRuleRow, asOf: DateOnly): Promise<number> {
  const lookbackMonths = num(rule.config, 'lookbackMonths', 6);
  const minMonths = num(rule.config, 'minMonths', 3);
  const sigma = num(rule.config, 'sigma', 2);
  const minAmount = str(rule.config, 'minAmount', '100.0000');
  const baseCurrency = await workspaceBaseCurrency(rule.workspace_id);

  const currentStart = startOfMonth(asOf);
  const historyStart = startOfMonth(addMonths(currentStart, -lookbackMonths));

  // One pass over the ledger: monthly expense totals per category.
  const rows = await sql<{
    category_id: string | null;
    category_name: string | null;
    month: string;
    total: string;
  }>`
    SELECT
      t.category_id,
      c.name AS category_name,
      to_char(date_trunc('month', t.occurred_on), 'YYYY-MM') AS month,
      abs(sum(t.base_amount))::text AS total
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.workspace_id = ${rule.workspace_id}
      AND t.type = 'expense'
      AND t.deleted_at IS NULL
      AND t.status IN ('cleared','pending')
      AND t.occurred_on >= ${historyStart}
      AND t.occurred_on <= ${endOfMonth(asOf)}
      AND t.category_id IS NOT NULL
    GROUP BY t.category_id, c.name, date_trunc('month', t.occurred_on)
    ORDER BY t.category_id, month
  `.execute(db);

  const currentMonth = currentStart.slice(0, 7);
  // `name` stays `null` for an unnamed category rather than baking in an English
  // fallback here — the fallback word is only resolved once a recipient's locale
  // is known, in `notifyWorkspace`'s `content` builder below.
  const byCategory = new Map<string, { name: string | null; points: MonthlyPoint[] }>();

  for (const row of rows.rows) {
    if (!row.category_id) continue;
    const entry = byCategory.get(row.category_id) ?? { name: row.category_name, points: [] };
    entry.points.push({ month: row.month, total: row.total });
    byCategory.set(row.category_id, entry);
  }

  let created = 0;

  for (const [categoryId, entry] of byCategory) {
    if (rule.scope_category_id && rule.scope_category_id !== categoryId) continue;

    const current = entry.points.find((p) => p.month === currentMonth);
    if (!current) continue;
    if (compare(current.total, minAmount) < 0) continue;

    const history = entry.points.filter((p) => p.month !== currentMonth);
    const result = detectDeviation(history, current.total, { sigma, minSamples: minMonths });
    if (!result.isAnomaly) continue;

    created += await notifyWorkspace(rule.workspace_id, {
      type: 'unusual_spending',
      severity: 'warning',
      content: (locale) => {
        const category = entry.name ?? t(locale, 'common.uncategorised');
        return {
          title: t(locale, 'alertNotifications.unusualSpending.title', { category }),
          message: t(locale, 'alertNotifications.unusualSpending.message', {
            category,
            currency: baseCurrency,
            total: current.total,
            mean: result.mean,
            percent: Math.round(result.percentAboveMean),
          }),
        };
      },
      data: {
        categoryId,
        currentTotal: current.total,
        mean: result.mean,
        standardDeviation: result.standardDeviation,
        zScore: result.zScore,
        monthsAnalysed: history.length,
      },
      channels: rule.channels,
      dedupeKey: `unusual_spending:${categoryId}:${currentMonth}`,
    });
  }

  return created;
}

async function evaluateDuplicates(rule: AlertRuleRow, asOf: DateOnly): Promise<number> {
  const windowDays = num(rule.config, 'windowDays', 3);
  const from = addDays(asOf, -windowDays * 2);

  const rows = await db
    .selectFrom('transactions')
    .select(['id', 'account_id', 'amount', 'occurred_on', 'description', 'merchant'])
    .where('workspace_id', '=', rule.workspace_id)
    .where('deleted_at', 'is', null)
    .where('type', '<>', 'transfer')
    .where('occurred_on', '>=', from)
    .where('occurred_on', '<=', asOf)
    .orderBy('occurred_on', 'asc')
    .execute();

  const candidates: DuplicateCandidate[] = rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    amount: row.amount,
    occurredOn: row.occurred_on,
    description: row.description,
    merchant: row.merchant,
  }));

  const pairs = detectDuplicates(candidates, { windowDays });
  let created = 0;

  for (const pair of pairs) {
    const transaction = rows.find((r) => r.id === pair.transactionId);
    if (!transaction) continue;

    created += await notifyWorkspace(rule.workspace_id, {
      type: 'duplicate_transaction',
      severity: 'info',
      content: (locale) => ({
        title: t(locale, 'alertNotifications.duplicateTransaction.title'),
        message: t(locale, 'alertNotifications.duplicateTransaction.message', {
          description: transaction.description,
          amount: abs(transaction.amount),
          date: transaction.occurred_on,
          reason:
            pair.dayGap === 0
              ? t(locale, 'alertNotifications.duplicateTransaction.reasonSameDay')
              : t(locale, 'alertNotifications.duplicateTransaction.reasonDaysApart', { count: pair.dayGap }),
        }),
      }),
      data: {
        transactionId: pair.transactionId,
        duplicateOfId: pair.duplicateOfId,
        confidence: pair.confidence,
      },
      channels: rule.channels,
      dedupeKey: `duplicate:${pair.duplicateOfId}:${pair.transactionId}`,
    });
  }

  return created;
}

async function evaluateBillsDue(rule: AlertRuleRow, asOf: DateOnly): Promise<number> {
  const daysBefore = num(rule.config, 'daysBefore', 3);
  const horizon = addDays(asOf, daysBefore);

  const upcoming = await db
    .selectFrom('recurring_transactions')
    .select(['id', 'name', 'amount', 'currency', 'next_occurrence_on'])
    .where('workspace_id', '=', rule.workspace_id)
    .where('is_active', '=', true)
    .where('type', '=', 'expense')
    .where('next_occurrence_on', 'is not', null)
    .where('next_occurrence_on', '>=', asOf)
    .where('next_occurrence_on', '<=', horizon)
    .execute();

  let created = 0;

  for (const bill of upcoming) {
    const dueOn = bill.next_occurrence_on!;
    created += await notifyWorkspace(rule.workspace_id, {
      type: 'bill_due',
      severity: 'info',
      content: (locale) => ({
        title: t(locale, 'alertNotifications.billDue.title', { name: bill.name }),
        message: t(locale, 'alertNotifications.billDue.message', {
          name: bill.name,
          currency: bill.currency,
          amount: abs(bill.amount),
          date: dueOn,
        }),
      }),
      data: { recurringTransactionId: bill.id, dueOn, amount: abs(bill.amount) },
      channels: rule.channels,
      dedupeKey: `bill_due:${bill.id}:${dueOn}`,
    });
  }

  return created;
}

async function evaluateGoalMilestones(rule: AlertRuleRow): Promise<number> {
  const configured = Array.isArray(rule.config.milestones)
    ? (rule.config.milestones as unknown[]).filter((m): m is number => typeof m === 'number')
    : [25, 50, 75, 100];

  const goals = await db
    .selectFrom('financial_goals')
    .select(['id', 'name', 'target_amount', 'current_amount', 'currency'])
    .where('workspace_id', '=', rule.workspace_id)
    .where('status', 'in', ['active', 'achieved'])
    .execute();

  let created = 0;

  for (const goal of goals) {
    const target = new Decimal(goal.target_amount);
    if (target.isZero()) continue;
    const percent = new Decimal(goal.current_amount).div(target).times(100).toNumber();

    // Only the highest milestone actually reached is announced.
    const reached = configured.filter((m) => percent >= m).sort((a, b) => b - a)[0];
    if (reached === undefined) continue;

    created += await notifyWorkspace(rule.workspace_id, {
      type: 'goal_milestone',
      severity: 'info',
      content: (locale) => ({
        title:
          reached >= 100
            ? t(locale, 'alertNotifications.goalMilestone.titleReached', { name: goal.name })
            : t(locale, 'alertNotifications.goalMilestone.titleProgress', { percent: reached, name: goal.name }),
        message:
          reached >= 100
            ? t(locale, 'alertNotifications.goalMilestone.messageReached', {
                name: goal.name,
                currency: goal.currency,
                amount: goal.target_amount,
              })
            : t(locale, 'alertNotifications.goalMilestone.messageProgress', {
                name: goal.name,
                currency: goal.currency,
                current: goal.current_amount,
                target: goal.target_amount,
              }),
      }),
      data: { goalId: goal.id, milestone: reached, percent: Math.round(percent) },
      channels: rule.channels,
      dedupeKey: `goal_milestone:${goal.id}:${reached}`,
    });
  }

  return created;
}

async function evaluateLowBalance(rule: AlertRuleRow): Promise<number> {
  const minBalance = str(rule.config, 'minBalance', '100.0000');

  let query = db
    .selectFrom('accounts')
    .select(['id', 'name', 'current_balance', 'currency', 'type'])
    .where('workspace_id', '=', rule.workspace_id)
    .where('is_archived', '=', false)
    // Credit cards and loans are expected to carry a negative balance.
    .where('type', 'in', ['checking', 'savings', 'cash']);

  if (rule.scope_account_id) query = query.where('id', '=', rule.scope_account_id);

  const accounts = await query.execute();
  let created = 0;

  for (const account of accounts) {
    if (compare(account.current_balance, minBalance) >= 0) continue;

    created += await notifyWorkspace(rule.workspace_id, {
      type: 'low_balance',
      severity: compare(account.current_balance, '0') < 0 ? 'critical' : 'warning',
      content: (locale) => ({
        title: t(locale, 'alertNotifications.lowBalance.title', { name: account.name }),
        message: t(locale, 'alertNotifications.lowBalance.message', {
          name: account.name,
          currency: account.currency,
          balance: account.current_balance,
        }),
      }),
      data: { accountId: account.id, balance: account.current_balance, threshold: minBalance },
      channels: rule.channels,
      // Re-alert at most once per day per account.
      dedupeKey: `low_balance:${account.id}:${today('UTC')}`,
    });
  }

  return created;
}

/** Every workspace with at least one enabled rule, for the scheduled scan. */
export async function workspacesWithAlerts(limit = 1000): Promise<string[]> {
  const rows = await db
    .selectFrom('alert_rules')
    .select('workspace_id')
    .where('is_enabled', '=', true)
    .groupBy('workspace_id')
    .limit(limit)
    .execute();
  return rows.map((r) => r.workspace_id);
}
