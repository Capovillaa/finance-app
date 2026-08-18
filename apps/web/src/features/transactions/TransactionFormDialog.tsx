import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useListAccountsQuery } from '../../api/endpoints/accounts';
import { useListCategoriesQuery } from '../../api/endpoints/categories';
import { useListTagsQuery } from '../../api/endpoints/tags';
import type { TransactionInput } from '../../api/endpoints/transactions';
import { useCreateTransactionMutation, useUpdateTransactionMutation } from '../../api/endpoints/transactions';
import type { Transaction } from '../../api/types';
import AmountHero from '../../components/AmountHero';
import FormSection from '../../components/FormSection';
import { useToast } from '../../components/Toast';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { todayIso } from '../../lib/format';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  defaultTransactionFormValues,
  transactionFormSchema,
  type TransactionFormValues,
} from './transactionSchemas';

/**
 * Catalogue keys, not labels: this table is built once when the bundle loads,
 * before any language is settled, so the render site is what calls `t()`. The
 * status names used to be printed by upper-casing the enum member, which is
 * English wearing a capital letter.
 */
const STATUS_LABEL_KEYS: Record<(typeof TRANSACTION_STATUSES)[number], string> = {
  cleared: 'transactions.status.cleared',
  pending: 'transactions.status.pending',
  scheduled: 'transactions.status.scheduled',
};

interface TransactionFormDialogProps {
  open: boolean;
  workspaceId: string;
  /** Present for edit, absent for create. A transfer leg opens in restricted mode. */
  transaction?: Transaction;
  /** Preselected account, e.g. when creating from an account's own view. */
  defaultAccountId?: string;
  onClose: () => void;
}

function toFormValues(transaction: Transaction | undefined, defaultAccountId: string): TransactionFormValues {
  if (!transaction) return defaultTransactionFormValues(defaultAccountId, todayIso());
  return {
    accountId: transaction.accountId,
    categoryId: transaction.categoryId ?? '',
    type: transaction.type === 'transfer' ? 'expense' : transaction.type,
    amount: transaction.amount.trimStart().startsWith('-') ? transaction.amount.slice(1) : transaction.amount,
    merchant: transaction.merchant ?? '',
    notes: transaction.notes ?? '',
    description: transaction.description,
    occurredOn: transaction.occurredOn,
    status: transaction.status === 'void' ? 'cleared' : transaction.status,
    tagIds: [],
  };
}

/**
 * Create and edit a single ledger row.
 *
 * A **transfer leg** opens here too, but restricted. The server refuses to
 * change a transfer's accounts or amount ("delete and recreate"), and it
 * refuses any ordinary category on one, because `assertCategoryUsable` requires
 * a category's kind to match the transaction's. Rather than render controls
 * that earn a 422, the form drops those fields for a transfer and says why —
 * what is left (description, date, status, merchant, notes, tags) is exactly
 * what the API will accept.
 */
