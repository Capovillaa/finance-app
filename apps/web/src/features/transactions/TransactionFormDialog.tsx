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
    onClose();
  });

  const title = isTransfer ? t('transactions.editTransferTitle') : isEdit ? t('transactions.editTitle') : t('transactions.newTitle');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {error ? (
              <Alert severity="error">{getApiErrorMessage(error, t('transactions.saveFailed'))}</Alert>
            ) : null}

            {isTransfer ? (
              <Alert severity="info">
                This is one leg of a transfer{transaction?.accountName ? ` on ${transaction.accountName}` : ''}. Its
                accounts, amount and category are fixed — delete the transfer and create it again to change those.
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

            <Grid container spacing={2}>
              {isTransfer ? null : (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label={t('common.amount')}
                    placeholder="0.00"
                    fullWidth
                    error={Boolean(errors.amount)}
                    helperText={fieldMessage(errors.amount?.message)}
                    {...register('amount')}
                  />
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

            <TextField
              label={t('common.description')}
              autoFocus
              fullWidth
              error={Boolean(errors.description)}
              helperText={fieldMessage(errors.description?.message)}
              {...register('description')}
            />

            {isTransfer ? null : (
              <Grid container spacing={2}>
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
                        {account.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
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
                    <MenuItem value="">Uncategorised</MenuItem>
                    {(categories.data?.categories ?? []).map((category) => (
                      <MenuItem key={category.id} value={category.id}>
                        {' '.repeat(category.depth * 2)}
                        {category.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
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
                      {status[0]!.toUpperCase() + status.slice(1)}
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
