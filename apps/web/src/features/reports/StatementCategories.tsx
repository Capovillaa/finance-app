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
import type { CategoryBreakdownItem } from '../../api/types';
import Amount from '../../components/Amount';
import Panel from '../../components/Panel';
import { useChartTokens } from '../../lib/chartTokens';
import { absMoney, formatMoney } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface StatementCategoriesProps {
  categories: CategoryBreakdownItem[];
  currency: string;
  loading?: boolean;
}

/**
 * Where the month's spending went, as a ranked table.
 *
 * A table rather than a second bar chart: this sits inside a statement, where
 * the reader wants the exact figure per line and a total they can reconcile
 * against, not a shape. The inline bar is a magnitude cue, so it is one flat
 * hue — the same `magnitude` token the dashboard's ranked chart uses — and the
 * percentage is printed beside it, so the bar is never the only encoding.
 */
export default function StatementCategories({
  categories,
  currency,
  loading = false,
}: StatementCategoriesProps): ReactElement {
  const { t } = useTranslation();
  const tokens = useChartTokens();

  // The API returns spending signed (negative) and already sorted by magnitude;
  // the sign is dropped for display because every row here is spending.
  const rows = categories.filter((item) => item.percentOfTotal > 0 || item.total !== '0.0000');

  return (
    <Panel title={t('reports.spendingByCategory')} fullHeight>
      <Stack spacing={2}>
        {loading ? (
          <Stack spacing={1}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={36} />
            ))}
          </Stack>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('reports.noSpending')}
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('common.category')}</TableCell>
                  <TableCell>{t('reports.share')}</TableCell>
                  <TableCell align="right">{t('nav.transactions')}</TableCell>
                  <TableCell align="right">{t('common.total')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.categoryId ?? item.categoryName}>
                    <TableCell>{item.categoryName}</TableCell>
                    <TableCell sx={{ width: '38%' }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            flexGrow: 1,
                            height: 8,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            sx={{
                              width: `${Math.min(100, Math.max(0, item.percentOfTotal))}%`,
                              height: '100%',
                              borderRadius: 1,
                              bgcolor: tokens.magnitude,
                            }}
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ minWidth: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {item.percentOfTotal.toFixed(1)}%
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Amount tone="neutral">{item.transactionCount}</Amount>
                    </TableCell>
                    <TableCell align="right">
                      <Amount strong>{formatMoney(absMoney(item.total), currency)}</Amount>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Stack>
    </Panel>
  );
}
