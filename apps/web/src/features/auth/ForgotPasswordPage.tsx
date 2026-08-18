import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useForgotPasswordMutation } from '../../api/endpoints/auth';
import { fieldMessage } from '../../lib/validation';
import AuthLayout from './AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordValues } from './authSchemas';

/**
 * Always reports success, matching the API: `POST /auth/forgot-password`
 * answers 204 whether or not the address has an account, so this screen never
 * lets a caller distinguish the two. See `requestPasswordReset` in
 * `apps/api/src/modules/auth/service.ts`.
 */
export default function ForgotPasswordPage(): ReactElement {
  const { t } = useTranslation();
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await forgotPassword(values).unwrap().catch(() => null);
    setSent(true);
  });

  return (
    <AuthLayout
      title={t('auth.forgotPassword.title')}
      subtitle={t('auth.forgotPassword.subtitle')}
      footer={
        <Link component={RouterLink} to="/login">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      {sent ? (
        <Alert severity="success">{t('auth.forgotPassword.sent')}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2.5}>
            <TextField
              label={t('common.email')}
              type="email"
              autoComplete="email"
              autoFocus
              fullWidth
              error={Boolean(errors.email)}
              helperText={fieldMessage(errors.email?.message)}
              {...register('email')}
            />

            <Button type="submit" variant="contained" size="large" disabled={isLoading}>
              {isLoading ? t('auth.forgotPassword.sending') : t('auth.forgotPassword.submit')}
            </Button>
          </Stack>
        </form>
      )}
    </AuthLayout>
  );
}
