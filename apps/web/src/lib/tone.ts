import type { BudgetStatus, GoalStatus, TransactionStatus } from '../api/types';
import type { LedgerTone } from '../components/LedgerRow';

export interface ToneMeta {
  tone: LedgerTone;
  /**
   * The state in words, as a catalogue key — a spine is a colour, and a colour
   * is never a signal alone. A key rather than a label because this module is
   * evaluated once at import, before any language is settled.
   */
  label: string;
}

/**
 * Domain state → statement-line spine.
 *
 * The ordinary case gets no spine at all. A ledger where every line is marked
 * is a ledger where nothing is marked, so `cleared` and `on_track` — the states
 * that describe most rows most of the time — draw nothing, and the eye is free
 * to find the handful of rows that are waiting, late or over.
 */
export const TRANSACTION_TONE: Record<TransactionStatus, ToneMeta> = {
  cleared: { tone: 'none', label: 'transactions.status.cleared' },
  pending: { tone: 'caution', label: 'transactions.status.pending' },
  scheduled: { tone: 'neutral', label: 'transactions.status.scheduled' },
  void: { tone: 'negative', label: 'transactions.status.void' },
};

export const BUDGET_TONE: Record<BudgetStatus, ToneMeta> = {
  on_track: { tone: 'none', label: 'budgets.status.onTrack' },
  warning: { tone: 'caution', label: 'budgets.status.warning' },
  exceeded: { tone: 'negative', label: 'budgets.status.exceeded' },
};

export const GOAL_TONE: Record<GoalStatus, ToneMeta> = {
  active: { tone: 'accent', label: 'goals.status.active' },
  achieved: { tone: 'positive', label: 'goals.status.achieved' },
  paused: { tone: 'neutral', label: 'goals.status.paused' },
  cancelled: { tone: 'none', label: 'goals.status.cancelled' },
};

/** Tolerates a status the client's union does not know about yet. */
export function budgetTone(status: string): ToneMeta {
  return BUDGET_TONE[status as BudgetStatus] ?? BUDGET_TONE.on_track;
}
