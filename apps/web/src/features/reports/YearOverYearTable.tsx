import { ArrowDownwardIcon, ArrowUpwardIcon, RemoveIcon } from '../../icons';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import type { YearOverYearRow } from '../../api/types';
import Amount from '../../components/Amount';
import Panel from '../../components/Panel';
import { formatMoney, formatSignedPercent } from '../../lib/format';
import { monthName } from './YearOverYearChart';
import { useTranslation } from 'react-i18next';

interface YearOverYearTableProps {
  rows: YearOverYearRow[];
  year: number;
  currency: string;
  loading?: boolean;
}

/**
 * The same comparison as the chart, in figures.
 *
 * The chart plots expenses only — two series is already the readable limit for
 * grouped bars, and four would be a thicket. Income belongs in the comparison
 * all the same, so it lives here, where a column costs nothing. This is also
 * the table view that keeps the chart's meaning reachable without colour.
 */
export default function YearOverYearTable({
  rows,
  year,
  currency,
  loading = false,
}: YearOverYearTableProps): ReactElement {
  const { t } = useTranslation();
  /**
   * Months that have not happened yet.
   *
   * The server returns a full twelve rows for the current year, so a month
   * still in the future has zero spending against a real figure from last year
   * — arithmetically a 100% fall, and rendered as one it reads as a triumph
   * rather than as an empty month. The comparison is withheld until there is
   * something to compare.
   */
  const now = new Date();
  const isFuture = (month: string): boolean =>
    year > now.getFullYear() || (year === now.getFullYear() && Number(month) > now.getMonth() + 1);

  return (
    <Panel title={t('reports.monthByMonth')}>
      {loading ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={32} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('reports.noActivityIn', { year })}
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('reports.month')}</TableCell>
                <TableCell align="right">{t('reports.incomeYear', { year })}</TableCell>
                <TableCell align="right">{t('reports.incomeYear', { year: year - 1 })}</TableCell>
                <TableCell align="right">{t('reports.expensesYear', { year })}</TableCell>
                <TableCell align="right">{t('reports.expensesYear', { year: year - 1 })}</TableCell>
                <TableCell align="right">{t('reports.change')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.month}>
                  <TableCell>{monthName(row.month)}</TableCell>
                  <TableCell align="right">
                    <Amount>{formatMoney(row.currentIncome, currency)}</Amount>
                  </TableCell>
                  <TableCell align="right">
                    <Amount tone="neutral">{formatMoney(row.previousIncome, currency)}</Amount>
                  </TableCell>
                  <TableCell align="right">
                    <Amount>{formatMoney(row.currentExpenses, currency)}</Amount>
                  </TableCell>
                  <TableCell align="right">
                    <Amount tone="neutral">{formatMoney(row.previousExpenses, currency)}</Amount>
                  </TableCell>
                  <TableCell align="right">
                    <ExpenseChange
                      percent={row.expenseChangePercent}
                      comparable={Number(row.previousExpenses) > 0 && !isFuture(row.month)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Panel>
  );
}

/**
 * Change in spending against the same month last year.
 *
 * Spending more is the bad direction, so an increase is red and a fall is
 * green — the reverse of an income delta. The arrow says the same thing as the
 * sign, so the colour is never carrying the meaning alone.
 *
 * A dash, not a number, whenever the comparison would be meaningless: no
 * spending in the baseline month (the server reports 0, which would read as "no
 * change" when the truth is "nothing to compare against"), or a month that has
 * not happened yet.
 */
function ExpenseChange({ percent, comparable }: { percent: number; comparable: boolean }): ReactElement {
  if (!comparable) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  const flat = percent === 0;
  const rising = percent > 0;
  const Icon = flat ? RemoveIcon : rising ? ArrowUpwardIcon : ArrowDownwardIcon;
  const color = flat ? 'text.secondary' : rising ? 'money.negative' : 'money.positive';

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
      <Icon sx={{ fontSize: 15, color }} />
      <Typography variant="amount" sx={{ color, fontWeight: 600 }}>
        {formatSignedPercent(percent)}
      </Typography>
    </Stack>
  );
}
