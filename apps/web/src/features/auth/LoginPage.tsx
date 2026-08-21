import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLoginMutation } from '../../api/endpoints/auth';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { workspaceSelected } from '../workspace/workspaceSlice';
import AuthLayout from './AuthLayout';
import { loginSchema, type LoginValues } from './authSchemas';
import { credentialsReceived } from './authSlice';
import GoogleSignInButton from './GoogleSignInButton';

interface LocationState {
  from?: { pathname: string };
}

export default function LoginPage(): ReactElement {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [login, { isLoading, error }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // Field-level rejections from the server (an unknown email, a malformed
  // address the client schema let through) are attached to the inputs that
  // caused them rather than only appearing in the banner.
  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof LoginValues, { type: 'server', message });
    }
  }, [error, setError]);

  if (accessToken) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    const result = await login(values).unwrap().catch(() => null);
    if (!result) return;

    dispatch(credentialsReceived({ user: result.user, accessToken: result.accessToken }));
    if (result.defaultWorkspaceId) dispatch(workspaceSelected(result.defaultWorkspaceId));

    const target = (location.state as LocationState | null)?.from?.pathname ?? '/';
    navigate(target, { replace: true });
  });

  return (
    <AuthLayout
      title={t('auth.signIn')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <>
          {t('auth.needAccount')}{' '}
          <Link component={RouterLink} to="/register">
            {t('auth.createOne')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{getApiErrorMessage(error, t('auth.signInFailed'))}</Alert> : null}

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

          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="current-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={fieldMessage(errors.password?.message)}
            {...register('password')}
          />

          <Link component={RouterLink} to="/forgot-password" variant="body2" sx={{ alignSelf: 'flex-end' }}>
            {t('auth.forgotPasswordLink')}
          </Link>

          <Button type="submit" variant="contained" size="large" disabled={isLoading}>
            {isLoading ? t('auth.signingIn') : t('auth.signIn')}
          </Button>

          {/* Renders nothing without VITE_GOOGLE_CLIENT_ID, divider included. */}
          <GoogleSignInButton text="signin_with" />
        </Stack>
      </form>
    </AuthLayout>
  );
}
