import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowForwardIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useListAccountsQuery } from '../../api/endpoints/accounts';
import type { TransferInput } from '../../api/endpoints/transactions';
import { useCreateTransferMutation } from '../../api/endpoints/transactions';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { todayIso } from '../../lib/format';
import {
  TRANSFER_STATUSES,
  defaultTransferFormValues,
  transferFormSchema,
  type TransferFormValues,
} from './transactionSchemas';

interface TransferFormDialogProps {
  open: boolean;
  workspaceId: string;
  defaultAccountId?: string;
  onClose: () => void;
}

/**
 * Moving money between two of your own accounts.
 *
 * Create-only, and separate from the transaction form on purpose: a transfer is
 * two ledger rows, and the server refuses to change either account or the
 * amount on an existing one ("delete and recreate"). Presenting it as an
 * editable form would promise something the API will not do.
 *
 * Where the two accounts hold different currencies, a second amount field
 * appears. It is the figure that actually landed in the destination account —
 * worth entering, because the bank's rate on the day is rarely the rate the
 * app would apply, and the difference is real money.
 */
export default function TransferFormDialog({
  open,
  workspaceId,
  defaultAccountId,
  onClose,
}: TransferFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [createTransfer, { isLoading, error }] = useCreateTransferMutation();
  const accounts = useListAccountsQuery(open ? { workspaceId } : skipToken);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: defaultTransferFormValues(defaultAccountId ?? '', todayIso()),
  });

  useEffect(() => {
    if (open) reset(defaultTransferFormValues(defaultAccountId ?? accounts.data?.accounts[0]?.id ?? '', todayIso()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof TransferFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const list = accounts.data?.accounts ?? [];
  const fromAccount = list.find((account) => account.id === watch('fromAccountId'));
  const toAccount = list.find((account) => account.id === watch('toAccountId'));
  const crossCurrency = Boolean(fromAccount && toAccount && fromAccount.currency !== toAccount.currency);

  const onSubmit = handleSubmit(async (values) => {
    const body: TransferInput = {
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      amount: values.amount,
      description: values.description.trim(),
      notes: values.notes?.trim() ? values.notes.trim() : null,
      occurredOn: values.occurredOn,
      status: values.status,
      // Only meaningful across currencies; sending it for a same-currency
      // transfer would let the two legs disagree about one number.
      ...(crossCurrency && values.destinationAmount?.trim()
        ? { destinationAmount: values.destinationAmount.trim() }
        : {}),
    };

    const result = await createTransfer({ workspaceId, body }).unwrap().catch(() => null);
    if (!result) return;
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('transactions.newTransfer')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {error ? <Alert severity="error">{getApiErrorMessage(error, t('transactions.transferFailed'))}</Alert> : null}

            <Typography variant="body2" color="text.secondary">
              {t('transactions.transferExplainer')}
            </Typography>

            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 5 }}>
                <TextField
                  select
                  label={t('common.from')}
                  fullWidth
                  error={Boolean(errors.fromAccountId)}
                  helperText={fieldMessage(errors.fromAccountId?.message)}
                  value={watch('fromAccountId')}
                  {...register('fromAccountId')}
                >
                  {list.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 2 }} sx={{ display: 'grid', placeItems: 'center' }}>
                <ArrowForwardIcon fontSize="small" color="disabled" />
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }}>
                <TextField
                  select
                  label={t('common.to')}
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(errors.toAccountId)}
                  helperText={fieldMessage(errors.toAccountId?.message)}
                  value={watch('toAccountId')}
                  {...register('toAccountId')}
                >
                  <MenuItem value="">Choose an account</MenuItem>
                  {list.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: crossCurrency ? 4 : 6 }}>
                <TextField
                  label={crossCurrency ? `Amount sent${fromAccount ? ` (${fromAccount.currency})` : ''}` : t('common.amount')}
                  placeholder="0.00"
                  fullWidth
                  error={Boolean(errors.amount)}
                  helperText={fieldMessage(errors.amount?.message)}
                  {...register('amount')}
                />
              </Grid>

              {crossCurrency ? (
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label={`Amount received (${toAccount!.currency})`}
                    placeholder={t('common.optional')}
                    fullWidth
                    error={Boolean(errors.destinationAmount)}
                    helperText={fieldMessage(errors.destinationAmount?.message) ?? t('transactions.destinationAmountHint')}
                    {...register('destinationAmount')}
                  />
                </Grid>
              ) : null}

              <Grid size={{ xs: 12, sm: crossCurrency ? 4 : 6 }}>
                <TextField
                  label={t('common.date')}
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(errors.occurredOn)}
                  helperText={fieldMessage(errors.occurredOn?.message)}
                  {...register('occurredOn')}
                />
              </Grid>
            </Grid>

            <TextField
              label={t('common.description')}
              fullWidth
              error={Boolean(errors.description)}
              helperText={fieldMessage(errors.description?.message)}
              {...register('description')}
            />

            <TextField
              select
              label={t('common.status')}
              fullWidth
              error={Boolean(errors.status)}
              helperText={fieldMessage(errors.status?.message) ?? t('transactions.transferStatusHint')}
              value={watch('status')}
              {...register('status')}
            >
              {TRANSFER_STATUSES.map((status) => (
                <MenuItem key={status} value={status}>
                  {status[0]!.toUpperCase() + status.slice(1)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label={t('common.notes')}
              placeholder={t('common.optional')}
              multiline
              minRows={2}
              fullWidth
              error={Boolean(errors.notes)}
              helperText={fieldMessage(errors.notes?.message)}
              {...register('notes')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? t('common.saving') : t('transactions.createTransfer')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
