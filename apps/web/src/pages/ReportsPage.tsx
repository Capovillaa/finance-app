import { DownloadIcon } from '../icons';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import { useListAccountsQuery } from '../api/endpoints/accounts';
import { useListCategoriesQuery } from '../api/endpoints/categories';
import {
  monthAnchor,
  useExportStatementCsvMutation,
  useGetStatementQuery,
  useGetYearOverYearQuery,
} from '../api/endpoints/reports';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import StatementAccounts from '../features/reports/StatementAccounts';
import StatementBudgets from '../features/reports/StatementBudgets';
import StatementCategories from '../features/reports/StatementCategories';
import StatementSummary from '../features/reports/StatementSummary';
import TransactionExportPanel from '../features/reports/TransactionExportPanel';
import YearOverYearChart from '../features/reports/YearOverYearChart';
import YearOverYearTable from '../features/reports/YearOverYearTable';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { downloadText } from '../lib/download';
import { todayIso } from '../lib/format';
import { useTranslation } from 'react-i18next';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR - index);

/**
 * Reports.
 *
 * Two questions, one screen: "what happened in this month" (a statement that
 * closes, with balances at both ends) and "how does this year compare with
 * last" — plus the CSV exports, which are what a statement is usually wanted
 * for in the first place.
 *
 * The month and year pickers are independent on purpose. Comparing a year with
 * its predecessor while reading a statement from some other month is a normal
 * thing to want, and tying the two selectors together would prevent it for no
 * gain.
 */
export default function ReportsPage(): ReactElement {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [year, setYear] = useState(CURRENT_YEAR);

  const statement = useGetStatementQuery(
    workspace ? { workspaceId: workspace.id, month: monthAnchor(month) } : skipToken,
  );
  const yearOverYear = useGetYearOverYearQuery(workspace ? { workspaceId: workspace.id, year } : skipToken);
  const accounts = useListAccountsQuery(workspace ? { workspaceId: workspace.id } : skipToken);
  const categories = useListCategoriesQuery(workspace ? { workspaceId: workspace.id } : skipToken);

  const [exportStatement, { isLoading: exporting }] = useExportStatementCsvMutation();

  const currency = statement.data?.statement.baseCurrency ?? workspace?.baseCurrency ?? 'USD';
  const loading = statement.isFetching || workspaceLoading;

  const handleStatementExport = async (): Promise<void> => {
    if (!workspace) return;

    const csv = await exportStatement({ workspaceId: workspace.id, month: monthAnchor(month) })
      .unwrap()
      .catch(() => null);

    if (csv === null) return;
    downloadText(csv, `statement-${month}.csv`);
  };

  if (!workspaceLoading && !workspace) {
    return (
      <EmptyState
        title={t('workspace.none')}
        description={t('workspace.noneDescription')}
      />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('nav.reports')}
        subtitle={workspace?.name}
        actions={
          <>
            <TextField
              label={t('reports.statementMonth')}
              type="month"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              sx={{ minWidth: 180 }}
            />
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => void handleStatementExport()}
              disabled={exporting || !workspace}
            >
              {exporting ? t('common.preparing') : t('reports.statementCsv')}
            </Button>
          </>
        }
      />

      {statement.error ? (
        <ErrorState
          error={statement.error}
          title={t('reports.statementFailed')}
          onRetry={() => void statement.refetch()}
        />
      ) : (
        <>
          <StatementSummary statement={statement.data?.statement} loading={loading} />

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' },
              alignItems: 'start',
            }}
          >
            <StatementCategories
              categories={statement.data?.statement.categories ?? []}
              currency={currency}
              loading={loading}
            />
            <Stack spacing={2}>
              <StatementAccounts accounts={statement.data?.statement.accounts ?? []} loading={loading} />
              <StatementBudgets
                budgets={statement.data?.statement.budgets ?? []}
                currency={currency}
                loading={loading}
              />
            </Stack>
          </Box>
        </>
      )}

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-end"
        flexWrap="wrap"
        gap={1}
        sx={{ pt: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="h2">{t('reports.yearOverYearHeading')}</Typography>
        <TextField
          select
          label={t('reports.year')}
          size="small"
          value={String(year)}
          onChange={(event) => setYear(Number(event.target.value))}
          sx={{ minWidth: 120 }}
        >
          {YEAR_OPTIONS.map((option) => (
            <MenuItem key={option} value={String(option)}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {yearOverYear.error ? (
        <ErrorState
          error={yearOverYear.error}
          title={t('reports.comparisonFailed')}
          onRetry={() => void yearOverYear.refetch()}
        />
      ) : (
        <>
          <YearOverYearChart
            rows={yearOverYear.data?.rows ?? []}
            year={year}
            currency={currency}
            loading={yearOverYear.isFetching}
          />
          <YearOverYearTable
            rows={yearOverYear.data?.rows ?? []}
            year={year}
            currency={currency}
            loading={yearOverYear.isFetching}
          />
        </>
      )}

      {workspace ? (
        <TransactionExportPanel
          workspaceId={workspace.id}
          accounts={accounts.data?.accounts ?? []}
          categories={categories.data?.categories ?? []}
        />
      ) : null}
    </Stack>
  );
}
