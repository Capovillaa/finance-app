import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useReviseBudgetLineMutation } from '../../api/endpoints/budgets';
import type { BudgetLineProgress } from '../../api/types';
import { getApiErrorMessage } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { reviseLineSchema, type ReviseLineValues } from './budgetSchemas';
import { useTranslation } from 'react-i18next';

interface ReviseLineDialogProps {
  open: boolean;
  workspaceId: string;
  budgetId: string;
  line: BudgetLineProgress | undefined;
  onClose: () => void;
}

/**
 * A dedicated dialog rather than an inline edit: revising a limit mid-period
 * is audited server-side (CLAUDE.md decisions.md), so asking for a reason
 * here is what makes that trail worth reading later.
 */
export default function ReviseLineDialog({ open, workspaceId, budgetId, line, onClose }: ReviseLineDialogProps): ReactElement {
  const { t } = useTranslation();
  const [reviseLine, { isLoading, error }] = useReviseBudgetLineMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReviseLineValues>({
    resolver: zodResolver(reviseLineSchema),
    defaultValues: { newLimit: '', reason: '' },
  });

  useEffect(() => {
    if (open) reset({ newLimit: line?.limitAmount ?? '', reason: '' });
  }, [open, line, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!line) return;
    const result = await reviseLine({
      workspaceId,
      id: budgetId,
      lineId: line.id,
      newLimit: values.newLimit,
      reason: values.reason?.trim() ? values.reason.trim() : null,
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('budgets.reviseLimit')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            <DialogContentText>
              Changing the limit for {line?.categoryName} keeps the old value on record.
            </DialogContentText>

            {error ? <Alert severity="error">{getApiErrorMessage(error, t('budgets.reviseFailed'))}</Alert> : null}

            <TextField
              label={t('budgets.newLimit')}
              autoFocus
              fullWidth
              error={Boolean(errors.newLimit)}
              helperText={fieldMessage(errors.newLimit?.message)}
              {...register('newLimit')}
            />

            <TextField
              label={t('budgets.reason')}
              placeholder={t('common.optional')}
              fullWidth
              error={Boolean(errors.reason)}
              helperText={fieldMessage(errors.reason?.message)}
              {...register('reason')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? t('common.saving') : t('budgets.revise')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
