import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../app/hooks';

/** Full-viewport spinner shown while the session is being restored. */
export function FullPageSpinner(): ReactElement {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
      }}
    >
      <CircularProgress aria-label={t('common.loadingAria')} />
    </Box>
  );
}

/**
 * Gate for every authenticated route.
 *
 * The `bootstrapped` check matters as much as the token check: on a reload the
 * store starts with no access token even for a signed-in user, and redirecting
 * before the silent refresh has settled would bounce them to the login page and
 * lose the URL they asked for.
 */
export default function RequireAuth(): ReactElement {
  const { accessToken, bootstrapped } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (!bootstrapped) return <FullPageSpinner />;

  if (!accessToken) {
    // `state.from` lets the login page send them back where they were heading.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
