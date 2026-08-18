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
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid2';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useListAccountsQuery } from '../../api/endpoints/accounts';
import { useListCategoriesQuery } from '../../api/endpoints/categories';
import type { RecurringInput, UpdateRecurringInput } from '../../api/endpoints/recurring';
import { useCreateRecurringMutation, useUpdateRecurringMutation } from '../../api/endpoints/recurring';
import type { RecurringTransaction } from '../../api/types';
import FormSection from '../../components/FormSection';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { appLocale, todayIso } from '../../lib/format';
import {
  FREQUENCY_LABEL_KEYS,
  RECURRING_FREQUENCIES,
  weekdayLabels,
  defaultRecurringFormValues,
  recurringFormSchema,
  type RecurringFormValues,
} from './recurringSchemas';

interface RecurringFormDialogProps {
  open: boolean;
  workspaceId: string;
  recurring?: RecurringTransaction;
  defaultAccountId?: string;
  onClose: () => void;
}

function toFormValues(recurring: RecurringTransaction | undefined, defaultAccountId: string): RecurringFormValues {
  if (!recurring) return defaultRecurringFormValues(defaultAccountId, todayIso());
  return {
    name: recurring.name,
    accountId: recurring.accountId,
    categoryId: recurring.categoryId ?? '',
    type: recurring.type,
    // The API returns the signed, stored amount (negative for expenses), but
    // the create/update input — and this form field — takes a positive
    // magnitude and derives the sign from `type` itself.
    amount: recurring.amount.trimStart().startsWith('-') ? recurring.amount.slice(1) : recurring.amount,
    description: recurring.description,
    merchant: recurring.merchant ?? '',
    frequency: recurring.frequency,
    intervalCount: String(recurring.intervalCount),
    byWeekday: recurring.byWeekday ?? [],
    dayOfMonth: recurring.dayOfMonth === null ? '' : String(recurring.dayOfMonth),
    monthOfYear: recurring.monthOfYear === null ? '' : String(recurring.monthOfYear),
    startDate: recurring.startDate,
    endDate: recurring.endDate ?? '',
    occurrenceLimit: recurring.occurrenceLimit === null ? '' : String(recurring.occurrenceLimit),
    autoPost: recurring.autoPost,
    leadTimeDays: String(recurring.leadTimeDays),
  };
}

/**
 * The schedule (frequency, weekday, day-of-month, start date) can only be set
 * at creation — editing shows those fields read-only, since the server's PATCH
 * schema has no way to change them short of deleting and recreating.
 */
