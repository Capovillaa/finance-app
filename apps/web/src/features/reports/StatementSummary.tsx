import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { ReactElement } from 'react';
import type { MonthlyStatement } from '../../api/types';
import StatTile from '../../components/StatTile';
import { formatDate, formatMoney, formatPercent } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface StatementSummaryProps {
  statement: MonthlyStatement | undefined;
  loading?: boolean;
}

/**
 * The headline of a monthly statement.
 *
 * Closing balance leads because it is the one figure a statement exists to
 * report. Opening balance sits beside it as context rather than as a second
 * hero — the pair is a range, not two independent numbers.
 *
 * Nothing here does arithmetic on the amounts. The movement between the two
 * balances is already `totals.net`, computed server-side in `Decimal`; deriving
 * it in the browser would mean float subtraction on values the whole stack
 * exists to keep exact.
 */
export default function StatementSummary({ statement, loading = false }: StatementSummaryProps): ReactElement {
  const { t } = useTranslation();
  const currency = statement?.baseCurrency ?? 'USD';
  const totals = statement?.totals;

  return (
    <Stack spacing={2}>
      {/* Sits on the page rather than in a card, the same way the dashboard's
          total does: it is the figure the statement exists to report. */}
      <Stack spacing={1} sx={{ pb: 1 }}>
        <Typography variant="eyebrow" component="h2" color="text.secondary">
          {t('reports.closingBalance')}
        </Typography>

        {loading ? (
          <Skeleton variant="text" width={300} height={70} />
        ) : (
          <Typography variant="display">{formatMoney(statement?.closingBalance, currency)}</Typography>
        )}

        {loading ? (
          <Skeleton variant="text" width={260} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('reports.openedAt', { amount: formatMoney(statement?.openingBalance, currency) })}
            {statement ? ` · ${t('transactions.count', { count: statement.transactionCount })}` : ''}
            {statement
              ? ` · ${t('reports.range', {
                  start: formatDate(statement.range.start),
                  end: formatDate(statement.range.end),
                })}`
              : ''}
          </Typography>
        )}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        <StatTile
          label={t('common.income')}
          value={formatMoney(totals?.income, currency)}
          amount={totals?.income}
          currency={currency}
          loading={loading}
        />
        <StatTile
          label={t('common.expenses')}
          value={formatMoney(totals?.expenses, currency)}
          amount={totals?.expenses}
          currency={currency}
          loading={loading}
        />
        <StatTile
          label={t('reports.net')}
          value={formatMoney(totals?.net, currency)}
          amount={totals?.net}
          currency={currency}
          deltaCaption={t('dashboard.savingsRate', { percent: formatPercent(totals?.savingsRate) })}
          loading={loading}
        />
      </Box>
    </Stack>
  );
}
