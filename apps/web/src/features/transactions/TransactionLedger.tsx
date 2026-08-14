import { DeleteIcon, EditIcon, NotesIcon, SwapHorizIcon } from '../../icons';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import type { Transaction, WorkspaceRole } from '../../api/types';
import LedgerList from '../../components/LedgerList';
import LedgerRow from '../../components/LedgerRow';
import { formatDateShort, formatMoney, isNegative } from '../../lib/format';
import { canEdit } from '../../lib/permissions';
import { TRANSACTION_TONE } from '../../lib/tone';
import { useTranslation } from 'react-i18next';

interface TransactionLedgerProps {
  transactions: Transaction[];
  loading: boolean;
  role: WorkspaceRole | undefined;
  onOpen: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

/**
 * The ledger itself: one statement line per transaction.
 *
 * This was a `<table>` until the redesign. A table gave every column a header
 * and equal weight, which is wrong for this data — the description and the
 * amount are what anybody scans for, and the account, the category and the
 * status are context. As statement lines the scan is down two columns instead
 * of across seven, and the row's status becomes a 3px spine on the left rather
 * than a chip loud enough to outweigh the money beside it.
 */
export default function TransactionLedger({
  transactions,
  loading,
  role,
  onOpen,
  onEdit,
  onDelete,
}: TransactionLedgerProps): ReactElement {
  const { t } = useTranslation();
  return (
    <LedgerList
      loading={loading}
      loadingRows={8}
      isEmpty={transactions.length === 0}
      emptyMessage={t('transactions.noneMatch')}
      label={t('nav.transactions')}
    >
      {transactions.map((transaction) => {
        const isTransfer = transaction.type === 'transfer';
        const state = TRANSACTION_TONE[transaction.status];
        const context = [transaction.merchant, transaction.accountName].filter(Boolean).join(' · ');

        return (
          <LedgerRow
            key={transaction.id}
            lead={formatDateShort(transaction.occurredOn)}
            primary={
              <>
                {isTransfer ? (
                  <SwapHorizIcon
                    sx={{ fontSize: 15, verticalAlign: '-3px', mr: 0.5, color: 'text.disabled' }}
                  />
                ) : null}
                {transaction.description}
              </>
            }
            onPrimaryClick={() => onOpen(transaction)}
            primaryLabel={t('transactions.openDetailsFor', { description: transaction.description })}
            secondary={
              context || transaction.tags?.length ? (
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                  {context ? (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {context}
                    </Typography>
                  ) : null}
                  {transaction.tags?.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 19 }} />
                  ))}
                </Stack>
              ) : undefined
            }
            meta={transaction.categoryName ?? t('common.uncategorised')}
            amount={formatMoney(transaction.amount, transaction.currency)}
            amountTone={isNegative(transaction.amount) ? 'negative' : 'positive'}
            tone={state.tone}
            toneLabel={t(state.label)}
            actions={
              <Stack direction="row" spacing={0}>
                {/* Always present: details are readable by a viewer, who has no
                    edit controls at all. */}
                <Tooltip title={t('transactions.detailsTooltip')}>
                  <IconButton
                    size="small"
                    onClick={() => onOpen(transaction)}
                    aria-label={t('transactions.openDetailsFor', { description: transaction.description })}
                  >
                    <NotesIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                {canEdit(role) ? (
                  <>
                    <Tooltip title={isTransfer ? t('transactions.editTransferTooltip') : t('common.edit')}>
                      <IconButton size="small" onClick={() => onEdit(transaction)} aria-label={t('common.edit')}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={isTransfer ? t('transactions.deleteTransferTooltip') : t('common.delete')}>
                      <IconButton size="small" onClick={() => onDelete(transaction)} aria-label={t('common.delete')}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : null}
              </Stack>
            }
          />
        );
      })}
    </LedgerList>
  );
}
