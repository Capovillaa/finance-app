import { AutoModeIcon, DeleteIcon, EditIcon, MoreVertIcon, PauseIcon, PlayArrowIcon, PlaylistAddCheckIcon } from '../../icons';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, type MouseEvent, type ReactElement } from 'react';
import type { RecurringTransaction, WorkspaceRole } from '../../api/types';
import LedgerRow, { type LedgerTone } from '../../components/LedgerRow';
import { formatDateShort, formatMoney, isNegative } from '../../lib/format';
import { canEdit } from '../../lib/permissions';
import { useTranslation } from 'react-i18next';

interface RecurringRowProps {
  recurring: RecurringTransaction;
  role: WorkspaceRole | undefined;
  onEdit: () => void;
  onToggleActive: () => void;
  onMaterialize: () => void;
  onDelete: () => void;
}

/**
 * One schedule, as a statement line.
 *
 * A recurring transaction is a transaction that has not happened yet, so it is
 * drawn exactly like one: next due date on the left, signed amount on the
 * right, and a spine stating whether it is paused or posting itself. That
 * equivalence is the point — the same row shape here and on the ledger is what
 * makes "this will become that" obvious without saying it.
 */
export default function RecurringRow({
  recurring,
  role,
  onEdit,
  onToggleActive,
  onMaterialize,
  onDelete,
}: RecurringRowProps): ReactElement {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const editable = canEdit(role);
  // `recurring.amount` is already signed by the server (negative for expenses) —
  // it is the stored ledger amount, not the positive magnitude the create/update
  // input takes.
  const signedAmount = recurring.amount;

  const tone: LedgerTone = !recurring.isActive ? 'neutral' : recurring.autoPost ? 'accent' : 'none';
  const toneLabel = !recurring.isActive ? t('recurring.paused') : recurring.autoPost ? t('recurring.postsAutomatically') : undefined;

  return (
    <LedgerRow
      lead={recurring.nextOccurrenceOn ? formatDateShort(recurring.nextOccurrenceOn) : '—'}
      primary={recurring.name}
      secondary={
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
          <Typography variant="caption" color="text.secondary">
            {recurring.summary}
          </Typography>
          {recurring.autoPost ? (
            <Chip label={t('recurring.autoPosts')} size="small" icon={<AutoModeIcon />} sx={{ height: 19 }} />
          ) : null}
          {!recurring.isActive ? <Chip label={t('recurring.paused')} size="small" sx={{ height: 19 }} /> : null}
        </Stack>
      }
      meta={[recurring.accountName, recurring.categoryName].filter(Boolean).join(' · ') || undefined}
      amount={formatMoney(signedAmount, recurring.currency)}
      amountTone={isNegative(signedAmount) ? 'negative' : 'positive'}
      amountCaption={recurring.nextOccurrenceOn ? undefined : t('recurring.noMoreOccurrences')}
      tone={tone}
      toneLabel={toneLabel}
      actions={
        editable ? (
          <>
            <IconButton
              size="small"
              onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
              aria-label={t('recurring.actionsFor', { name: recurring.name })}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  onMaterialize();
                }}
              >
                <ListItemIcon>
                  <PlaylistAddCheckIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('recurring.generateDue')}</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  onEdit();
                }}
              >
                <ListItemIcon>
                  <EditIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('common.edit')}</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  onToggleActive();
                }}
              >
                <ListItemIcon>
                  {recurring.isActive ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText>{recurring.isActive ? t('common.pause') : t('common.resume')}</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  onDelete();
                }}
                sx={{ color: 'error.main' }}
              >
                <ListItemIcon>
                  <DeleteIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText>{t('common.delete')}</ListItemText>
              </MenuItem>
            </Menu>
          </>
        ) : null
      }
    />
  );
}
