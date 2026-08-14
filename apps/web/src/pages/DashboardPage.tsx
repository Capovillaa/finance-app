import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetDashboardQuery, useGetTrendsQuery } from '../api/endpoints/analytics';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import StatTile from '../components/StatTile';
import BudgetMeters from '../features/dashboard/BudgetMeters';
import CategoryBreakdownChart from '../features/dashboard/CategoryBreakdownChart';
import GoalProgress from '../features/dashboard/GoalProgress';
import IncomeExpenseChart from '../features/dashboard/IncomeExpenseChart';
import RecentTransactions from '../features/dashboard/RecentTransactions';
import UpcomingBills from '../features/dashboard/UpcomingBills';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { formatDate, formatMoney, formatPercent, isNegative } from '../lib/format';

const TREND_MONTHS = 6;

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();

  // `skipToken` rather than a placeholder id: until the workspace list has
  // resolved there is no legitimate request to make, and a guessed id in the
  // path would just earn a 403.
  const dashboard = useGetDashboardQuery(workspace?.id ?? skipToken);
  const trends = useGetTrendsQuery(
    workspace ? { workspaceId: workspace.id, months: TREND_MONTHS, unit: 'month' } : skipToken,
  );

  if (!workspaceLoading && !workspace) {
    return (
      <EmptyState
        title={t('workspace.none')}
        description={t('workspace.noneDescription')}
      />
    );
  }

  if (dashboard.error) {
    return <ErrorState error={dashboard.error} title={t('dashboard.loadFailed')} onRetry={() => void dashboard.refetch()} />;
  }

  const data = dashboard.data;
  const loading = dashboard.isLoading || workspaceLoading;
  const currency = data?.baseCurrency ?? workspace?.baseCurrency ?? 'USD';
  const month = data?.month;
  const mom = data?.monthOverMonth;

  // More than one currency in play is worth calling out — the headline figure is
  // a converted total, not a simple sum, and the reader should know that.
  const currencies = Object.entries(data?.balanceByCurrency ?? {});
  const isMultiCurrency = currencies.length > 1;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('nav.dashboard')}
        subtitle={
          <>
            {workspace?.name}
            {data ? ` · ${t('dashboard.asOf', { date: formatDate(data.asOf) })}` : ''}
          </>
        }
      />

      {/*
        The hero figure sits directly on the page rather than in a card. It is
        the one number the whole screen is about, and boxing it would make it a
        peer of the tiles beneath it instead of their headline.
      */}
      <Stack spacing={1} sx={{ pb: 1 }}>
        <Typography variant="eyebrow" component="h2" color="text.secondary">
          {t('dashboard.totalBalance')}
        </Typography>

        {loading ? (
          <Skeleton variant="text" width={340} height={76} />
        ) : (
          <Typography
            variant="display"
            sx={{ color: isNegative(data?.totalBalance ?? '0') ? 'money.negative' : 'text.primary' }}
          >
            {formatMoney(data?.totalBalance, currency)}
          </Typography>
        )}

        {isMultiCurrency ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.convertedFrom')}
            </Typography>
            {currencies.map(([code, amount]) => (
              <Chip key={code} size="small" variant="outlined" label={formatMoney(amount, code)} />
            ))}
          </Stack>
        ) : null}
      </Stack>

      {/* KPI row. */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        <StatTile
          label={t('dashboard.incomeThisMonth')}
          value={formatMoney(month?.income, currency)}
          amount={month?.income}
          currency={currency}
          deltaPercent={mom?.incomeChangePercent}
          upIsGood
          loading={loading}
        />
        <StatTile
          label={t('dashboard.expensesThisMonth')}
          value={formatMoney(month?.expenses, currency)}
          amount={month?.expenses}
          currency={currency}
          deltaPercent={mom?.expenseChangePercent}
          upIsGood={false}
          loading={loading}
        />
        <StatTile
          label={t('dashboard.netThisMonth')}
          value={formatMoney(month?.net, currency)}
          amount={month?.net}
          currency={currency}
          deltaCaption={t('dashboard.savingsRate', { percent: formatPercent(month?.savingsRate) })}
          loading={loading}
        />
      </Box>

      {/* Charts. */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
          alignItems: 'stretch',
        }}
      >
        {trends.error ? (
          <ErrorState error={trends.error} title={t('dashboard.trendFailed')} onRetry={() => void trends.refetch()} />
        ) : (
          <IncomeExpenseChart
            points={trends.data?.points ?? []}
            currency={currency}
            loading={trends.isLoading}
          />
        )}

        <CategoryBreakdownChart
          categories={data?.topCategories ?? []}
          currency={currency}
          loading={loading}
        />
      </Box>

      {/* Budgets and goals. */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 2fr) minmax(0, 1fr)' },
          alignItems: 'stretch',
        }}
      >
        <BudgetMeters budgets={data?.budgets ?? []} currency={currency} loading={loading} />
        <GoalProgress goals={data?.goals ?? []} currency={currency} />
      </Box>

      {/* Ledger and schedule. */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 2fr) minmax(0, 1fr)' },
          alignItems: 'stretch',
        }}
      >
        <RecentTransactions transactions={data?.recentTransactions ?? []} loading={loading} />
        <UpcomingBills bills={data?.upcomingBills ?? []} />
      </Box>
    </Stack>
  );
}
