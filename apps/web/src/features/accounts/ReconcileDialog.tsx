import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  useCreateReconciliationMutation,
  useListReconciliationsQuery,
} from '../../api/endpoints/accounts';
import type { Account, ReconciliationResult, WorkspaceRole } from '../../api/types';
import LedgerList from '../../components/LedgerList';
import LedgerRow from '../../components/LedgerRow';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { formatDate, formatMoney, todayIso } from '../../lib/format';
import { equalMoney } from '../../lib/money';
import { canEdit } from '../../lib/permissions';
import { fieldMessage } from '../../lib/validation';
import { reconciliationFormSchema, type ReconciliationFormValues } from './accountSchemas';

interface ReconcileDialogProps {
  open: boolean;
  workspaceId: string;
  account: Account | undefined;
  role: WorkspaceRole | undefined;
  onClose: () => void;
}

function defaultValues(): ReconciliationFormValues {
  return { statementDate: todayIso(), statementBalance: '', notes: '', markTransactions: true };
}

/**
 * Reconciling one account against a bank statement, plus everything it has been
 * reconciled against before.
 *
 * The two halves belong in one place because the history is how you tell whether
 * today's difference is new: an account that has balanced every month and is
 * suddenly out by 40 has one missing entry, and one that has never balanced has
 * a different problem. It follows `ContributionsDialog`'s shape — act at the
 * top, history beneath — and, like it, shows the history to a viewer while
 * hiding the form, because the API allows exactly that.
 */
