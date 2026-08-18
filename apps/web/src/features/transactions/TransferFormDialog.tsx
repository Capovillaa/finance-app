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
import AmountHero from '../../components/AmountHero';
import FormSection from '../../components/FormSection';
import MoneyField from '../../components/MoneyField';
import { useToast } from '../../components/Toast';
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

/** Catalogue keys, not labels — resolved by the render site. */
const TRANSFER_STATUS_LABEL_KEYS: Record<(typeof TRANSFER_STATUSES)[number], string> = {
  cleared: 'transactions.status.cleared',
  pending: 'transactions.status.pending',
};

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
  const { showToast } = useToast();
  const [createTransfer, { isLoading, error }] = useCreateTransferMutation();
  const accounts = useListAccountsQuery(open ? { workspaceId } : skipToken);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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

  const amount = watch('amount');
  const destinationAmount = watch('destinationAmount') ?? '';

  /**
   * The rate the two figures imply, shown back so the entry can be sanity-checked
   * against the statement it came from — a decimal point in the wrong place is
   * obvious as a rate and invisible as a pair of amounts.
   *
   * `Number` is deliberate and confined to here: this is a *ratio* for display,
   * not a monetary value. Nothing derived from it is stored, sent, or added to
   * anything — both amounts continue to the API as the exact strings that were
   * typed — so the rule against floating-point money is not in play. It is
   * printed with a `≈` because four significant figures is all it is worth.
   */
  const impliedRate = ((): string | null => {
    if (!crossCurrency || !amount || !destinationAmount.trim()) return null;
    const sent = Number(amount);
    const received = Number(destinationAmount);
    if (!Number.isFinite(sent) || !Number.isFinite(received) || sent <= 0 || received <= 0) return null;
    return (received / sent).toPrecision(4);
  })();

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
    showToast({ message: t('transactions.transferCreatedToast'), severity: 'success' });
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('transactions.newTransfer')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={3}>
            {error ? <Alert severity="error">{getApiErrorMessage(error, t('transactions.transferFailed'))}</Alert> : null}

            <Typography variant="body2" color="text.secondary">
              {t('transactions.transferExplainer')}
            </Typography>

            <FormSection label={t('formSections.details')}>
              {/*
                The amount leads here too, and across currencies it is explicitly
                the amount *sent* — the figure that leaves the source account, in
                that account's own currency.
              */}
              <AmountHero
                label={crossCurrency ? t('transactions.amountSent') : t('common.amount')}
                currency={fromAccount?.currency ?? 'USD'}
                autoFocus
                value={amount}
                onChange={(next) => setValue('amount', next, { shouldDirty: true })}
                error={Boolean(errors.amount)}
                helperText={fieldMessage(errors.amount?.message)}
              />

              <Grid container spacing={2} alignItems="flex-start">
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
                <Grid size={{ xs: 12, sm: 2 }} sx={{ display: 'grid', placeItems: 'center', minHeight: 56 }}>
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
                    <MenuItem value="">{t('transactions.chooseAccount')}</MenuItem>
                    {list.map((account) => (
                      <MenuItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>

              {/*
                Secondary to the hero on purpose: what landed is optional, and one
                display-size figure per dialog is the point of having one at all.
              */}
              {crossCurrency ? (
                <MoneyField
                  label={t('transactions.amountReceived')}
                  fullWidth
                  currency={toAccount!.currency}
                  value={destinationAmount}
                  onChange={(next) => setValue('destinationAmount', next, { shouldDirty: true })}
                  error={Boolean(errors.destinationAmount)}
                  helperText={
                    fieldMessage(errors.destinationAmount?.message) ??
                    (impliedRate
                      ? t('transactions.impliedRate', {
                          from: fromAccount!.currency,
                          to: toAccount!.currency,
                          rate: impliedRate,
                        })
                      : t('transactions.destinationAmountHint'))
                  }
                />
              ) : null}

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
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
                <Grid size={{ xs: 12, sm: 6 }}>
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
                        {t(TRANSFER_STATUS_LABEL_KEYS[status])}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            </FormSection>

            <FormSection label={t('common.notes')}>
              <TextField
                label={t('common.description')}
                fullWidth
                error={Boolean(errors.description)}
                helperText={fieldMessage(errors.description?.message)}
                {...register('description')}
              />

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
            </FormSection>
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
