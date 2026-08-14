import { AddIcon } from '../icons';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import {
  useDeleteRecurringMutation,
  useListRecurringQuery,
  useMaterializeRecurringMutation,
  useUpdateRecurringMutation,
} from '../api/endpoints/recurring';
import type { RecurringTransaction } from '../api/types';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LedgerList from '../components/LedgerList';
import PageHeader from '../components/PageHeader';
import RecurringRow from '../features/recurring/RecurringRow';
import RecurringFormDialog from '../features/recurring/RecurringFormDialog';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { canEdit } from '../lib/permissions';
import { useTranslation } from 'react-i18next';

export default function RecurringPage(): ReactElement {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | undefined>(undefined);
  const [deleting, setDeleting] = useState<RecurringTransaction | undefined>(undefined);

  const { data, error, isLoading, refetch } = useListRecurringQuery(
    workspace ? { workspaceId: workspace.id, includeInactive } : skipToken,
  );
  const [updateRecurring] = useUpdateRecurringMutation();
  const [materialize] = useMaterializeRecurringMutation();
  const [deleteRecurring, { isLoading: deletingInFlight }] = useDeleteRecurringMutation();

  const loading = isLoading || workspaceLoading;
  const items = data?.recurring ?? [];
  const role = workspace?.role;

  const handleDelete = async (): Promise<void> => {
    if (!workspace || !deleting) return;
    const ok = await deleteRecurring({ workspaceId: workspace.id, id: deleting.id })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) setDeleting(undefined);
  };

  if (!workspaceLoading && !workspace) {
    return (
      <EmptyState
        title={t('workspace.none')}
        description={t('workspace.noneDescription')}
      />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('nav.recurring')}
        subtitle={`${workspace?.name ?? ''} · scheduled income and bills. Generated transactions appear on the Transactions page.`}
        actions={
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">{t('recurring.showPaused')}</Typography>}
            />
            {canEdit(role) ? (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                {t('recurring.create')}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <ErrorState error={error} title={t('recurring.loadFailed')} onRetry={() => void refetch()} />
      ) : (
        <Card>
          <LedgerList
            loading={loading}
            loadingRows={4}
            isEmpty={items.length === 0}
            emptyMessage={t('recurring.emptyMessage')}
            label={t('recurring.listLabel')}
          >
            {items.map((item) => (
              <RecurringRow
                key={item.id}
                recurring={item}
                role={role}
                onEdit={() => {
                  setEditing(item);
                  setFormOpen(true);
                }}
                onToggleActive={() => {
                  if (workspace)
                    void updateRecurring({ workspaceId: workspace.id, id: item.id, body: { isActive: !item.isActive } });
                }}
                onMaterialize={() => {
                  if (workspace) void materialize({ workspaceId: workspace.id, id: item.id });
                }}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </LedgerList>
        </Card>
      )}

      {workspace ? (
        <RecurringFormDialog
          open={formOpen}
          workspaceId={workspace.id}
          recurring={editing}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('recurring.deleteTitle')}
        description={`Delete "${deleting?.name}"? Future occurrences will stop. Transactions already created are not affected.`}
        confirmLabel={t('common.delete')}
        destructive
        loading={deletingInFlight}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(undefined)}
      />
    </Stack>
  );
}
