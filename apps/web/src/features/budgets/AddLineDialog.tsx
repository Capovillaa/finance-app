import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useListCategoriesQuery } from '../../api/endpoints/categories';
import { useUpsertBudgetLineMutation } from '../../api/endpoints/budgets';
import { getApiErrorMessage } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { addLineSchema, emptyBudgetLine, type AddLineValues } from './budgetSchemas';
import { useTranslation } from 'react-i18next';

interface AddLineDialogProps {
  open: boolean;
  workspaceId: string;
  budgetId: string;
  existingCategoryIds: string[];
  onClose: () => void;
}

export default function AddLineDialog({
  open,
  workspaceId,
  budgetId,
  existingCategoryIds,
  onClose,
}: AddLineDialogProps): ReactElement {
  const { t } = useTranslation();
  const [upsertLine, { isLoading, error }] = useUpsertBudgetLineMutation();
  const categories = useListCategoriesQuery(open ? { workspaceId, kind: 'expense' } : skipToken);
  const available = (categories.data?.categories ?? []).filter((c) => !existingCategoryIds.includes(c.id));

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<AddLineValues>({
    resolver: zodResolver(addLineSchema),
    defaultValues: emptyBudgetLine(),
  });

  useEffect(() => {
    if (open) reset(emptyBudgetLine());
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await upsertLine({
      workspaceId,
      id: budgetId,
      body: {
        categoryId: values.categoryId,
        limitAmount: values.limitAmount,
        includeSubcategories: values.includeSubcategories,
        alertThresholdPercent: values.alertThresholdPercent ? Number(values.alertThresholdPercent) : undefined,
      },
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('budgets.addCategoryLimit')}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {error ? <Alert severity="error">{getApiErrorMessage(error, t('budgets.addLineFailed'))}</Alert> : null}

            <TextField
              select
              label={t('common.category')}
              autoFocus
              fullWidth
              error={Boolean(errors.categoryId)}
              helperText={fieldMessage(errors.categoryId?.message)}
              value={watch('categoryId')}
              {...register('categoryId')}
            >
              {available.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {' '.repeat(category.depth * 2)}
                  {category.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label={t('budgets.limit')}
              fullWidth
              error={Boolean(errors.limitAmount)}
              helperText={fieldMessage(errors.limitAmount?.message)}
              {...register('limitAmount')}
            />

            <TextField
              label={t('budgets.alertAt')}
              fullWidth
              error={Boolean(errors.alertThresholdPercent)}
              helperText={fieldMessage(errors.alertThresholdPercent?.message) ?? t('budgets.alertAtHint')}
              {...register('alertThresholdPercent')}
            />

            <FormControlLabel
              control={<Checkbox defaultChecked {...register('includeSubcategories')} />}
              label={t('budgets.includeSubcategories')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? t('common.adding') : 'Add'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