export default function RecurringFormDialog({
  open,
  workspaceId,
  recurring,
  defaultAccountId,
  onClose,
}: RecurringFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const isEdit = Boolean(recurring);
  const [createRecurring, createState] = useCreateRecurringMutation();
  const [updateRecurring, updateState] = useUpdateRecurringMutation();
  const { isLoading } = isEdit ? updateState : createState;
  const error = isEdit ? updateState.error : createState.error;
  const accounts = useListAccountsQuery(open ? { workspaceId } : skipToken);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    formState: { errors },
  } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: toFormValues(recurring, defaultAccountId ?? ''),
  });

  useEffect(() => {
    if (open) reset(toFormValues(recurring, defaultAccountId ?? accounts.data?.accounts[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recurring]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(error))) {
      setError(field as keyof RecurringFormValues, { type: 'server', message });
    }
  }, [error, setError]);

  const type = watch('type');
  const frequency = watch('frequency');
  const byWeekday = watch('byWeekday');
  const categories = useListCategoriesQuery(open ? { workspaceId, kind: type } : skipToken);

  const toggleWeekday = (day: number): void => {
    setValue('byWeekday', byWeekday.includes(day) ? byWeekday.filter((d) => d !== day) : [...byWeekday, day].sort());
  };

  const onSubmit = handleSubmit(async (values) => {
    if (isEdit) {
      const body: UpdateRecurringInput = {
        name: values.name.trim(),
        amount: values.amount,
        description: values.description.trim(),
        merchant: values.merchant?.trim() ? values.merchant.trim() : null,
        categoryId: values.categoryId || null,
        endDate: values.endDate?.trim() ? values.endDate.trim() : null,
        autoPost: values.autoPost,
        leadTimeDays: values.leadTimeDays ? Number(values.leadTimeDays) : undefined,
      };
      const result = await updateRecurring({ workspaceId, id: recurring!.id, body }).unwrap().catch(() => null);
      if (!result) return;
      onClose();
      return;
    }

    const body: RecurringInput = {
      accountId: values.accountId,
      categoryId: values.categoryId || null,
      name: values.name.trim(),
      type: values.type,
      amount: values.amount,
      description: values.description.trim(),
      merchant: values.merchant?.trim() ? values.merchant.trim() : null,
      frequency: values.frequency,
      intervalCount: values.frequency === 'custom' ? Number(values.intervalCount) : undefined,
      byWeekday: values.frequency === 'weekly' ? values.byWeekday : undefined,
      dayOfMonth: values.frequency === 'monthly' || values.frequency === 'yearly' ? Number(values.dayOfMonth) || null : undefined,
      monthOfYear: values.frequency === 'yearly' ? Number(values.monthOfYear) : undefined,
      startDate: values.startDate,
      endDate: values.endDate?.trim() ? values.endDate.trim() : undefined,
      occurrenceLimit: values.occurrenceLimit ? Number(values.occurrenceLimit) : undefined,
      autoPost: values.autoPost,
      leadTimeDays: values.leadTimeDays ? Number(values.leadTimeDays) : undefined,
    };

    const result = await createRecurring({ workspaceId, body }).unwrap().catch(() => null);
    if (!result) return;
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? t('recurring.editTitle') : t('recurring.newTitle')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={3}>
            {error ? <Alert severity="error">{getApiErrorMessage(error, t('recurring.saveFailed'))}</Alert> : null}

            <FormSection label={t('formSections.details')}>
              <TextField
                label={t('common.name')}
                autoFocus
                fullWidth
                error={Boolean(errors.name)}
                helperText={fieldMessage(errors.name?.message)}
                {...register('name')}
              />

              <ToggleButtonGroup
                exclusive
                fullWidth
                value={type}
                disabled={isEdit}
                onChange={(_e, value: 'income' | 'expense' | null) => value && setValue('type', value)}
              >
                <ToggleButton value="income">Income</ToggleButton>
                <ToggleButton value="expense">Expense</ToggleButton>
              </ToggleButtonGroup>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label={t('common.amount')}
                    fullWidth
                    error={Boolean(errors.amount)}
                    helperText={fieldMessage(errors.amount?.message)}
                    {...register('amount')}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    label={t('common.account')}
                    fullWidth
                    disabled={isEdit}
                    error={Boolean(errors.accountId)}
                    helperText={isEdit ? t('accounts.fixedAfterCreate') : fieldMessage(errors.accountId?.message)}
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
              </Grid>
            </FormSection>

            <FormSection label={t('formSections.classification')}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    label={t('common.category')}
                    fullWidth
                    SelectProps={{ displayEmpty: true }}
                    InputLabelProps={{ shrink: true }}
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
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label={t('common.merchant')} placeholder={t('common.optional')} fullWidth {...register('merchant')} />
                </Grid>
              </Grid>

              <TextField
                label={t('common.description')}
                fullWidth
                error={Boolean(errors.description)}
                helperText={fieldMessage(errors.description?.message)}
                {...register('description')}
              />
            </FormSection>

            <FormSection label={t('formSections.recurrence')}>
              {!isEdit ? (
                <>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: frequency === 'monthly' ? 6 : 12 }}>
                      <TextField select label={t('recurring.repeats')} fullWidth value={frequency} {...register('frequency')}>
                        {RECURRING_FREQUENCIES.map((f) => (
                          <MenuItem key={f} value={f}>
                            {t(FREQUENCY_LABEL_KEYS[f])}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    {frequency === 'monthly' ? (
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label={t('recurring.dayOfMonth')}
                          fullWidth
                          error={Boolean(errors.dayOfMonth)}
                          helperText={fieldMessage(errors.dayOfMonth?.message)}
                          {...register('dayOfMonth')}
                        />
                      </Grid>
                    ) : null}
                  </Grid>

                  {frequency === 'custom' ? (
                    <TextField
                      label={t('recurring.everyNDays')}
                      fullWidth
                      error={Boolean(errors.intervalCount)}
                      helperText={fieldMessage(errors.intervalCount?.message)}
                      {...register('intervalCount')}
                    />
                  ) : null}

                  {frequency === 'weekly' ? (
                    <Stack spacing={0.75}>
                      <Typography variant="body2">On these days</Typography>
                      <FormGroup row>
                        {weekdayLabels(appLocale()).map((label: string, day: number) => (
                          <Chip
                            key={day}
                            label={label}
                            size="small"
                            onClick={() => toggleWeekday(day)}
                            color={byWeekday.includes(day) ? 'primary' : 'default'}
                            variant={byWeekday.includes(day) ? 'filled' : 'outlined'}
                            sx={{ mr: 0.75, mb: 0.75 }}
                          />
                        ))}
                      </FormGroup>
                      {errors.byWeekday?.message ? (
                        <Typography variant="caption" color="error">
                          {fieldMessage(errors.byWeekday.message)}
                        </Typography>
                      ) : null}
                    </Stack>
                  ) : null}

                  {frequency === 'yearly' ? (
                    <Grid container spacing={2}>
                      <Grid size={6}>
                        <TextField
                          select
                          label={t('recurring.month')}
                          fullWidth
                          error={Boolean(errors.monthOfYear)}
                          helperText={fieldMessage(errors.monthOfYear?.message)}
                          value={watch('monthOfYear')}
                          {...register('monthOfYear')}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <MenuItem key={m} value={String(m)}>
                              {new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'long' })}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid size={6}>
                        <TextField
                          label={t('recurring.dayOfMonth')}
                          fullWidth
                          error={Boolean(errors.dayOfMonth)}
                          helperText={fieldMessage(errors.dayOfMonth?.message)}
                          {...register('dayOfMonth')}
                        />
                      </Grid>
                    </Grid>
                  ) : null}

                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label={t('recurring.startDate')}
                        type="date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        error={Boolean(errors.startDate)}
                        helperText={fieldMessage(errors.startDate?.message)}
                        {...register('startDate')}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label={t('recurring.stopAfter')}
                        placeholder={t('common.optional')}
                        fullWidth
                        error={Boolean(errors.occurrenceLimit)}
                        helperText={fieldMessage(errors.occurrenceLimit?.message)}
                        {...register('occurrenceLimit')}
                      />
                    </Grid>
                  </Grid>
                </>
              ) : null}

              <TextField
                label={t('recurring.endDate')}
                type="date"
                placeholder={t('common.optional')}
                fullWidth
                InputLabelProps={{ shrink: true }}
                {...register('endDate')}
              />
            </FormSection>

            <FormSection label={t('formSections.automation')}>
              <Grid container spacing={2} alignItems="flex-start">
                <Grid size={{ xs: 12, sm: 6 }}>
                  {/*
                    The field beside this has a shrunk label sitting above its
                    box, which the checkbox has no equivalent of — centring the
                    row against the field's full height (label + box + helper
                    text) left the checkbox floating above the box rather than
                    beside it. This nudge puts the checkbox's own box at the
                    same height as the field's, matching the label's reserved
                    space instead of guessing at a shared centre.
                  */}
                  <Box sx={{ mt: '23px', display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <FormControlLabel control={<Checkbox {...register('autoPost')} />} label={t('recurring.postAutomatically')} />
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label={t('recurring.leadTime')}
                    fullWidth
                    helperText={fieldMessage(errors.leadTimeDays?.message) ?? t('recurring.leadTimeHint')}
                    error={Boolean(errors.leadTimeDays)}
                    {...register('leadTimeDays')}
                  />
                </Grid>
              </Grid>
            </FormSection>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? t('common.saving') : isEdit ? t('common.saveChanges') : t('recurring.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
