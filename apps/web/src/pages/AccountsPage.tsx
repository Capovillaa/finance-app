import { AddIcon } from '../icons';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
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
import { useToast } from '../components/Toast';
import AccountCard from '../features/accounts/AccountCard';
import AccountFormDialog from '../features/accounts/AccountFormDialog';
import ReconcileDialog from '../features/accounts/ReconcileDialog';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { formatMoney } from '../lib/format';
import { canEdit } from '../lib/permissions';

export default function AccountsPage(): ReactElement {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>(undefined);
  const [deleting, setDeleting] = useState<Account | undefined>(undefined);
  const [reconciling, setReconciling] = useState<Account | undefined>(undefined);

  const { data, error, isLoading, refetch } = useListAccountsQuery(
    workspace ? { workspaceId: workspace.id, includeArchived } : skipToken,
  );
  const [updateAccount] = useUpdateAccountMutation();
  const [deleteAccount, { isLoading: deletingInFlight }] = useDeleteAccountMutation();

  const loading = isLoading || workspaceLoading;
  const accounts = data?.accounts ?? [];
  const currencies = Object.entries(data?.balanceByCurrency ?? {});
  const role = workspace?.role;
  const hasArchived = accounts.some((account) => account.isArchived);

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
    if (result) {
      setDeleting(undefined);
      showToast({ message: t('accounts.deletedToast'), severity: 'success' });
    } else {
      showToast({ message: t('accounts.deleteFailedToast'), severity: 'error' });
    }
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
            {/*
              A switch labelled "Show archived" states one of its two states and
              leaves the other implied, so the off position reads as "archived
              accounts are... not shown? hidden? deleted?". Naming both sides
              removes the guess, and a segmented control is the shape this design
              language already uses for a small exclusive choice.
            */}
            <ToggleButtonGroup
              exclusive
              size="small"
              value={includeArchived ? 'all' : 'active'}
              onChange={(_event, next: string | null) => next && setIncludeArchived(next === 'all')}
              aria-label={t('accounts.visibility')}
            >
              <ToggleButton value="active">{t('accounts.activeOnly')}</ToggleButton>
              <ToggleButton value="all">{t('accounts.includeArchived')}</ToggleButton>
            </ToggleButtonGroup>
            {canEdit(role) ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                {t('accounts.add')}
              </Button>
            ) : null}
          </>
        }
      />

      {/*
        Turning the filter on and seeing the page not change is indistinguishable
        from the control being broken. It has an answer — there is nothing
        archived — and the screen is the only place that knows it.
      */}
      {includeArchived && !loading && !error && !hasArchived ? (
        <Alert severity="info">{t('accounts.noArchived')}</Alert>
      ) : null}

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
              onReconcile={() => setReconciling(account)}
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

      {workspace ? (
        <ReconcileDialog
          open={Boolean(reconciling)}
          workspaceId={workspace.id}
          account={reconciling}
          role={role}
          onClose={() => setReconciling(undefined)}
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
