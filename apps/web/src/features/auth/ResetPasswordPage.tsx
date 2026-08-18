import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useResetPasswordMutation } from '../../api/endpoints/auth';
import { useAppDispatch } from '../../app/hooks';
import { getApiErrorMessage } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { workspaceSelected } from '../workspace/workspaceSlice';
import AuthLayout from './AuthLayout';
import { resetPasswordSchema, type ResetPasswordValues } from './authSchemas';
import { credentialsReceived } from './authSlice';

/**
 * The token lives only in the emailed link's query string. A successful reset
 * signs the caller straight in — `POST /auth/reset-password` returns the same
 * shape `login` does — so there is no separate "now sign in" step.
 */
export default function ResetPasswordPage(): ReactElement {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [resetPassword, { isLoading, error }] = useResetPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await resetPassword({ token, newPassword: values.newPassword })
      .unwrap()
      .catch(() => null);
    if (!result) return;

    dispatch(credentialsReceived({ user: result.user, accessToken: result.accessToken }));
    if (result.defaultWorkspaceId) dispatch(workspaceSelected(result.defaultWorkspaceId));
    navigate('/', { replace: true });
  });

  if (!token) {
    return (
      <AuthLayout title={t('auth.resetPassword.title')} subtitle={t('auth.resetPassword.subtitle')}>
        <Alert severity="error">{t('auth.resetPassword.missingToken')}</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.resetPassword.title')}
      subtitle={t('auth.resetPassword.subtitle')}
      footer={
        <Link component={RouterLink} to="/login">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2.5}>
          {error ? (
            <Alert severity="error">{getApiErrorMessage(error, t('auth.resetPassword.failed'))}</Alert>
          ) : null}

          <TextField
            label={t('auth.newPassword')}
            type="password"
            autoComplete="new-password"
            autoFocus
            fullWidth
            error={Boolean(errors.newPassword)}
            helperText={fieldMessage(errors.newPassword?.message) ?? t('auth.passwordHintShort')}
            {...register('newPassword')}
          />

          <TextField
            label={t('auth.confirmPassword')}
            type="password"
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.confirmPassword)}
            helperText={fieldMessage(errors.confirmPassword?.message)}
            {...register('confirmPassword')}
          />

          <Button type="submit" variant="contained" size="large" disabled={isLoading}>
            {isLoading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit')}
          </Button>

          <Typography variant="body2" color="text.secondary">
            {t('auth.resetPassword.revokesOtherSessions')}
          </Typography>
        </Stack>
      </form>
    </AuthLayout>
  );
}
