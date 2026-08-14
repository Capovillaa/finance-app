import type { AlertRuleType } from '../../api/types';

export const ALERT_TYPES: AlertRuleType[] = [
  'budget_threshold',
  'budget_exceeded',
  'large_transaction',
  'unusual_spending',
  'duplicate_transaction',
  'bill_due',
  'goal_milestone',
  'low_balance',
];

export type ConfigFieldKind = 'percent' | 'number' | 'money' | 'days' | 'percent-list';

/**
 * Everything here is a catalogue key rather than a label.
 *
 * This module is plain data evaluated once at import, so it cannot hold
 * translated text — that would freeze the wording at whatever language the
 * bundle first loaded in. `AlertsPage` and `AlertRuleFormDialog` resolve the
 * keys with `t()` where they render them.
 */
export interface ConfigFieldDef {
  key: string;
  labelKey: string;
  kind: ConfigFieldKind;
  helperTextKey: string;
  default: string;
}

export interface AlertTypeMeta {
  labelKey: string;
  descriptionKey: string;
  fields: ConfigFieldDef[];
}

/**
 * Config keys per type, transcribed from `docs/api.md`'s Alerts table — the
 * server accepts these as a free-form JSON object, so the client is the only
 * place enforcing that each type gets the right shape.
 *
 * A field's key is scoped under its alert type rather than shared: `minAmount`
 * appears under two types and means something different in each, so one
 * catalogue entry could not serve both.
 */
export const ALERT_TYPE_META: Record<AlertRuleType, AlertTypeMeta> = {
  budget_threshold: {
    labelKey: 'alerts.budgetThreshold.label',
    descriptionKey: 'alerts.budgetThreshold.description',
    fields: [
      {
        key: 'thresholdPercent',
        labelKey: 'alerts.budgetThreshold.thresholdPercent',
        kind: 'percent',
        helperTextKey: 'alerts.budgetThreshold.thresholdPercentHint',
        default: '80',
      },
    ],
  },
  budget_exceeded: {
    labelKey: 'alerts.budgetExceeded.label',
    descriptionKey: 'alerts.budgetExceeded.description',
    fields: [],
  },
  large_transaction: {
    labelKey: 'alerts.largeTransaction.label',
    descriptionKey: 'alerts.largeTransaction.description',
    fields: [
      {
        key: 'minAmount',
        labelKey: 'alerts.largeTransaction.minAmount',
        kind: 'money',
        helperTextKey: 'alerts.largeTransaction.minAmountHint',
        default: '',
      },
      {
        key: 'multipleOfAverage',
        labelKey: 'alerts.largeTransaction.multipleOfAverage',
        kind: 'number',
        helperTextKey: 'alerts.largeTransaction.multipleOfAverageHint',
        default: '3',
      },
      {
        key: 'lookbackDays',
        labelKey: 'alerts.largeTransaction.lookbackDays',
        kind: 'days',
        helperTextKey: 'alerts.largeTransaction.lookbackDaysHint',
        default: '90',
      },
    ],
  },
  unusual_spending: {
    labelKey: 'alerts.unusualSpending.label',
    descriptionKey: 'alerts.unusualSpending.description',
    fields: [
      {
        key: 'sigma',
        labelKey: 'alerts.unusualSpending.sigma',
        kind: 'number',
        helperTextKey: 'alerts.unusualSpending.sigmaHint',
        default: '2.5',
      },
      {
        key: 'lookbackMonths',
        labelKey: 'alerts.unusualSpending.lookbackMonths',
        kind: 'number',
        helperTextKey: '',
        default: '6',
      },
      {
        key: 'minMonths',
        labelKey: 'alerts.unusualSpending.minMonths',
        kind: 'number',
        helperTextKey: 'alerts.unusualSpending.minMonthsHint',
        default: '3',
      },
      {
        key: 'minAmount',
        labelKey: 'alerts.unusualSpending.minAmount',
        kind: 'money',
        helperTextKey: 'alerts.unusualSpending.minAmountHint',
        default: '',
      },
    ],
  },
  duplicate_transaction: {
    labelKey: 'alerts.duplicateTransaction.label',
    descriptionKey: 'alerts.duplicateTransaction.description',
    fields: [
      {
        key: 'windowDays',
        labelKey: 'alerts.duplicateTransaction.windowDays',
        kind: 'days',
        helperTextKey: 'alerts.duplicateTransaction.windowDaysHint',
        default: '3',
      },
    ],
  },
  bill_due: {
    labelKey: 'alerts.billDue.label',
    descriptionKey: 'alerts.billDue.description',
    fields: [
      { key: 'daysBefore', labelKey: 'alerts.billDue.daysBefore', kind: 'days', helperTextKey: '', default: '3' },
    ],
  },
  goal_milestone: {
    labelKey: 'alerts.goalMilestone.label',
    descriptionKey: 'alerts.goalMilestone.description',
    fields: [
      {
        key: 'milestones',
        labelKey: 'alerts.goalMilestone.milestones',
        kind: 'percent-list',
        helperTextKey: 'alerts.goalMilestone.milestonesHint',
        default: '25, 50, 75, 100',
      },
    ],
  },
  low_balance: {
    labelKey: 'alerts.lowBalance.label',
    descriptionKey: 'alerts.lowBalance.description',
    fields: [
      {
        key: 'minBalance',
        labelKey: 'alerts.lowBalance.minBalance',
        kind: 'money',
        helperTextKey: '',
        default: '0',
      },
    ],
  },
};
