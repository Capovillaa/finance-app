import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, useVerifyEmailMutation } from '../../api/endpoints/auth';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { getApiErrorMessage } from '../../lib/apiError';
import AuthLayout from './AuthLayout';
import { userLoaded } from './authSlice';

/**
 * Confirms an emailed verification link. Deliberately reachable with no
 * session: the token itself is the proof, and the link may be opened on a
 * different device than the one that registered.
 */
export default function VerifyEmailPage(): ReactElement {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [verifyEmail, { isLoading, isSuccess, error }] = useVerifyEmailMutation();
  const attempted = useRef(false);
  const [missingToken] = useState(!token);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void verifyEmail({ token })
      .unwrap()
      .then(() => {
        // If this browser is already signed in, refresh the profile so the
        // "verify your email" banner clears without waiting for a reload.
        if (!accessToken) return;
        return dispatch(authApi.endpoints.me.initiate(undefined, { forceRefetch: true })).then((result) => {
          if ('data' in result && result.data) dispatch(userLoaded(result.data.user));
        });
      })
      .catch(() => null);
  }, [token, accessToken, verifyEmail, dispatch]);

  return (
    <AuthLayout title={t('auth.verifyEmail.title')} subtitle={t('auth.verifyEmail.subtitle')}>
      <Stack spacing={2.5} alignItems="flex-start">
        {missingToken ? (
          <Alert severity="error">{t('auth.verifyEmail.missingToken')}</Alert>
        ) : isLoading ? (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <span>{t('auth.verifyEmail.verifying')}</span>
          </Stack>
        ) : isSuccess ? (
          <Alert severity="success">{t('auth.verifyEmail.success')}</Alert>
        ) : error ? (
          <Alert severity="error">{getApiErrorMessage(error, t('auth.verifyEmail.failed'))}</Alert>
        ) : null}

        <Button variant="contained" onClick={() => navigate(accessToken ? '/' : '/login', { replace: true })}>
          {accessToken ? t('auth.verifyEmail.continue') : t('auth.backToSignIn')}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
