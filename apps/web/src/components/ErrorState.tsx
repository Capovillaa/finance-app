import { RefreshIcon } from '../icons';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage, type QueryError } from '../lib/apiError';

interface ErrorStateProps {
  error: QueryError;
  title?: string;
  onRetry?: () => void;
}

export default function ErrorState({ error, title, onRetry }: ErrorStateProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Alert
      severity="error"
      action={
        onRetry ? (
          <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>{title ?? t('common.couldNotLoad')}</AlertTitle>
      {getApiErrorMessage(error)}
    </Alert>
  );
}
