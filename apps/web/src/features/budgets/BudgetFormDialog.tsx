import { zodResolver } from '@hookform/resolvers/zod';
import { AddIcon, DeleteIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateBudgetMutation } from '../../api/endpoints/budgets';
import { useListCategoriesQuery } from '../../api/endpoints/categories';
import { getApiErrorMessage } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { todayIso } from '../../lib/format';
import { BUDGET_PERIODS, BUDGET_PERIOD_LABEL_KEYS, budgetFormSchema, defaultBudgetFormValues, emptyBudgetLine, type BudgetFormValues } from './budgetSchemas';

interface BudgetFormDialogProps {
  open: boolean;
  workspaceId: string;
  currency: string;
  onClose: () => void;
}

/**
 * Create only — editing an existing budget's name/rollover happens through
 * `BudgetSettingsDialog`, and its lines through `AddLineDialog` /
 * `ReviseLineDialog`. The line-array shape a create needs (many lines at
 * once) is different enough from a single-line upsert that sharing one form
 * would make both harder to read.
 */
export default function BudgetFormDialog({ open, workspaceId, currency, onClose }: BudgetFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [createBudget, { isLoading, error }] = useCreateBudgetMutation();
  const categories = useListCategoriesQuery(open ? { workspaceId, kind: 'expense' } : skipToken);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: defaultBudgetFormValues(currency, todayIso()),
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const period = watch('period');

  useEffect(() => {
    if (open) reset(defaultBudgetFormValues(currency, todayIso()));
  }, [open, currency, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await createBudget({
      workspaceId,
      body: {
        name: values.name.trim(),
        period: values.period,
        startDate: values.startDate,
        endDate: values.period === 'custom' ? values.endDate : undefined,
        currency: values.currency,
        rollover: values.rollover,
        lines: values.lines.map((line) => ({
          categoryId: line.categoryId,
          limitAmount: line.limitAmount,
          includeSubcategories: line.includeSubcategories,
          alertThresholdPercent: line.alertThresholdPercent ? Number(line.alertThresholdPercent) : undefined,
        })),
      },
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('budgets.newTitle')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {error ? <Alert severity="error">{getApiErrorMessage(error, t('budgets.createFailed'))}</Alert> : null}

            <TextField
              label={t('common.name')}
              autoFocus
              fullWidth
              error={Boolean(errors.name)}
              helperText={fieldMessage(errors.name?.message)}
              {...register('name')}
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField select label={t('budgets.period.label')} fullWidth value={period} {...register('period')}>
                  {BUDGET_PERIODS.map((p) => (
                    <MenuItem key={p} value={p}>
                      {t(BUDGET_PERIOD_LABEL_KEYS[p])}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label={period === 'custom' ? t('budgets.startDate') : t('budgets.startDateHint')}
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(errors.startDate)}
                  helperText={fieldMessage(errors.startDate?.message)}
                  {...register('startDate')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label={t('budgets.endDate')}
                  type="date"
                  fullWidth
                  disabled={period !== 'custom'}
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(errors.endDate)}
                  helperText={fieldMessage(errors.endDate?.message)}
                  {...register('endDate')}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={t('common.currency')}
                  fullWidth
                  error={Boolean(errors.currency)}
                  helperText={fieldMessage(errors.currency?.message) ?? t('budgets.currencyHint')}
                  {...register('currency')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControlLabel control={<Checkbox {...register('rollover')} />} label={t('budgets.rolloverLabel')} />
              </Grid>
            </Grid>

            <Divider />

            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h3">Category limits</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => append(emptyBudgetLine())}>
                  {t('budgets.addLine')}
                </Button>
              </Stack>
              {errors.lines?.message ? (
                <Alert severity="error">{fieldMessage(errors.lines.message)}</Alert>
              ) : null}

              {fields.map((field, index) => (
                <Grid container spacing={1.5} alignItems="flex-start" key={field.id}>
                  <Grid size={{ xs: 12, sm: 5 }}>
                    <TextField
                      select
                      label={t('common.category')}
                      fullWidth
                      size="small"
                      error={Boolean(errors.lines?.[index]?.categoryId)}
                      helperText={errors.lines?.[index]?.categoryId?.message}
                      value={watch(`lines.${index}.categoryId`)}
                      {...register(`lines.${index}.categoryId`)}
                    >
                      {(categories.data?.categories ?? []).map((category) => (
                        <MenuItem key={category.id} value={category.id}>
                          {' '.repeat(category.depth * 2)}
                          {category.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 8, sm: 3 }}>
                    <TextField
                      label={t('budgets.limit')}
                      fullWidth
                      size="small"
                      error={Boolean(errors.lines?.[index]?.limitAmount)}
                      helperText={errors.lines?.[index]?.limitAmount?.message}
                      {...register(`lines.${index}.limitAmount`)}
                    />
                  </Grid>
                  <Grid size={{ xs: 4, sm: 3 }}>
                    <TextField
                      label={t('budgets.alertAt')}
                      fullWidth
                      size="small"
                      error={Boolean(errors.lines?.[index]?.alertThresholdPercent)}
                      helperText={errors.lines?.[index]?.alertThresholdPercent?.message}
                      {...register(`lines.${index}.alertThresholdPercent`)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 1 }}>
                    <IconButton
                      size="small"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label={t('budgets.removeLine')}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? t('common.creating') : t('budgets.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