export default function TransactionFormDialog({
  open,
  workspaceId,
  transaction,
  defaultAccountId,
  onClose,
}: TransactionFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const isEdit = Boolean(transaction);
  const isTransfer = transaction?.type === 'transfer';
  const [createTransaction, createState] = useCreateTransactionMutation();
  const [updateTransaction, updateState] = useUpdateTransactionMutation();
  const { isLoading } = isEdit ? updateState : createState;
  const error = isEdit ? updateState.error : createState.error;

  const accounts = useListAccountsQuery(open ? { workspaceId } : skipToken);
  const tags = useListTagsQuery(open ? workspaceId : skipToken);
  const tagList = tags.data?.tags ?? [];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: toFormValues(transaction, defaultAccountId ?? ''),
  });

  useEffect(() => {
    if (open) reset(toFormValues(transaction, defaultAccountId ?? accounts.data?.accounts[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction]);

  /**
   * `Transaction.tags` carries tag *names* — the list query joins `tags.name` —
   * while create and update take ids, so the selection has to be mapped back.
   * Names are unique per workspace (`tags_workspace_name_unique`, on
   * `lower(name)`), which makes the lookup unambiguous.
   *
   * This is a targeted `setValue` rather than part of the reset above because
   * the tag list resolves after the dialog opens, and re-running a full reset
   * at that moment would discard anything already typed.
   */
  useEffect(() => {
    if (!open || !transaction?.tags?.length || tagList.length === 0) return;

    const idByName = new Map(tagList.map((tag) => [tag.name.toLowerCase(), tag.id]));
    const ids = transaction.tags
      .map((name) => idByName.get(name.toLowerCase()))
      .filter((id): id is string => Boolean(id));

    setValue('tagIds', ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, tagList.length]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof TransactionFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const type = watch('type');
  const selectedTagIds = watch('tagIds');
  const categories = useListCategoriesQuery(open && !isTransfer ? { workspaceId, kind: type } : skipToken);

  /**
   * A row is denominated in its account's currency, so that is what the amount
   * formats against — down to the number of decimal places, which is not two
   * everywhere. Falls back to the first account while the list is still in
   * flight, and to USD only when there is nothing to go on at all.
   */
  const accountList = accounts.data?.accounts ?? [];
  const currency =
    accountList.find((account) => account.id === watch('accountId'))?.currency ??
    accountList[0]?.currency ??
    'USD';

  const onSubmit = handleSubmit(async (values) => {
    // A transfer accepts only the fields the server does not guard.
    const body: Partial<TransactionInput> = isTransfer
      ? {
          description: values.description.trim(),
          merchant: values.merchant?.trim() ? values.merchant.trim() : null,
          notes: values.notes?.trim() ? values.notes.trim() : null,
          occurredOn: values.occurredOn,
          status: values.status,
          tagIds: values.tagIds,
        }
      : {
          accountId: values.accountId,
          categoryId: values.categoryId || null,
          type: values.type,
          amount: values.amount,
          description: values.description.trim(),
          merchant: values.merchant?.trim() ? values.merchant.trim() : null,
          notes: values.notes?.trim() ? values.notes.trim() : null,
          occurredOn: values.occurredOn,
          status: values.status,
          tagIds: values.tagIds,
        };

    const result = isEdit
      ? await updateTransaction({ workspaceId, id: transaction!.id, body })
          .unwrap()
          .catch(() => null)
      : await createTransaction({ workspaceId, body: body as TransactionInput })
          .unwrap()
          .catch(() => null);

    if (!result) return;
    showToast({ message: t(isEdit ? 'transactions.updatedToast' : 'transactions.createdToast'), severity: 'success' });
    onClose();
  });

  const title = isTransfer ? t('transactions.editTransferTitle') : isEdit ? t('transactions.editTitle') : t('transactions.newTitle');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={3}>
            {error ? (
              <Alert severity="error">{getApiErrorMessage(error, t('transactions.saveFailed'))}</Alert>
            ) : null}

            <FormSection label={t('formSections.details')}>
              {isTransfer ? (
                <Alert severity="info">
                  {transaction?.accountName
                    ? t('transactions.transferLegNoticeOn', { account: transaction.accountName })
                    : t('transactions.transferLegNotice')}
                </Alert>
              ) : (
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={type}
                  disabled={isEdit}
                  onChange={(_e, value: 'income' | 'expense' | null) => value && setValue('type', value)}
                >
                  {TRANSACTION_TYPES.map((option) => (
                    <ToggleButton key={option} value={option}>
                      {option === 'income' ? t('common.income') : t('common.expense')}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}

              {/*
                The amount leads, because it is what the dialog is about. It was a
                half-width field set at the same size as "Merchant", which put the
                one figure the row exists to record on a level with its optional
                notes. The direction control above tints it and the account below
                denominates it.
              */}
              {isTransfer ? null : (
                <AmountHero
                  label={t('common.amount')}
                  currency={currency}
                  tone={type === 'income' ? 'positive' : 'negative'}
                  autoFocus={!isEdit}
                  value={watch('amount')}
                  onChange={(next) => setValue('amount', next, { shouldDirty: true })}
                  error={Boolean(errors.amount)}
                  helperText={fieldMessage(errors.amount?.message)}
                />
              )}

              <Grid container spacing={2}>
                {isTransfer ? null : (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      label={t('common.account')}
                      fullWidth
                      error={Boolean(errors.accountId)}
                      helperText={fieldMessage(errors.accountId?.message)}
                      value={watch('accountId')}
                      {...register('accountId')}
                    >
                      {(accounts.data?.accounts ?? []).map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          {account.name} · {account.currency}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: isTransfer ? 12 : 6 }}>
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
            </FormSection>

            <FormSection label={t('formSections.classification')}>
              <TextField
                label={t('common.description')}
                autoFocus={isEdit || isTransfer}
                fullWidth
                error={Boolean(errors.description)}
                helperText={fieldMessage(errors.description?.message)}
                {...register('description')}
              />

              {isTransfer ? null : (
                <TextField
                  select
                  label={t('common.category')}
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(errors.categoryId)}
                  helperText={fieldMessage(errors.categoryId?.message)}
                  value={watch('categoryId')}
                  {...register('categoryId')}
                >
                  <MenuItem value="">{t('common.uncategorised')}</MenuItem>
                  {(categories.data?.categories ?? []).map((category) => (
                    <MenuItem key={category.id} value={category.id}>
                      {' '.repeat(category.depth * 2)}
                      {category.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label={t('common.merchant')}
                    placeholder={t('common.optional')}
                    fullWidth
                    error={Boolean(errors.merchant)}
                    helperText={fieldMessage(errors.merchant?.message)}
                    {...register('merchant')}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    label={t('common.status')}
                    fullWidth
                    error={Boolean(errors.status)}
                    helperText={fieldMessage(errors.status?.message)}
                    value={watch('status')}
                    {...register('status')}
                  >
                    {TRANSACTION_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {t(STATUS_LABEL_KEYS[status])}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>

              {/*
                Tags are an array, so this is controlled entirely through
                `watch`/`setValue` and never touches `register()` — the ref
                binding that trips MUI's `Select` on scalar fields cannot express
                a multiple selection at all.
              */}
              <FormControl fullWidth error={Boolean(errors.tagIds)}>
                <InputLabel id="transaction-tags-label" shrink>
                  {t('transactions.tags')}
                </InputLabel>
                <Select
                  multiple
                  displayEmpty
                  labelId="transaction-tags-label"
                  label={t('transactions.tags')}
                  value={selectedTagIds}
                  onChange={(event: SelectChangeEvent<string[]>) =>
                    setValue(
                      'tagIds',
                      typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value,
                      { shouldDirty: true },
                    )
                  }
                  renderValue={(selected) =>
                    selected.length === 0 ? (
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        {t('common.none')}
                      </Box>
                    ) : (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {selected.map((id) => {
                          const tag = tagList.find((t) => t.id === id);
                          return <Chip key={id} size="small" label={tag?.name ?? id} />;
                        })}
                      </Stack>
                    )
                  }
                >
                  {tagList.length === 0 ? (
                    <MenuItem disabled value="">
                      {t('transactions.noTagsYet')}
                    </MenuItem>
                  ) : null}
                  {tagList.map((tag) => (
                    <MenuItem key={tag.id} value={tag.id}>
                      <Checkbox size="small" checked={selectedTagIds.includes(tag.id)} />
                      <ListItemText primary={tag.name} />
                    </MenuItem>
                  ))}
                </Select>
                {errors.tagIds ? <FormHelperText>{errors.tagIds.message}</FormHelperText> : null}
              </FormControl>

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
            {isLoading ? t('common.saving') : isEdit ? t('common.saveChanges') : t('transactions.add')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
