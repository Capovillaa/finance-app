import { AddIcon, DeleteIcon, EditIcon, PlayCircleOutlineIcon } from '../icons';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import { useDeleteAlertRuleMutation, useEvaluateAlertsMutation, useListAlertRulesQuery } from '../api/endpoints/alerts';
import { useListAccountsQuery } from '../api/endpoints/accounts';
import { useListCategoriesQuery } from '../api/endpoints/categories';
import type { AlertRule, AlertRuleType } from '../api/types';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Panel from '../components/Panel';
import PageHeader from '../components/PageHeader';
import AlertRuleFormDialog from '../features/alerts/AlertRuleFormDialog';
import { ALERT_TYPES, ALERT_TYPE_META } from '../features/alerts/alertMeta';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { getApiErrorMessage } from '../lib/apiError';
import { canAdminister } from '../lib/permissions';
import { useTranslation } from 'react-i18next';

export default function AlertsPage(): ReactElement {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const [formTarget, setFormTarget] = useState<{ type: AlertRuleType; existing?: AlertRule } | undefined>(undefined);
  const [deleting, setDeleting] = useState<AlertRule | undefined>(undefined);
  const [scanMessage, setScanMessage] = useState<string | undefined>(undefined);

  const { data, error, isLoading, refetch } = useListAlertRulesQuery(workspace ? { workspaceId: workspace.id } : skipToken);
  const accounts = useListAccountsQuery(workspace ? { workspaceId: workspace.id } : skipToken);
  const categories = useListCategoriesQuery(workspace ? { workspaceId: workspace.id } : skipToken);
  const [deleteRule, { isLoading: deletingInFlight }] = useDeleteAlertRuleMutation();
  const [evaluate, { isLoading: scanning, error: scanError }] = useEvaluateAlertsMutation();

  const loading = isLoading || workspaceLoading;
  const admin = canAdminister(workspace?.role);
  const accountNames = new Map((accounts.data?.accounts ?? []).map((a) => [a.id, a.name]));
  const categoryNames = new Map((categories.data?.categories ?? []).map((c) => [c.id, c.name]));

  const rulesByType = new Map<AlertRuleType, AlertRule[]>();
  for (const rule of data?.rules ?? []) {
    rulesByType.set(rule.type, [...(rulesByType.get(rule.type) ?? []), rule]);
  }

  const handleDelete = async (): Promise<void> => {
    if (!workspace || !deleting) return;
    const ok = await deleteRule({ workspaceId: workspace.id, id: deleting.id })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) setDeleting(undefined);
  };

  const handleScan = async (): Promise<void> => {
    if (!workspace) return;
    const result = await evaluate({ workspaceId: workspace.id }).unwrap().catch(() => null);
    if (result) {
      setScanMessage(
        result.notificationsCreated === 0
          ? t('alerts.scanClean')
          : `Scan complete — ${result.notificationsCreated} notification${result.notificationsCreated === 1 ? '' : 's'} created.`,
      );
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
        title={t('nav.alerts')}
        subtitle={`${workspace?.name ?? ''} · per-workspace rules for the eight alert types`}
        actions={
          admin ? (
            <Button
              variant="outlined"
              startIcon={<PlayCircleOutlineIcon />}
              onClick={() => void handleScan()}
              disabled={scanning}
            >
              {scanning ? t('alerts.scanning') : t('alerts.runScan')}
            </Button>
          ) : null
        }
      />

      {scanMessage ? (
        <Alert severity="success" onClose={() => setScanMessage(undefined)}>
          {scanMessage}
        </Alert>
      ) : null}
      {scanError ? <Alert severity="error">{getApiErrorMessage(scanError, t('alerts.scanFailed'))}</Alert> : null}

      {error ? (
        <ErrorState error={error} title={t('alerts.loadFailed')} onRetry={() => void refetch()} />
      ) : loading ? (
        <Stack spacing={2}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={90} />
          ))}
        </Stack>
      ) : (
        <Stack spacing={2}>
          {ALERT_TYPES.map((type) => {
            const meta = ALERT_TYPE_META[type];
            const rules = rulesByType.get(type) ?? [];

            return (
              <Panel
                key={type}
                title={t(meta.labelKey)}
                action={
                  admin ? (
                    <Button size="small" startIcon={<AddIcon />} onClick={() => setFormTarget({ type })}>
                      {t('alerts.addRule')}
                    </Button>
                  ) : null
                }
              >
                <Typography variant="body2" color="text.secondary">
                  {t(meta.descriptionKey)}
                </Typography>

                {rules.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ mt: 1.5 }}>
                    {t('alerts.notConfigured')}
                  </Typography>
                ) : (
                  <Stack spacing={1.5} sx={{ mt: 2 }} divider={<Divider />}>
                    {rules.map((rule) => (
                      <Stack key={rule.id} direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip label={rule.isEnabled ? t('alerts.enabled') : t('alerts.disabled')} size="small" color={rule.isEnabled ? 'success' : 'default'} />
                          <Chip
                            label={
                              rule.scopeAccountId
                                ? `Account: ${accountNames.get(rule.scopeAccountId) ?? '—'}`
                                : rule.scopeCategoryId
                                  ? `Category: ${categoryNames.get(rule.scopeCategoryId) ?? '—'}`
                                  : t('alerts.wholeWorkspace')
                            }
                            size="small"
                            variant="outlined"
                          />
                          {rule.channels.map((c) => (
                            <Chip key={c} label={c.replace('_', '-')} size="small" variant="outlined" />
                          ))}
                        </Stack>
                        {admin ? (
                          <Stack direction="row" spacing={0.5}>
                            <IconButton size="small" onClick={() => setFormTarget({ type, existing: rule })} aria-label={t('alerts.editRule')}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => setDeleting(rule)} aria-label={t('alerts.deleteRule')}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ) : null}
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Panel>
            );
          })}
        </Stack>
      )}

      {workspace && formTarget ? (
        <AlertRuleFormDialog
          open={Boolean(formTarget)}
          workspaceId={workspace.id}
          type={formTarget.type}
          existing={formTarget.existing}
          onClose={() => setFormTarget(undefined)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('alerts.deleteTitle')}
        description={t('alerts.deleteDescription', {
          type: deleting ? t(ALERT_TYPE_META[deleting.type].labelKey) : '',
        })}
        confirmLabel={t('common.delete')}
        destructive
        loading={deletingInFlight}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(undefined)}
      />
    </Stack>
  );
}
