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
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useListAccountsQuery } from '../../api/endpoints/accounts';
import type { GoalInput, UpdateGoalInput } from '../../api/endpoints/goals';
import { useCreateGoalMutation, useUpdateGoalMutation } from '../../api/endpoints/goals';
import type { Goal } from '../../api/types';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { COMMON_CURRENCIES } from '../../lib/currencies';
import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABEL_KEYS,
  defaultGoalFormValues,
  goalFormSchema,
  type GoalFormValues,
} from './goalSchemas';

interface GoalFormDialogProps {
  open: boolean;
  workspaceId: string;
  currency: string;
  goal?: Goal;
  onClose: () => void;
}

function toFormValues(goal: Goal | undefined, currency: string): GoalFormValues {
  if (!goal) return defaultGoalFormValues(currency);
  return {
    name: goal.name,
    description: goal.description ?? '',
    category: goal.category,
    targetAmount: goal.targetAmount,
    currency: goal.currency,
    targetDate: goal.targetDate ?? '',
    accountId: goal.accountId ?? '',
    priority: String(goal.priority),
    color: goal.color ?? '',
  };
}

/** Category and currency are fixed at creation — the update schema omits both. */
export default function GoalFormDialog({ open, workspaceId, currency, goal, onClose }: GoalFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const isEdit = Boolean(goal);
  const [createGoal, createState] = useCreateGoalMutation();
  const [updateGoal, updateState] = useUpdateGoalMutation();
  const { isLoading } = isEdit ? updateState : createState;
  const error = isEdit ? updateState.error : createState.error;
  const accounts = useListAccountsQuery(open ? { workspaceId } : skipToken);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: toFormValues(goal, currency),
  });

  useEffect(() => {
    if (open) reset(toFormValues(goal, currency));
  }, [open, goal, currency, reset]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof GoalFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const onSubmit = handleSubmit(async (values) => {
    const shared = {
      name: values.name.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
      targetAmount: values.targetAmount,
      targetDate: values.targetDate?.trim() ? values.targetDate.trim() : null,
      accountId: values.accountId?.trim() ? values.accountId.trim() : null,
      priority: Number(values.priority),
      color: values.color?.trim() ? values.color.trim() : null,
    };

    const result = isEdit
      ? await updateGoal({ workspaceId, id: goal!.id, body: shared satisfies UpdateGoalInput })
          .unwrap()
          .catch(() => null)
      : await createGoal({
          workspaceId,
          body: { ...shared, category: values.category, currency: values.currency } satisfies GoalInput,
        })
          .unwrap()
          .catch(() => null);

    if (!result) return;
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? t('goals.editTitle') : t('goals.newTitle')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {error ? <Alert severity="error">{getApiErrorMessage(error, t('goals.saveFailed'))}</Alert> : null}

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
                  label={t('common.category')}
                  fullWidth
                  disabled={isEdit}
                  helperText={isEdit ? t('accounts.fixedAfterCreate') : fieldMessage(errors.category?.message)}
                  value={watch('category')}
                  {...register('category')}
                >
                  {GOAL_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {t(GOAL_CATEGORY_LABEL_KEYS[c])}
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

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={t('goals.targetAmount')}
                  fullWidth
                  error={Boolean(errors.targetAmount)}
                  helperText={fieldMessage(errors.targetAmount?.message)}
                  {...register('targetAmount')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={t('goals.targetDate')}
                  type="date"
                  placeholder={t('common.optional')}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(errors.targetDate)}
                  helperText={fieldMessage(errors.targetDate?.message)}
                  {...register('targetDate')}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label={t('goals.linkedAccount')}
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                  helperText={t('goals.linkedAccountHint')}
                  value={watch('accountId')}
                  {...register('accountId')}
                >
                  <MenuItem value="">None</MenuItem>
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
                  label={t('goals.priority')}
                  fullWidth
                  error={Boolean(errors.priority)}
                  helperText={fieldMessage(errors.priority?.message) ?? '1 = highest'}
                  value={watch('priority')}
                  {...register('priority')}
                >
                  {[1, 2, 3, 4, 5].map((p) => (
                    <MenuItem key={p} value={String(p)}>
                      {p}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <TextField
              label={t('common.description')}
              placeholder={t('common.optional')}
              multiline
              minRows={2}
              fullWidth
              error={Boolean(errors.description)}
              helperText={fieldMessage(errors.description?.message)}
              {...register('description')}
            />

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
            {isLoading ? t('common.saving') : isEdit ? t('common.saveChanges') : t('goals.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
