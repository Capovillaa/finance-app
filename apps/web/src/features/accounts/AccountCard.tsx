import { ArchiveIcon, DeleteIcon, EditIcon, MoreVertIcon, UnarchiveIcon } from '../../icons';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useState, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Account, WorkspaceRole } from '../../api/types';
import { formatMoney, isNegative } from '../../lib/format';
import { canAdminister, canEdit } from '../../lib/permissions';
import { FONT_MONO } from '../../theme';
import { ACCOUNT_TYPE_LABEL_KEYS } from './accountSchemas';
import { ACCOUNT_TYPE_ICON } from './accountTypeIcon';

interface AccountCardProps {
  account: Account;
  role: WorkspaceRole | undefined;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

/**
 * One account, as a card.
 *
 * Accounts keep the card form rather than becoming statement lines because each
 * one carries an identity — a type, a colour, an institution — that a single
 * line has nowhere to put. The account's own colour runs down the left edge as
 * the same spine the ledger uses, so the two forms still read as one system,
 * and the balance is set in the tabular face like every other figure in the app.
 */
export default function AccountCard({ account, role, onEdit, onToggleArchive, onDelete }: AccountCardProps): ReactElement {
  const { t } = useTranslation();
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const Icon = ACCOUNT_TYPE_ICON[account.type];
  const color = account.color || theme.palette.primary.main;
  const negative = isNegative(account.currentBalance);

  return (
    <Card
      sx={{
        opacity: account.isArchived ? 0.62 : 1,
        borderLeft: '3px solid',
        borderLeftColor: color,
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(color, 0.14),
              flexShrink: 0,
            }}
          >
            <Icon sx={{ color, fontSize: 19 }} />
          </Box>

          <Stack spacing={0.25} sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="h3" noWrap>
              {account.name}
            </Typography>
            <Typography variant="eyebrow" color="text.secondary" noWrap component="div">
              {account.institution ?? t(ACCOUNT_TYPE_LABEL_KEYS[account.type])}
            </Typography>
          </Stack>

          {canEdit(role) ? (
            <>
              <IconButton
                size="small"
                onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
                aria-label={t('accounts.actionsFor', { name: account.name })}
                aria-haspopup="menu"
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
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
                    onToggleArchive();
                  }}
                >
                  <ListItemIcon>
                    {account.isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText>{account.isArchived ? t('accounts.unarchive') : t('accounts.archive')}</ListItemText>
                </MenuItem>
                {canAdminister(role) ? (
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
                ) : null}
              </Menu>
            </>
          ) : null}
        </Stack>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="baseline"
          gap={1}
          sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}
        >
          <Typography
            component="p"
            sx={{
              fontFamily: FONT_MONO,
              fontSize: '1.375rem',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              color: negative ? 'money.negative' : 'text.primary',
            }}
          >
            {formatMoney(account.currentBalance, account.currency)}
          </Typography>
          <Chip label={account.currency} size="small" variant="outlined" />
        </Stack>

        {account.creditLimit ? (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
            {t('accounts.limitAvailable', {
              limit: formatMoney(account.creditLimit, account.currency),
              available: formatMoney(account.availableBalance, account.currency),
            })}
          </Typography>
        ) : null}

        {account.isArchived ? <Chip label={t('accounts.archived')} size="small" sx={{ mt: 1.25 }} /> : null}
      </CardContent>
    </Card>
  );
}
