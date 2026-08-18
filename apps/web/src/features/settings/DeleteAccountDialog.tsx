import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useEraseMyAccountMutation } from '../../api/endpoints/users';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { formatDate } from '../../lib/format';
import { fieldMessage } from '../../lib/validation';
import { deleteAccountFormSchema, type DeleteAccountFormValues } from './settingsSchemas';

const EMPTY: DeleteAccountFormValues = { currentPassword: '' };

/**
 * Asking to be erased, which is now a request rather than an act.
 *
 * Two things this dialog owes the user that a plain confirmation could not
 * give them. It collects the account **password**, because the endpoint now
 * requires it — a bearer token alone used to be enough to destroy every
 * workspace they solely own. And once the request lands it stays open to say
 * *when* the data actually goes, because the answer ("in a week, unless you
 * sign in") is the difference between a mistake being recoverable and not, and
 * the session ends the moment this closes.
 */
export default function DeleteAccountDialog({
  open,
  onCancel,
  onScheduled,
}: {
  open: boolean;
  onCancel: () => void;
  /** Called when the user dismisses the confirmation; ends the local session. */
  onScheduled: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [eraseMyAccount, { isLoading, error, reset: resetMutation }] = useEraseMyAccountMutation();
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof DeleteAccountFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  // A dialog that is closed and reopened starts clean: no stale password, no
  // stale rejection from the previous attempt.
  useEffect(() => {
    if (!open) {
      reset(EMPTY);
      resetMutation();
      setScheduledFor(null);
    }
  }, [open, reset, resetMutation]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await eraseMyAccount({ currentPassword: values.currentPassword })
      .unwrap()
      .catch(() => null);

    if (result) setScheduledFor(result.deletionScheduledFor);
  });

  if (scheduledFor) {
    return (
      <Dialog open={open} onClose={onScheduled} fullWidth maxWidth="xs">
        <DialogTitle>{t('settings.deleteScheduledTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2">
              {t('settings.deleteScheduledOn', { date: formatDate(scheduledFor.slice(0, 10)) })}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('settings.deleteScheduledCancel')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onScheduled} variant="contained">
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <DialogTitle>{t('settings.deleteAccountTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('settings.deleteAccountDescription')}
            </Typography>

            {error ? (
              <Alert severity="error">{getApiErrorMessage(error, t('settings.deleteAccountFailed'))}</Alert>
            ) : null}

            <TextField
              {...register('currentPassword')}
              type="password"
              label={t('settings.currentPassword')}
              autoComplete="current-password"
              autoFocus
              error={Boolean(errors.currentPassword)}
              helperText={fieldMessage(errors.currentPassword?.message)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" color="error" variant="contained" disabled={isLoading}>
            {isLoading ? t('common.saving') : t('settings.deleteMyAccount')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
