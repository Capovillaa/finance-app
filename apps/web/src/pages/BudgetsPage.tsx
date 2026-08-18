import { AddIcon } from '../icons';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import {
  useDeleteBudgetLineMutation,
  useDeleteBudgetMutation,
  useListBudgetsQuery,
  useRolloverBudgetMutation,
} from '../api/endpoints/budgets';
import type { BudgetLineProgress, BudgetProgress } from '../api/types';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import AddLineDialog from '../features/budgets/AddLineDialog';
import BudgetCard from '../features/budgets/BudgetCard';
import BudgetFormDialog from '../features/budgets/BudgetFormDialog';
import BudgetSettingsDialog from '../features/budgets/BudgetSettingsDialog';
import ReviseLineDialog from '../features/budgets/ReviseLineDialog';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { canEdit } from '../lib/permissions';
import { useTranslation } from 'react-i18next';

interface LineTarget {
  budget: BudgetProgress;
  line: BudgetLineProgress;
}

export default function BudgetsPage(): ReactElement {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<BudgetProgress | undefined>(undefined);
  const [addLineFor, setAddLineFor] = useState<BudgetProgress | undefined>(undefined);
  const [reviseTarget, setReviseTarget] = useState<LineTarget | undefined>(undefined);
  const [deleteLineTarget, setDeleteLineTarget] = useState<LineTarget | undefined>(undefined);
  const [deleteBudget, setDeleteBudget] = useState<BudgetProgress | undefined>(undefined);

  const { data, error, isLoading, refetch } = useListBudgetsQuery(
    workspace ? { workspaceId: workspace.id, includeInactive } : skipToken,
  );
  const [rolloverBudget] = useRolloverBudgetMutation();
  const [runDeleteBudget, { isLoading: deletingBudget }] = useDeleteBudgetMutation();
  const [runDeleteLine, { isLoading: deletingLine }] = useDeleteBudgetLineMutation();

  const loading = isLoading || workspaceLoading;
  const budgets = data?.budgets ?? [];
  const role = workspace?.role;

  const handleDeleteBudget = async (): Promise<void> => {
    if (!workspace || !deleteBudget) return;
    const ok = await runDeleteBudget({ workspaceId: workspace.id, id: deleteBudget.id })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) {
      setDeleteBudget(undefined);
      showToast({ message: t('budgets.deletedToast'), severity: 'success' });
    } else {
      showToast({ message: t('budgets.deleteFailedToast'), severity: 'error' });
    }
  };

  const handleDeleteLine = async (): Promise<void> => {
    if (!workspace || !deleteLineTarget) return;
    const ok = await runDeleteLine({ workspaceId: workspace.id, id: deleteLineTarget.budget.id, lineId: deleteLineTarget.line.id })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) {
      setDeleteLineTarget(undefined);
      showToast({ message: t('budgets.lineDeletedToast'), severity: 'success' });
    } else {
      showToast({ message: t('budgets.lineDeleteFailedToast'), severity: 'error' });
    }
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
        title={t('nav.budgets')}
        subtitle={workspace?.name}
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
              label={<Typography variant="body2">{t('budgets.showInactive')}</Typography>}
            />
            {canEdit(role) ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
                {t('budgets.create')}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <ErrorState error={error} title={t('budgets.loadFailed')} onRetry={() => void refetch()} />
      ) : loading ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' } }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" height={260} />
          ))}
        </Box>
      ) : budgets.length === 0 ? (
        <EmptyState
          title={t('budgets.emptyTitle')}
          description={t('budgets.emptyDescription')}
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' } }}>
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              role={role}
              onSettings={() => setSettingsFor(budget)}
              onAddLine={() => setAddLineFor(budget)}
              onRollover={() => {
                if (workspace) void rolloverBudget({ workspaceId: workspace.id, id: budget.id });
              }}
              onDelete={() => setDeleteBudget(budget)}
              onReviseLine={(line) => setReviseTarget({ budget, line })}
              onDeleteLine={(line) => setDeleteLineTarget({ budget, line })}
            />
          ))}
        </Box>
      )}

      {workspace ? (
        <>
          <BudgetFormDialog
            open={createOpen}
            workspaceId={workspace.id}
            currency={workspace.baseCurrency}
            onClose={() => setCreateOpen(false)}
          />
          <BudgetSettingsDialog
            open={Boolean(settingsFor)}
            workspaceId={workspace.id}
            budget={settingsFor}
            onClose={() => setSettingsFor(undefined)}
          />
          <AddLineDialog
            open={Boolean(addLineFor)}
            workspaceId={workspace.id}
            budgetId={addLineFor?.id ?? ''}
            existingCategoryIds={addLineFor?.lines.map((l) => l.categoryId) ?? []}
            onClose={() => setAddLineFor(undefined)}
          />
          <ReviseLineDialog
            open={Boolean(reviseTarget)}
            workspaceId={workspace.id}
            budgetId={reviseTarget?.budget.id ?? ''}
            line={reviseTarget?.line}
            onClose={() => setReviseTarget(undefined)}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteBudget)}
        title={t('budgets.deleteTitle')}
        description={`Delete "${deleteBudget?.name}"? This cannot be undone.`}
        confirmLabel={t('common.delete')}
        destructive
        loading={deletingBudget}
        onConfirm={() => void handleDeleteBudget()}
        onCancel={() => setDeleteBudget(undefined)}
      />

      <ConfirmDialog
        open={Boolean(deleteLineTarget)}
        title={t('budgets.removeLineTitle')}
        description={`Remove "${deleteLineTarget?.line.categoryName}" from this budget?`}
        confirmLabel={t('common.remove')}
        destructive
        loading={deletingLine}
        onConfirm={() => void handleDeleteLine()}
        onCancel={() => setDeleteLineTarget(undefined)}
      />
    </Stack>
  );
}
