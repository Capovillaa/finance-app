import { zodResolver } from '@hookform/resolvers/zod';
import { DeleteIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import {
  useAddContributionMutation,
  useDeleteContributionMutation,
  useGetGoalQuery,
} from '../../api/endpoints/goals';
import { getApiErrorMessage } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { formatDate, formatMoney, todayIso } from '../../lib/format';
import { canEdit } from '../../lib/permissions';
import type { WorkspaceRole } from '../../api/types';
import { contributionFormSchema, type ContributionFormValues } from './goalSchemas';
import { useTranslation } from 'react-i18next';

interface ContributionsDialogProps {
  open: boolean;
  workspaceId: string;
  goalId: string | undefined;
  role: WorkspaceRole | undefined;
  onClose: () => void;
}

export default function ContributionsDialog({ open, workspaceId, goalId, role, onClose }: ContributionsDialogProps): ReactElement {
  const { t } = useTranslation();
  const { data } = useGetGoalQuery(open && goalId ? { workspaceId, id: goalId } : skipToken);
  const [addContribution, { isLoading: adding, error }] = useAddContributionMutation();
  const [deleteContribution] = useDeleteContributionMutation();
  const editable = canEdit(role);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionFormSchema),
    defaultValues: { amount: '', occurredOn: todayIso(), note: '' },
  });

  useEffect(() => {
    if (open) reset({ amount: '', occurredOn: todayIso(), note: '' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!goalId) return;
    const result = await addContribution({
      workspaceId,
      id: goalId,
      body: { amount: values.amount, occurredOn: values.occurredOn, note: values.note?.trim() ? values.note.trim() : null },
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;
    reset({ amount: '', occurredOn: todayIso(), note: '' });
  });

  const currency = data?.goal.currency ?? 'USD';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {t('goals.contributions')}
        {data ? ` — ${data.goal.name}` : ''}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {editable ? (
            <form onSubmit={onSubmit} noValidate>
              <Stack spacing={1.5}>
                {error ? <Alert severity="error">{getApiErrorMessage(error, t('goals.contributionFailed'))}</Alert> : null}

                <Grid container spacing={1.5}>
                  <Grid size={6}>
                    <TextField
                      label={t('common.amount')}
                      size="small"
                      fullWidth
                      error={Boolean(errors.amount)}
                      helperText={fieldMessage(errors.amount?.message)}
                      {...register('amount')}
                    />
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      label={t('common.date')}
                      type="date"
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      error={Boolean(errors.occurredOn)}
                      helperText={fieldMessage(errors.occurredOn?.message)}
                      {...register('occurredOn')}
                    />
                  </Grid>
                </Grid>
                <TextField
                  label={t('goals.note')}
                  placeholder={t('common.optional')}
                  size="small"
                  fullWidth
                  error={Boolean(errors.note)}
                  helperText={fieldMessage(errors.note?.message)}
                  {...register('note')}
                />
                <Button type="submit" variant="contained" disabled={adding} size="small">
                  {adding ? t('common.adding') : t('goals.addContribution')}
                </Button>
              </Stack>
            </form>
          ) : null}

          <Divider />

          {(data?.contributions.length ?? 0) === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('goals.noContributions')}
            </Typography>
          ) : (
            <List dense disablePadding>
              {data!.contributions.map((c) => (
                <ListItem
                  key={c.id}
                  disableGutters
                  secondaryAction={
                    editable ? (
                      <IconButton
                        size="small"
                        edge="end"
                        aria-label={t('goals.deleteContribution')}
                        onClick={() => goalId && void deleteContribution({ workspaceId, id: goalId, contributionId: c.id })}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    ) : undefined
                  }
                >
                  <ListItemText
                    primary={formatMoney(c.amount, currency)}
                    secondary={`${formatDate(c.occurredOn)}${c.note ? ` · ${c.note}` : ''}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
