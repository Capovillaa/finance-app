import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { DateOnly, UpcomingBill } from '../../api/types';
import LedgerList from '../../components/LedgerList';
import LedgerRow from '../../components/LedgerRow';
import Panel from '../../components/Panel';
import { formatDate, formatMoney, todayIso } from '../../lib/format';

interface UpcomingBillsProps {
  bills: UpcomingBill[];
}

/** Whole days between two calendar dates, ignoring time of day entirely. */
function daysUntil(due: DateOnly): number {
  const [dy, dm, dd] = due.split('-').map(Number);
  const [ty, tm, td] = todayIso().split('-').map(Number);
  if (!dy || !dm || !dd || !ty || !tm || !td) return 0;

  const dueUtc = Date.UTC(dy, dm - 1, dd);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((dueUtc - todayUtc) / 86_400_000);
}

/**
 * How near a bill is, in words.
 *
 * Takes `t` as an argument rather than calling it, because this is a plain
 * function outside the component — and the wording has to follow the language
 * like everything else on the row.
 */
function dueLabel(days: number, t: TFunction): { text: string; urgent: boolean } {
  if (days < 0) return { text: t('dashboard.overdue', { count: Math.abs(days) }), urgent: true };
  if (days === 0) return { text: t('dashboard.dueToday'), urgent: true };
  if (days === 1) return { text: t('dashboard.dueTomorrow'), urgent: true };
  return { text: t('dashboard.dueInDays', { count: days }), urgent: days <= 3 };
}

export default function UpcomingBills({ bills }: UpcomingBillsProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Panel title={t('dashboard.upcomingBills')} padded={false} fullHeight>
      <LedgerList isEmpty={bills.length === 0} emptyMessage={t('dashboard.nothingScheduled')} label={t('dashboard.upcomingBills')}>
        {bills.map((bill) => {
          const days = daysUntil(bill.dueOn);
          const { text, urgent } = dueLabel(days, t);

          return (
            <LedgerRow
              key={bill.id}
              primary={bill.name}
              secondary={`${text} · ${formatDate(bill.dueOn)}`}
              amount={formatMoney(bill.amount, bill.currency)}
              // A bill is money leaving, but it has not left yet — colouring it
              // as an expense would claim it already happened.
              amountTone="inherit"
              tone={urgent ? 'caution' : 'none'}
              toneLabel={urgent ? t('dashboard.dueSoon') : undefined}
            />
          );
        })}
      </LedgerList>
    </Panel>
  );
}
