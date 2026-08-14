import { zodResolver } from '@hookform/resolvers/zod';
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
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import type { AccountInput } from '../../api/endpoints/accounts';
import { useCreateAccountMutation, useUpdateAccountMutation } from '../../api/endpoints/accounts';
import type { Account } from '../../api/types';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { COMMON_CURRENCIES } from '../../lib/currencies';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL_KEYS,
  DEFAULT_ACCOUNT_FORM_VALUES,
  accountFormSchema,
  type AccountFormValues,
} from './accountSchemas';

interface AccountFormDialogProps {
  open: boolean;
  workspaceId: string;
  /** Present for edit, absent for create. */
  account?: Account;
  onClose: () => void;
}

function toFormValues(account: Account | undefined): AccountFormValues {
  if (!account) return DEFAULT_ACCOUNT_FORM_VALUES;
  return {
    name: account.name,
    type: account.type,
    currency: account.currency,
    institution: account.institution ?? '',
    initialBalance: account.initialBalance,
    creditLimit: account.creditLimit ?? '',
    statementDay: account.statementDay === null ? '' : String(account.statementDay),
    dueDay: account.dueDay === null ? '' : String(account.dueDay),
    color: account.color ?? '',
  };
}

function toInput(values: AccountFormValues): AccountInput {
  return {
    name: values.name.trim(),
    type: values.type,
    currency: values.currency.trim().toUpperCase(),
    institution: values.institution?.trim() ? values.institution.trim() : null,
    initialBalance: values.initialBalance.trim() ? values.initialBalance.trim() : undefined,
    creditLimit: values.creditLimit.trim() ? values.creditLimit.trim() : null,
    statementDay: values.statementDay.trim() ? Number(values.statementDay) : null,
    dueDay: values.dueDay.trim() ? Number(values.dueDay) : null,
    color: values.color?.trim() ? values.color.trim() : null,
  };
}

const CREDIT_FIELDS = new Set(['credit_card']);

/**
 * Create and edit share one dialog: the fields and validation are identical,
 * and the server tells the two apart by whether an id is in the URL. Type and
 * currency are locked once an account exists — `updateAccountSchema` omits
 * them because balances and existing transactions are already denominated.
 */
export default function AccountFormDialog({
  open,
  workspaceId,
  account,
  onClose,
}: AccountFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const isEdit = Boolean(account);
  const [createAccount, createState] = useCreateAccountMutation();
  const [updateAccount, updateState] = useUpdateAccountMutation();
  const { isLoading } = isEdit ? updateState : createState;
  const error = isEdit ? updateState.error : createState.error;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: toFormValues(account),
  });

  useEffect(() => {
    if (open) reset(toFormValues(account));
  }, [open, account, reset]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof AccountFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const isCreditCard = CREDIT_FIELDS.has(watch('type'));

  const onSubmit = handleSubmit(async (values) => {
    const body = toInput(values);
    const result = isEdit
      ? await updateAccount({ workspaceId, id: account!.id, body }).unwrap().catch(() => null)
      : await createAccount({ workspaceId, body }).unwrap().catch(() => null);

    if (!result) return;
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? t('accounts.editTitle') : t('accounts.newTitle')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {error ? (
              <Alert severity="error">{getApiErrorMessage(error, t('accounts.saveFailed'))}</Alert>
            ) : null}

            <TextField
              label={t('common.name')}
              autoFocus
              fullWidth
              error={Boolean(errors.name)}
              helperText={fieldMessage(errors.name?.message)}
              {...register('name')}
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label={t('accounts.type.label')}
                  fullWidth
                  disabled={isEdit}
                  helperText={isEdit ? t('accounts.fixedAfterCreate') : fieldMessage(errors.type?.message)}
                  error={Boolean(errors.type)}
                  value={watch('type')}
                  {...register('type')}
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {t(ACCOUNT_TYPE_LABEL_KEYS[type])}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label={t('common.currency')}
                  fullWidth
                  disabled={isEdit}
                  helperText={isEdit ? t('accounts.fixedAfterCreate') : fieldMessage(errors.currency?.message)}
                  error={Boolean(errors.currency)}
                  value={watch('currency')}
                  {...register('currency')}
                >
                  {COMMON_CURRENCIES.map((code) => (
                    <MenuItem key={code} value={code}>
                      {code}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <TextField
              label={t('accounts.institution')}
              placeholder={t('common.optional')}
              fullWidth
              error={Boolean(errors.institution)}
              helperText={fieldMessage(errors.institution?.message)}
              {...register('institution')}
            />

            <TextField
              label={isEdit ? t('accounts.openingBalance') : t('accounts.initialBalance')}
              placeholder="0.00"
              fullWidth
              disabled={isEdit}
              error={Boolean(errors.initialBalance)}
              helperText={
                isEdit
                  ? t('accounts.balanceFixed')
                  : (fieldMessage(errors.initialBalance?.message) ?? t('accounts.defaultsToZero'))
              }
              {...register('initialBalance')}
            />

            {isCreditCard ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label={t('accounts.creditLimit')}
                    placeholder={t('common.optional')}
                    fullWidth
                    error={Boolean(errors.creditLimit)}
                    helperText={fieldMessage(errors.creditLimit?.message)}
                    {...register('creditLimit')}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    label={t('accounts.statementDay')}
                    placeholder="1–31"
                    fullWidth
                    error={Boolean(errors.statementDay)}
                    helperText={fieldMessage(errors.statementDay?.message)}
                    {...register('statementDay')}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    label={t('accounts.dueDay')}
                    placeholder="1–31"
                    fullWidth
                    error={Boolean(errors.dueDay)}
                    helperText={fieldMessage(errors.dueDay?.message)}
                    {...register('dueDay')}
                  />
                </Grid>
              </Grid>
            ) : null}

            <TextField
              label={t('common.colour')}
              type="color"
              sx={{ width: 96 }}
              value={watch('color') || '#1f6feb'}
              error={Boolean(errors.color)}
              helperText={fieldMessage(errors.color?.message)}
              {...register('color')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? t('common.saving') : isEdit ? t('common.saveChanges') : t('accounts.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
