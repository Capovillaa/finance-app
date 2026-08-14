import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useChangePasswordMutation } from '../../api/endpoints/auth';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { useEndSession } from '../auth/useEndSession';
import { passwordFormSchema, type PasswordFormValues } from './settingsSchemas';
import { useTranslation } from 'react-i18next';

const EMPTY: PasswordFormValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * Changing the password.
 *
 * A successful change revokes every refresh-token family on the account,
 * including this browser's, so the session is already over — the access token
 * in memory just has not expired yet. Rather than let the user carry on and be
 * dropped at some arbitrary moment minutes later, the form says what happened
 * and hands them back to the login page.
 */
export default function PasswordSection(): ReactElement {
  const { t } = useTranslation();
  const [changePassword, { isLoading, error }] = useChangePasswordMutation();
  const [changed, setChanged] = useState(false);
  const endSession = useEndSession();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof PasswordFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const onSubmit = handleSubmit(async (values) => {
    const ok = await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
      .unwrap()
      .then(() => true)
      .catch(() => false);

    if (!ok) return;

    reset(EMPTY);
    setChanged(true);
  });

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2.5}>
            <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h3">{t('auth.password')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.passwordExplainer')}
              </Typography>
            </Stack>

            {error ? (
              <Alert severity="error">{getApiErrorMessage(error, t('settings.passwordFailed'))}</Alert>
            ) : null}

            {changed ? (
              <Alert
                severity="success"
                action={
                  <Button color="inherit" size="small" onClick={endSession}>
                    {t('settings.signInAgain')}
                  </Button>
                }
              >
                {t('settings.passwordChanged')}
              </Alert>
            ) : null}

            <TextField
              label={t('settings.currentPassword')}
              type="password"
              autoComplete="current-password"
              fullWidth
              disabled={changed}
              error={Boolean(errors.currentPassword)}
              helperText={fieldMessage(errors.currentPassword?.message)}
              {...register('currentPassword')}
            />

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              <TextField
                label={t('settings.newPassword')}
                type="password"
                autoComplete="new-password"
                fullWidth
                disabled={changed}
                error={Boolean(errors.newPassword)}
                helperText={fieldMessage(errors.newPassword?.message) ?? t('auth.passwordHintShort')}
                {...register('newPassword')}
              />
              <TextField
                label={t('settings.confirmNewPassword')}
                type="password"
                autoComplete="new-password"
                fullWidth
                disabled={changed}
                error={Boolean(errors.confirmPassword)}
                helperText={fieldMessage(errors.confirmPassword?.message)}
                {...register('confirmPassword')}
              />
            </Box>

            <Stack direction="row" justifyContent="flex-end">
              <Button type="submit" variant="contained" disabled={isLoading || changed}>
                {isLoading ? t('settings.changing') : t('settings.changePassword')}
              </Button>
            </Stack>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}
