import { DevicesIcon, DownloadIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, type ReactElement } from 'react';
import { useLogoutAllMutation } from '../../api/endpoints/auth';
import { useDeleteAccountMutation, useExportMyDataMutation } from '../../api/endpoints/users';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getApiErrorMessage } from '../../lib/apiError';
import { downloadText } from '../../lib/download';
import { todayIso } from '../../lib/format';
import { useEndSession } from '../auth/useEndSession';
import { useTranslation } from 'react-i18next';

/**
 * Data export and the two irreversible account actions.
 *
 * Both of the destructive ones revoke every session server-side, so each ends
 * this one locally as well rather than leaving the tab holding an access token
 * that is about to stop working.
 */
export default function DataSection(): ReactElement {
  const { t } = useTranslation();
  const endSession = useEndSession();
  const [exportData, exportState] = useExportMyDataMutation();
  const [logoutAll, logoutAllState] = useLogoutAllMutation();
  const [deleteAccount, deleteState] = useDeleteAccountMutation();

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleExport = async (): Promise<void> => {
    const data = await exportData()
      .unwrap()
      .catch(() => null);

    if (data === null) return;
    downloadText(JSON.stringify(data, null, 2), `finance-export-${todayIso()}.json`, 'application/json');
  };

  const handleSignOutEverywhere = async (): Promise<void> => {
    const ok = await logoutAll()
      .unwrap()
      .then(() => true)
      .catch(() => false);

    if (!ok) return;
    setConfirmingSignOut(false);
    endSession();
  };

  const handleDelete = async (): Promise<void> => {
    const ok = await deleteAccount()
      .unwrap()
      .then(() => true)
      .catch(() => false);

    if (!ok) return;
    setConfirmingDelete(false);
    endSession();
  };

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h3">{t('settings.yourData')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.yourDataExplainer')}
              </Typography>
            </Stack>

            {exportState.error ? (
              <Alert severity="error">{getApiErrorMessage(exportState.error, t('reports.exportFailed'))}</Alert>
            ) : null}

            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => void handleExport()}
                disabled={exportState.isLoading}
              >
                {exportState.isLoading ? t('common.preparing') : t('settings.downloadMyData')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h3">{t('settings.sessions')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.sessionsExplainer')}
              </Typography>
            </Stack>

            {logoutAllState.error ? (
              <Alert severity="error">{getApiErrorMessage(logoutAllState.error, t('settings.signOutAllFailed'))}</Alert>
            ) : null}

            <Stack direction="row" justifyContent="flex-end">
              <Button variant="outlined" startIcon={<DevicesIcon />} onClick={() => setConfirmingSignOut(true)}>
                {t('settings.signOutEverywhere')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h3">{t('settings.deleteAccountTitle')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.deleteAccountExplainer')}
              </Typography>
            </Stack>

            {deleteState.error ? (
              <Alert severity="error">{getApiErrorMessage(deleteState.error, t('settings.deleteAccountFailed'))}</Alert>
            ) : null}

            <Stack direction="row" justifyContent="flex-end">
              <Button color="error" variant="outlined" onClick={() => setConfirmingDelete(true)}>
                {t('settings.deleteMyAccount')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmingSignOut}
        title={t('settings.signOutEverywhere')}
        description={t('settings.signOutAllDescription')}
        confirmLabel={t('settings.signOutEverywhere')}
        loading={logoutAllState.isLoading}
        onConfirm={() => void handleSignOutEverywhere()}
        onCancel={() => setConfirmingSignOut(false)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title={t('settings.deleteAccountTitle')}
        description={t('settings.deleteAccountDescription')}
        confirmLabel={t('settings.deleteMyAccount')}
        destructive
        loading={deleteState.isLoading}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Stack>
  );
}
