import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useResendVerificationMutation } from '../api/endpoints/auth';
import { useAppSelector } from '../app/hooks';

/**
 * Shown on every screen while the signed-in account's email is unverified.
 * Not a `ConfirmDialog` or anything dismissible — it reflects real server
 * state (`user.emailVerifiedAt`) rather than a one-off notice, so it stays
 * until that state actually changes.
 */
export default function EmailVerificationBanner(): ReactElement | null {
  const { t } = useTranslation();
  const user = useAppSelector((state) => state.auth.user);
  const [resendVerification, { isLoading }] = useResendVerificationMutation();
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerifiedAt) return null;

  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
      action={
        sent ? undefined : (
          <Button
            color="inherit"
            size="small"
            disabled={isLoading}
            onClick={async () => {
              await resendVerification().unwrap().catch(() => null);
              setSent(true);
            }}
          >
            {t('auth.emailVerificationBanner.resend')}
          </Button>
        )
      }
    >
      {sent ? t('auth.emailVerificationBanner.resent') : t('auth.emailVerificationBanner.message')}
    </Alert>
  );
}
