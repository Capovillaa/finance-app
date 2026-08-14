import { AddIcon } from '../icons';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import { useDeleteGoalMutation, useListGoalsQuery, useUpdateGoalMutation } from '../api/endpoints/goals';
import type { Goal, GoalStatus } from '../api/types';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import ContributionsDialog from '../features/goals/ContributionsDialog';
import GoalCard from '../features/goals/GoalCard';
import GoalFormDialog from '../features/goals/GoalFormDialog';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { canEdit } from '../lib/permissions';
import { useTranslation } from 'react-i18next';

/** Catalogue keys: this table is evaluated once, at import. */
const STATUS_FILTERS: { value: GoalStatus | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'common.all' },
  { value: 'active', labelKey: 'goals.status.active' },
  { value: 'achieved', labelKey: 'goals.status.achieved' },
  { value: 'paused', labelKey: 'goals.status.paused' },
  { value: 'cancelled', labelKey: 'goals.status.cancelled' },
];

export default function GoalsPage(): ReactElement {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'all'>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | undefined>(undefined);
  const [contributingTo, setContributingTo] = useState<Goal | undefined>(undefined);
  const [deleting, setDeleting] = useState<Goal | undefined>(undefined);

  const { data, error, isLoading, refetch } = useListGoalsQuery(
    workspace ? { workspaceId: workspace.id, status: statusFilter === 'all' ? undefined : statusFilter } : skipToken,
  );
  const [updateGoal] = useUpdateGoalMutation();
  const [deleteGoal, { isLoading: deletingInFlight }] = useDeleteGoalMutation();

  const loading = isLoading || workspaceLoading;
  const goals = data?.goals ?? [];
  const role = workspace?.role;

  const handleDelete = async (): Promise<void> => {
    if (!workspace || !deleting) return;
    const ok = await deleteGoal({ workspaceId: workspace.id, id: deleting.id })
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
        title={t('nav.goals')}
        subtitle={workspace?.name}
        actions={
          <>
            <TextField
              select
              size="small"
              label={t('common.status')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as GoalStatus | 'all')}
              sx={{ minWidth: 140 }}
            >
              {STATUS_FILTERS.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {t(f.labelKey)}
                </MenuItem>
              ))}
            </TextField>
            {canEdit(role) ? (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                {t('goals.create')}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <ErrorState error={error} title={t('goals.loadFailed')} onRetry={() => void refetch()} />
      ) : loading ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={190} />
          ))}
        </Box>
      ) : goals.length === 0 ? (
        <EmptyState
          title={t('goals.emptyTitle')}
          description={t('goals.emptyDescription')}
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              role={role}
              onEdit={() => {
                setEditing(goal);
                setFormOpen(true);
              }}
              onContribute={() => setContributingTo(goal)}
              onSetStatus={(status) => {
                if (workspace) void updateGoal({ workspaceId: workspace.id, id: goal.id, body: { status } });
              }}
              onDelete={() => setDeleting(goal)}
            />
          ))}
        </Box>
      )}

      {workspace ? (
        <>
          <GoalFormDialog
            open={formOpen}
            workspaceId={workspace.id}
            currency={workspace.baseCurrency}
            goal={editing}
            onClose={() => setFormOpen(false)}
          />
          <ContributionsDialog
            open={Boolean(contributingTo)}
            workspaceId={workspace.id}
            goalId={contributingTo?.id}
            role={role}
            onClose={() => setContributingTo(undefined)}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('goals.deleteTitle')}
        description={`Delete "${deleting?.name}"? Its contribution history will be lost. This cannot be undone.`}
        confirmLabel={t('common.delete')}
        destructive
        loading={deletingInFlight}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(undefined)}
      />
    </Stack>
  );
}