export default function ReconcileDialog({
  open,
  workspaceId,
  account,
  role,
  onClose,
}: ReconcileDialogProps): ReactElement {
  const { t } = useTranslation();
  const editable = canEdit(role);
  const [result, setResult] = useState<ReconciliationResult | null>(null);

  const { data, isLoading } = useListReconciliationsQuery(
    open && account ? { workspaceId, accountId: account.id } : skipToken,
  );
  const [reconcile, { isLoading: saving, error }] = useCreateReconciliationMutation();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ReconciliationFormValues>({
    resolver: zodResolver(reconciliationFormSchema),
    defaultValues: defaultValues(),
  });

  useEffect(() => {
    if (open) {
      reset(defaultValues());
      setResult(null);
    }
  }, [open, reset]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof ReconciliationFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const onSubmit = handleSubmit(async (values) => {
    if (!account) return;
    const outcome = await reconcile({
      workspaceId,
      accountId: account.id,
      body: {
        statementDate: values.statementDate,
        statementBalance: values.statementBalance.trim(),
        notes: values.notes?.trim() ? values.notes.trim() : null,
        markTransactions: values.markTransactions,
      },
    })
      .unwrap()
      .catch(() => null);

    if (outcome) setResult(outcome.reconciliation);
  });

  const currency = account?.currency ?? 'USD';
  const reconciliations = data?.reconciliations ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('accounts.reconcile.title')}
        {account ? ` — ${account.name}` : ''}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('accounts.reconcile.intro', {
              balance: formatMoney(account?.currentBalance, currency),
            })}
          </Typography>

          {editable ? (
            <form onSubmit={onSubmit} noValidate>
              <Stack spacing={1.5}>
                {error ? (
                  <Alert severity="error">
                    {getApiErrorMessage(error, t('accounts.reconcile.failed'))}
                  </Alert>
                ) : null}

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label={t('accounts.reconcile.statementDate')}
                      type="date"
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      error={Boolean(errors.statementDate)}
                      helperText={
                        fieldMessage(errors.statementDate?.message) ?? t('accounts.reconcile.dateHint')
                      }
                      {...register('statementDate')}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label={t('accounts.reconcile.statementBalance')}
                      size="small"
                      fullWidth
                      error={Boolean(errors.statementBalance)}
                      helperText={
                        fieldMessage(errors.statementBalance?.message) ??
                        t('accounts.reconcile.balanceHint')
                      }
                      {...register('statementBalance')}
                    />
                  </Grid>
                </Grid>

                <TextField
                  label={t('accounts.reconcile.notes')}
                  placeholder={t('common.optional')}
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  error={Boolean(errors.notes)}
                  helperText={fieldMessage(errors.notes?.message)}
                  {...register('notes')}
                />

                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={watch('markTransactions')}
                      onChange={(e) => setValue('markTransactions', e.target.checked)}
                    />
                  }
                  label={
                    <Stack spacing={0}>
                      <Typography variant="body2">{t('accounts.reconcile.freeze')}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t('accounts.reconcile.freezeHint')}
                      </Typography>
                    </Stack>
                  }
                />

                <Button type="submit" variant="contained" size="small" disabled={saving}>
                  {saving ? t('common.saving') : t('accounts.reconcile.submit')}
                </Button>
              </Stack>
            </form>
          ) : null}

          {result ? <ReconcileOutcome result={result} currency={currency} /> : null}

          <Divider />

          <Typography variant="eyebrow" color="text.secondary" component="div">
            {t('accounts.reconcile.history')}
          </Typography>

          <LedgerList
            loading={isLoading}
            loadingRows={3}
            isEmpty={reconciliations.length === 0}
            emptyMessage={t('accounts.reconcile.empty')}
            label={t('accounts.reconcile.history')}
          >
            {reconciliations.map((row) => {
              const matched = equalMoney(row.difference, '0');
              return (
                /*
                 * The difference is deliberately not coloured by its sign. The
                 * money palette means income/expense, and a positive difference
                 * here is money the ledger is *missing* — green would read as a
                 * gain. The state is already said twice, by the spine and by the
                 * word, so the figure stays plain and only a zero is muted.
                 */
                <LedgerRow
                  key={row.id}
                  dense
                  lead={formatDate(row.statementDate)}
                  primary={formatMoney(row.statementBalance, currency)}
                  secondary={[
                    t('accounts.reconcile.ledgerWas', {
                      amount: formatMoney(row.computedBalance, currency),
                    }),
                    row.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  meta={t(`accounts.reconcile.status.${row.status}`)}
                  amount={formatMoney(row.difference, currency)}
                  amountTone={matched ? 'neutral' : 'inherit'}
                  amountCaption={t('accounts.reconcile.difference')}
                  tone={row.status === 'open' ? 'caution' : 'none'}
                  toneLabel={t('accounts.reconcile.status.open')}
                />
              );
            })}
          </LedgerList>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * What just happened, in words.
 *
 * The difference is the bank's figure minus the ledger's, which is a sign nobody
 * should have to reason about under pressure — so the two directions get
 * different sentences naming what is actually missing, rather than one sentence
 * with a signed number in it.
 */
function ReconcileOutcome({
  result,
  currency,
}: {
  result: ReconciliationResult;
  currency: string;
}): ReactElement {
  const { t } = useTranslation();

  if (result.status === 'completed') {
    return (
      <Alert severity="success">
        <AlertTitle>{t('accounts.reconcile.matchedTitle')}</AlertTitle>
        {result.transactionsMarked > 0
          ? t('accounts.reconcile.matchedFroze', { count: result.transactionsMarked })
          : t('accounts.reconcile.matchedNoneFrozen')}
      </Alert>
    );
  }

  const short = result.difference.startsWith('-');
  return (
    <Alert severity="warning">
      <AlertTitle>
        {t('accounts.reconcile.mismatchTitle', {
          difference: formatMoney(result.difference, currency),
        })}
      </AlertTitle>
      {t(short ? 'accounts.reconcile.mismatchLedgerHigher' : 'accounts.reconcile.mismatchLedgerLower', {
        statement: formatMoney(result.statementBalance, currency),
        ledger: formatMoney(result.computedBalance, currency),
      })}
    </Alert>
  );
}
