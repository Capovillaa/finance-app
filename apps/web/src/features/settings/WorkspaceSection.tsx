import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useArchiveWorkspaceMutation, useUpdateWorkspaceMutation } from '../../api/endpoints/workspaces';
import type { Workspace } from '../../api/types';
import { useAppDispatch } from '../../app/hooks';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { COMMON_CURRENCIES } from '../../lib/currencies';
import { canAdminister } from '../../lib/permissions';
import { workspaceCleared } from '../workspace/workspaceSlice';
import { deviceTimezone, workspaceFormSchema, type WorkspaceFormValues } from './settingsSchemas';
import { useTranslation } from 'react-i18next';

interface WorkspaceSectionProps {
  workspace: Workspace;
}

function toFormValues(workspace: Workspace): WorkspaceFormValues {
  return {
    name: workspace.name,
    baseCurrency: workspace.baseCurrency,
    timezone: workspace.timezone,
  };
}

/**
 * Workspace-level settings, admin only, with archiving reserved for the owner.
 *
 * Changing the base currency is the consequential one: every converted total in
 * the app is expressed in it, and transactions already store a `base_amount`
 * computed at write time against the *old* currency. Historic rows are not
 * re-converted, so the change is called out rather than presented as a neutral
 * preference.
 */
export default function WorkspaceSection({ workspace }: WorkspaceSectionProps): ReactElement {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [updateWorkspace, { isLoading, error }] = useUpdateWorkspaceMutation();
  const [archiveWorkspace, archiveState] = useArchiveWorkspaceMutation();
  const [saved, setSaved] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const isAdmin = canAdminister(workspace.role);
  const isOwner = workspace.role === 'owner';

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: toFormValues(workspace),
  });

  useEffect(() => {
    reset(toFormValues(workspace));
  }, [workspace, reset]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof WorkspaceFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);

    const result = await updateWorkspace({ workspaceId: workspace.id, body: values })
      .unwrap()
      .catch(() => null);

    if (!result) return;

    reset(toFormValues(result.workspace));
    setSaved(true);
  });

  const handleArchive = async (): Promise<void> => {
    const ok = await archiveWorkspace(workspace.id)
      .unwrap()
      .then(() => true)
      .catch(() => false);

    if (!ok) return;

    setConfirmingArchive(false);
    // The stored id now points at an archived workspace, which the list no
    // longer returns; clearing it lets `useActiveWorkspace` fall back cleanly.
    dispatch(workspaceCleared());
  };

  const currencyChanged = watch('baseCurrency') !== workspace.baseCurrency;

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <Stack spacing={2.5}>
              <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="h3">{t('settings.workspace')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {isAdmin
                    ? t('settings.workspaceAdminHint')
                    : t('settings.workspaceViewerHint')}
                </Typography>
              </Stack>

              {error ? (
                <Alert severity="error">{getApiErrorMessage(error, t('settings.workspaceFailed'))}</Alert>
              ) : null}
              {saved && !isDirty ? <Alert severity="success">Workspace saved.</Alert> : null}

              <TextField
                label={t('common.name')}
                fullWidth
                disabled={!isAdmin}
                error={Boolean(errors.name)}
                helperText={fieldMessage(errors.name?.message)}
                {...register('name')}
              />

              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                <TextField
                  select
                  label={t('workspaceSettings.baseCurrency')}
                  fullWidth
                  disabled={!isAdmin}
                  error={Boolean(errors.baseCurrency)}
                  helperText={fieldMessage(errors.baseCurrency?.message) ?? t('settings.baseCurrencyHint')}
                  value={watch('baseCurrency')}
                  {...register('baseCurrency')}
                >
                  {COMMON_CURRENCIES.map((code) => (
                    <MenuItem key={code} value={code}>
                      {code}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label={t('settings.timezone')}
                  fullWidth
                  disabled={!isAdmin}
                  error={Boolean(errors.timezone)}
                  helperText={fieldMessage(errors.timezone?.message) ?? t('settings.workspaceTimezoneHint')}
                  {...register('timezone')}
                />
              </Box>

              {currencyChanged ? (
                <Alert severity="warning">
                  {t('settings.baseCurrencyWarning')}
                </Alert>
              ) : null}

              {isAdmin ? (
                <Stack direction="row" justifyContent="flex-end" spacing={1}>
                  <Button
                    size="small"
                    onClick={() => setValue('timezone', deviceTimezone(), { shouldDirty: true, shouldValidate: true })}
                  >
                    {t('settings.useDeviceTimezone')}
                  </Button>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button onClick={() => reset(toFormValues(workspace))} disabled={isLoading || !isDirty}>
                    {t('common.discard')}
                  </Button>
                  <Button type="submit" variant="contained" disabled={isLoading || !isDirty}>
                    {isLoading ? t('common.saving') : t('common.saveChanges')}
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </form>
        </CardContent>
      </Card>

      {isOwner ? (
        <Card sx={{ borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}>
          <CardContent>
            <Stack spacing={2}>
              <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="h3">{t('settings.archiveSectionTitle')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('settings.archiveExplainer')}
                </Typography>
              </Stack>

              {archiveState.error ? (
                <Alert severity="error">
                  {getApiErrorMessage(archiveState.error, t('settings.archiveFailed'))}
                </Alert>
              ) : null}

              <Stack direction="row" justifyContent="flex-end">
                <Button color="error" variant="outlined" onClick={() => setConfirmingArchive(true)}>
                  {t('settings.archiveWorkspace')}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmingArchive}
        title={t('settings.archiveWorkspace')}
        description={`Archive "${workspace.name}"? Every member loses access to it immediately.`}
        confirmLabel={t('settings.archive')}
        destructive
        loading={archiveState.isLoading}
        onConfirm={() => void handleArchive()}
        onCancel={() => setConfirmingArchive(false)}
      />
    </Stack>
  );
}
