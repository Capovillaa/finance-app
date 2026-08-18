import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { useRegisterMutation } from '../../api/endpoints/auth';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { COMMON_CURRENCIES } from '../../lib/currencies';
import { appLocale } from '../../lib/format';
import { workspaceSelected } from '../workspace/workspaceSlice';
import AuthLayout from './AuthLayout';
import { registerSchema, type RegisterValues } from './authSchemas';
import { credentialsReceived } from './authSlice';

function guessCurrency(): string {
  const region = new Intl.Locale(appLocale()).maximize().region;
  const byRegion: Record<string, string> = {
    BR: 'BRL',
    US: 'USD',
    GB: 'GBP',
    CA: 'CAD',
    AU: 'AUD',
    JP: 'JPY',
  };
  return (region && byRegion[region]) ?? 'USD';
}

export default function RegisterPage(): ReactElement {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [registerUser, { isLoading, error }] = useRegisterMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      baseCurrency: guessCurrency(),
      workspaceName: '',
    },
  });

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof RegisterValues, { type: 'server', message });
    }
  }, [error, setError]);

  if (accessToken) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    const result = await registerUser({
      fullName: values.fullName,
      email: values.email,
      password: values.password,
      baseCurrency: values.baseCurrency,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      // The language this form was just read in. Without it the API applies its
      // own default, and since `requireAuth` prefers the stored locale over
      // `Accept-Language`, every server-rendered sentence afterwards — a
      // rejected password, an alert email — comes back in a language the user
      // never chose, while the UI around it stays in the one they did.
      locale: appLocale(),
      // Sent only when filled in, so the API applies its own default name.
      ...(values.workspaceName ? { workspaceName: values.workspaceName } : {}),
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;

    dispatch(credentialsReceived({ user: result.user, accessToken: result.accessToken }));
    if (result.defaultWorkspaceId) dispatch(workspaceSelected(result.defaultWorkspaceId));
    navigate('/', { replace: true });
  });

  return (
    <AuthLayout
      title={t('auth.createTitle')}
      subtitle={t('auth.createSubtitle')}
      footer={
        <>
          {t('auth.alreadyRegistered')}{' '}
          <Link component={RouterLink} to="/login">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{getApiErrorMessage(error, t('auth.createFailed'))}</Alert> : null}

          <TextField
            label={t('common.fullName')}
            autoComplete="name"
            autoFocus
            fullWidth
            error={Boolean(errors.fullName)}
            helperText={fieldMessage(errors.fullName?.message)}
            {...register('fullName')}
          />

          <TextField
            label={t('common.email')}
            type="email"
            autoComplete="email"
            fullWidth
            error={Boolean(errors.email)}
            helperText={fieldMessage(errors.email?.message)}
            {...register('email')}
          />

          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={fieldMessage(errors.password?.message) ?? t('auth.passwordHint')}
            {...register('password')}
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

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label={t('workspaceSettings.baseCurrency')}
              fullWidth
              error={Boolean(errors.baseCurrency)}
              helperText={fieldMessage(errors.baseCurrency?.message) ?? t('auth.baseCurrencyHint')}
              defaultValue={guessCurrency()}
              {...register('baseCurrency')}
            >
              {COMMON_CURRENCIES.map((code) => (
                <MenuItem key={code} value={code}>
                  {code}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label={t('auth.workspaceName')}
              placeholder={t('common.optional')}
              fullWidth
              error={Boolean(errors.workspaceName)}
              helperText={fieldMessage(errors.workspaceName?.message) ?? t('auth.workspaceNameHint')}
              {...register('workspaceName')}
            />
          </Stack>

          <Button type="submit" variant="contained" size="large" disabled={isLoading}>
            {isLoading ? t('auth.creating') : t('auth.createAccount')}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
