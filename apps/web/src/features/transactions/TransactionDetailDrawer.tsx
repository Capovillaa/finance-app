import { CloseIcon, DeleteIcon, SendIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import {
  useAddCommentMutation,
  useDeleteCommentMutation,
  useGetTransactionQuery,
  useSettleSplitMutation,
} from '../../api/endpoints/transactions';
import type { Transaction, WorkspaceRole } from '../../api/types';
import ErrorState from '../../components/ErrorState';
import { getApiErrorMessage } from '../../lib/apiError';
import { formatDate, formatMoney, formatRelative, isNegative } from '../../lib/format';
import { canAdminister, canEdit } from '../../lib/permissions';
import { FONT_MONO } from '../../theme';
import { useTranslation } from 'react-i18next';

interface TransactionDetailDrawerProps {
  open: boolean;
  workspaceId: string;
  transactionId: string | undefined;
  role: WorkspaceRole | undefined;
  currentUserId: string | undefined;
  onClose: () => void;
  onEditSplits: (transaction: Transaction) => void;
}

/**
 * Everything hanging off one transaction: its tags, who owes what, and the
 * conversation about it.
 *
 * A drawer rather than a dialog because it is a *reading* surface that sits
 * beside the ledger — you open a row, check the split, close it, open the next.
 * A modal would make that sequence feel heavier than it is.
 *
 * Read-only for a viewer, which matches the API: settling a share and posting a
 * comment both need editor, while deleting a comment needs to be its author or
 * an admin.
 */
export default function TransactionDetailDrawer({
  open,
  workspaceId,
  transactionId,
  role,
  currentUserId,
  onClose,
  onEditSplits,
}: TransactionDetailDrawerProps): ReactElement {
  const { t } = useTranslation();
  const detail = useGetTransactionQuery(
    open && transactionId ? { workspaceId, id: transactionId } : skipToken,
  );
  const [settleSplit, settleState] = useSettleSplitMutation();
  const [addComment, addState] = useAddCommentMutation();
  const [deleteComment, deleteState] = useDeleteCommentMutation();
  const [draft, setDraft] = useState('');

  const editable = canEdit(role);
  const transaction = detail.data?.transaction;
  const splits = detail.data?.splits ?? [];
  const comments = detail.data?.comments ?? [];
  const error = settleState.error ?? addState.error ?? deleteState.error;

  const handleComment = async (): Promise<void> => {
    if (!transactionId || !draft.trim()) return;
    const result = await addComment({ workspaceId, id: transactionId, body: draft.trim() })
      .unwrap()
      .catch(() => null);
    if (!result) return;
    setDraft('');
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        // Unlike the permanent nav drawer (themed flat, in `theme.ts`), this
        // one is a temporary reading surface that floats over the ledger —
        // it gets the same glass treatment as a dialog or menu, not the
        // sidebar's opaque background. `backgroundColor` is reset to
        // transparent because the theme's `MuiDrawer` override otherwise
        // paints a solid one underneath the translucent gradient, which
        // would defeat the blur.
        sx: (theme) => ({
          width: { xs: '100%', sm: 460 },
          p: 3,
          backgroundColor: 'transparent',
          backgroundImage: theme.palette.glass.surface,
          borderLeft: `1px solid ${theme.palette.glass.border}`,
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: theme.palette.glass.shadow,
        }),
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography variant="h2">{t('transactions.detailTitle')}</Typography>
          <IconButton onClick={onClose} size="small" aria-label={t('transactions.closeDetails')}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {detail.error ? (
          <ErrorState error={detail.error} title={t('transactions.detailFailed')} onRetry={() => void detail.refetch()} />
        ) : detail.isLoading || !transaction ? (
          <Stack spacing={1.5}>
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={160} />
          </Stack>
        ) : (
          <>
            {error ? <Alert severity="error">{getApiErrorMessage(error)}</Alert> : null}

            {/* --- the row itself --- */}
            <Stack spacing={0.5}>
              <Typography variant="eyebrow" color="text.secondary">
                {formatDate(transaction.occurredOn)} · {transaction.accountName ?? t('transactions.unknownAccount')}
              </Typography>
              <Typography variant="h3">{transaction.description}</Typography>
              <Typography
                component="p"
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '1.75rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  color: isNegative(transaction.amount) ? 'money.negative' : 'money.positive',
                }}
              >
                {formatMoney(transaction.amount, transaction.currency)}
              </Typography>
              {transaction.currency !== undefined && transaction.baseAmount !== transaction.amount ? (
                <Typography variant="caption" color="text.secondary">
                  {t('transactions.recordedAsBase', {
                    amount: formatMoney(transaction.baseAmount, transaction.currency),
                  })}
                </Typography>
              ) : null}
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="outlined" label={transaction.status} />
              <Chip size="small" variant="outlined" label={transaction.categoryName ?? t('common.uncategorised')} />
              {transaction.type === 'transfer' ? <Chip size="small" variant="outlined" label={t('common.transfer')} /> : null}
              {transaction.isReconciled ? <Chip size="small" color="success" variant="outlined" label={t('transactions.reconciled')} /> : null}
            </Stack>

            {transaction.tags?.length ? (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {transaction.tags.map((tag) => (
                  <Chip key={tag} size="small" label={tag} />
                ))}
              </Stack>
            ) : null}

            {transaction.notes ? (
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {transaction.notes}
              </Typography>
            ) : null}

            <Divider />

            {/* --- splits --- */}
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h3">{t('transactions.split')}</Typography>
                {editable && transaction.type !== 'transfer' ? (
                  <Button size="small" onClick={() => onEditSplits(transaction)}>
                    {splits.length > 0 ? t('transactions.editSplit') : t('transactions.splitThis')}
                  </Button>
                ) : null}
              </Stack>

              {splits.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('transactions.notSplit')}
                </Typography>
              ) : (
                splits.map((split) => (
                  <Stack key={split.id} direction="row" spacing={1} alignItems="center">
                    <Tooltip title={split.settledAt ? t('transactions.settled') : t('transactions.markSettled')}>
                      <span>
                        <Checkbox
                          size="small"
                          disabled={!editable || settleState.isLoading}
                          checked={Boolean(split.settledAt)}
                          onChange={(event) =>
                            void settleSplit({
                              workspaceId,
                              id: transaction.id,
                              splitId: split.id,
                              settled: event.target.checked,
                            })
                          }
                          inputProps={{ 'aria-label': t('transactions.settleShare', { name: split.fullName }) }}
                        />
                      </span>
                    </Tooltip>
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      {split.fullName}
                      {split.note ? (
                        <Typography component="span" variant="caption" color="text.secondary">
                          {' '}
                          · {split.note}
                        </Typography>
                      ) : null}
                    </Typography>
                    <Typography
                      variant="amount"
                      sx={{
                        fontWeight: 600,
                        textDecoration: split.settledAt ? 'line-through' : 'none',
                        color: split.settledAt ? 'text.secondary' : 'text.primary',
                      }}
                    >
                      {formatMoney(split.shareAmount, transaction.currency)}
                    </Typography>
                  </Stack>
                ))
              )}
            </Stack>

            <Divider />

            {/* --- comments --- */}
            <Stack spacing={1.5}>
              <Typography variant="h3">{t('transactions.comments')}</Typography>

              {comments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('transactions.noComments')}
                </Typography>
              ) : (
                comments.map((comment) => {
                  const removable = editable && (comment.userId === currentUserId || canAdminister(role));

                  return (
                    <Stack key={comment.id} direction="row" spacing={1.5} alignItems="flex-start">
                      <Avatar src={comment.avatarUrl ?? undefined} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                        {comment.fullName.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ flexGrow: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="baseline">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {comment.fullName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatRelative(comment.createdAt)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {comment.body}
                        </Typography>
                      </Box>
                      {removable ? (
                        <IconButton
                          size="small"
                          aria-label={t('transactions.deleteComment')}
                          disabled={deleteState.isLoading}
                          onClick={() =>
                            void deleteComment({ workspaceId, id: transaction.id, commentId: comment.id })
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      ) : null}
                    </Stack>
                  );
                })
              )}

              {editable ? (
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    maxRows={4}
                    placeholder={t('transactions.addComment')}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    onClick={() => void handleComment()}
                    disabled={addState.isLoading || !draft.trim()}
                    sx={{ minWidth: 0, px: 1.5 }}
                    aria-label={t('transactions.postComment')}
                  >
                    <SendIcon fontSize="small" />
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </>
        )}
      </Stack>
    </Drawer>
  );
}
