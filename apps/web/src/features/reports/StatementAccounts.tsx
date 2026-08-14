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
import type { StatementAccountBalance } from '../../api/types';
import Amount from '../../components/Amount';
import Panel from '../../components/Panel';
import { formatMoney, isNegative } from '../../lib/format';
import { useTranslation } from 'react-i18next';

interface StatementAccountsProps {
  accounts: StatementAccountBalance[];
  loading?: boolean;
}

/**
 * Per-account closing balances.
 *
 * Each row is formatted in the account's *own* currency, not the workspace base
 * — these are real balances on real accounts, and converting them here would
 * invent a precision the statement does not have. The converted total is the
 * headline figure above, which is where the base currency belongs.
 */
export default function StatementAccounts({ accounts, loading = false }: StatementAccountsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Panel title={t('reports.accountBalances')} fullHeight>
      <Stack spacing={2}>
        {loading ? (
          <Stack spacing={1}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={36} />
            ))}
          </Stack>
        ) : accounts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('reports.noAccounts')}
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('common.account')}</TableCell>
                  <TableCell>{t('common.currency')}</TableCell>
                  <TableCell align="right">{t('reports.closingBalance')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>{account.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {account.currency}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Amount strong tone={isNegative(account.closingBalance) ? 'negative' : 'inherit'}>
                        {formatMoney(account.closingBalance, account.currency)}
                      </Amount>
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
