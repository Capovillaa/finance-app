import { CheckIcon, DeleteIcon, EditIcon, NotesIcon, SwapHorizIcon, UndoIcon } from '../../icons';
import Checkbox from '@mui/material/Checkbox';
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
  /** Ids currently ticked for a bulk action. Selection is hidden for a viewer. */
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onOpen: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onConfirm: (transaction: Transaction) => void;
  onRestore: (transaction: Transaction) => void;
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
 *
 * A row can be in one of three shapes. An ordinary row offers edit and delete;
 * a `scheduled` one also offers "mark as paid", because a bill the worker
 * materialised ahead of time is the commonest thing to act on; and a
 * soft-deleted one — visible only when the filter bar asks for it — offers
 * nothing but restore, since editing a deleted row would be a way to lose it.
 */
export default function TransactionLedger({
  transactions,
  loading,
  role,
  selectedIds,
  onToggleSelect,
  onOpen,
  onEdit,
  onDelete,
  onConfirm,
  onRestore,
}: TransactionLedgerProps): ReactElement {
  const { t } = useTranslation();
  const editable = canEdit(role);

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
        const isDeleted = transaction.deletedAt !== null;
        const state = TRANSACTION_TONE[transaction.status];
        const context = [transaction.merchant, transaction.accountName].filter(Boolean).join(' · ');

        return (
          <LedgerRow
            key={transaction.id}
            /*
             * A deleted row cannot take part in a bulk change, but it still
             * reserves the column: whether the ledger shows checkboxes is a
             * property of the list, not of the row. Dropping the box for one
             * row shifts that whole line — date, description and figure — left
             * of every other, and a ledger whose amounts do not stack into one
             * column has lost the thing it is for. Hidden rather than absent,
             * so the width is the checkbox's own and cannot drift from it.
             */
            selection={
              editable ? (
                <Checkbox
                  size="small"
                  checked={!isDeleted && selectedIds.includes(transaction.id)}
                  onChange={() => onToggleSelect(transaction.id)}
                  disabled={isDeleted}
                  sx={isDeleted ? { visibility: 'hidden' } : undefined}
                  inputProps={{
                    'aria-label': t('transactions.selectFor', { description: transaction.description }),
                  }}
                />
              ) : undefined
            }
            lead={formatDateShort(transaction.occurredOn)}
            primary={
              <Typography
                component="span"
                sx={{ textDecoration: isDeleted ? 'line-through' : 'none', color: isDeleted ? 'text.disabled' : 'inherit' }}
              >
                {isTransfer ? (
                  <SwapHorizIcon
                    sx={{ fontSize: 15, verticalAlign: '-3px', mr: 0.5, color: 'text.disabled' }}
                  />
                ) : null}
                {transaction.description}
              </Typography>
            }
            onPrimaryClick={isDeleted ? undefined : () => onOpen(transaction)}
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
            meta={
              isDeleted ? (
                <Chip label={t('transactions.deleted')} size="small" variant="outlined" sx={{ height: 19 }} />
              ) : (
                (transaction.categoryName ?? t('common.uncategorised'))
              )
            }
            amount={formatMoney(transaction.amount, transaction.currency)}
            amountTone={isDeleted ? 'neutral' : isNegative(transaction.amount) ? 'negative' : 'positive'}
            tone={isDeleted ? 'none' : state.tone}
            toneLabel={t(state.label)}
            actions={
              <Stack direction="row" spacing={0}>
                {isDeleted ? (
                  editable ? (
                    <Tooltip title={t('transactions.restore')}>
                      <IconButton
                        size="small"
                        onClick={() => onRestore(transaction)}
                        aria-label={t('transactions.restoreFor', { description: transaction.description })}
                      >
                        <UndoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : null
                ) : (
                  <>
                    {/* Always present: details are readable by a viewer, who has
                        no edit controls at all. */}
                    <Tooltip title={t('transactions.detailsTooltip')}>
                      <IconButton
                        size="small"
                        onClick={() => onOpen(transaction)}
                        aria-label={t('transactions.openDetailsFor', { description: transaction.description })}
                      >
                        <NotesIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    {editable ? (
                      <>
                        {transaction.status === 'scheduled' ? (
                          <Tooltip title={t('transactions.confirm')}>
                            <IconButton
                              size="small"
                              onClick={() => onConfirm(transaction)}
                              aria-label={t('transactions.confirmFor', { description: transaction.description })}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
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
                  </>
                )}
              </Stack>
            }
          />
        );
      })}
    </LedgerList>
  );
}
