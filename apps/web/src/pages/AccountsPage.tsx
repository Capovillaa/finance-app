import { AddIcon } from '../icons';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useDeleteAccountMutation,
  useListAccountsQuery,
  useUpdateAccountMutation,
} from '../api/endpoints/accounts';
import type { Account } from '../api/types';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import AccountCard from '../features/accounts/AccountCard';
import AccountFormDialog from '../features/accounts/AccountFormDialog';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { formatMoney } from '../lib/format';
import { canEdit } from '../lib/permissions';

export default function AccountsPage(): ReactElement {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>(undefined);
  const [deleting, setDeleting] = useState<Account | undefined>(undefined);

  const { data, error, isLoading, refetch } = useListAccountsQuery(
    workspace ? { workspaceId: workspace.id, includeArchived } : skipToken,
  );
  const [updateAccount] = useUpdateAccountMutation();
  const [deleteAccount, { isLoading: deletingInFlight }] = useDeleteAccountMutation();

  const loading = isLoading || workspaceLoading;
  const accounts = data?.accounts ?? [];
  const currencies = Object.entries(data?.balanceByCurrency ?? {});
  const role = workspace?.role;

  const openCreate = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (account: Account): void => {
    setEditing(account);
    setFormOpen(true);
  };

  const handleToggleArchive = async (account: Account): Promise<void> => {
    if (!workspace) return;
    await updateAccount({
      workspaceId: workspace.id,
      id: account.id,
      body: { isArchived: !account.isArchived },
    })
      .unwrap()
      .catch(() => null);
  };

  const handleDelete = async (): Promise<void> => {
    if (!workspace || !deleting) return;
    const result = await deleteAccount({ workspaceId: workspace.id, id: deleting.id })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (result) setDeleting(undefined);
  };

  if (!workspaceLoading && !workspace) {
    return (
      <EmptyState title={t('workspace.none')} description={t('workspace.noneDescription')} />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('nav.accounts')}
        subtitle={
          <>
            {workspace?.name}
            {currencies.length > 0
              ? ` · ${t('accounts.totalSuffix', { total: formatMoney(data?.totalBalance, workspace?.baseCurrency ?? 'USD') })}`
              : ''}
          </>
        }
        actions={
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">{t('accounts.showArchived')}</Typography>}
            />
            {canEdit(role) ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                {t('accounts.add')}
              </Button>
            ) : null}
          </>
        }
      />

      {currencies.length > 1 ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {t('common.convertedFrom')}
          </Typography>
          {currencies.map(([code, amount]) => (
            <Chip key={code} size="small" variant="outlined" label={formatMoney(amount, code)} />
          ))}
        </Stack>
      ) : null}

      {error ? (
        <ErrorState error={error} title={t('accounts.loadFailed')} onRetry={() => void refetch()} />
      ) : loading ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={150} />
          ))}
        </Box>
      ) : accounts.length === 0 ? (
        <EmptyState title={t('accounts.emptyTitle')} description={t('accounts.emptyDescription')} />
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              role={role}
              onEdit={() => openEdit(account)}
              onToggleArchive={() => void handleToggleArchive(account)}
              onDelete={() => setDeleting(account)}
            />
          ))}
        </Box>
      )}

      {workspace ? (
        <AccountFormDialog
          open={formOpen}
          workspaceId={workspace.id}
          account={editing}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('accounts.deleteTitle')}
        description={t('accounts.deleteDescription', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        loading={deletingInFlight}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(undefined)}
      />
    </Stack>
  );
}
