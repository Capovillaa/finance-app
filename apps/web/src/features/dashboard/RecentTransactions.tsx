import type { ReactElement } from 'react';
import type { Transaction } from '../../api/types';
import LedgerList from '../../components/LedgerList';
import LedgerRow from '../../components/LedgerRow';
import Panel from '../../components/Panel';
import { formatDateShort, formatMoney, isNegative } from '../../lib/format';
import { TRANSACTION_TONE } from '../../lib/tone';
import { useTranslation } from 'react-i18next';

interface RecentTransactionsProps {
  transactions: Transaction[];
  loading?: boolean;
}

export default function RecentTransactions({
  transactions,
  loading = false,
}: RecentTransactionsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Panel title={t('dashboard.recentTransactions')} padded={false} fullHeight>
      <LedgerList
        loading={loading}
        isEmpty={transactions.length === 0}
        emptyMessage={t('dashboard.nothingRecorded')}
        label={t('dashboard.recentTransactions')}
      >
        {transactions.map((transaction) => {
          const state = TRANSACTION_TONE[transaction.status];

          return (
            <LedgerRow
              key={transaction.id}
              lead={formatDateShort(transaction.occurredOn)}
              primary={transaction.description}
              meta={transaction.categoryName ?? t('common.uncategorised')}
              amount={formatMoney(transaction.amount, transaction.currency)}
              // The sign is already in the formatted amount, so the colour is
              // reinforcement rather than the only signal.
              amountTone={isNegative(transaction.amount) ? 'negative' : 'positive'}
              tone={state.tone}
              toneLabel={t(state.label)}
            />
          );
        })}
      </LedgerList>
    </Panel>
  );
}
