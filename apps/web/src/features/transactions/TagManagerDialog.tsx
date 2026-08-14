import { zodResolver } from '@hookform/resolvers/zod';
import { DeleteIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateTagMutation, useDeleteTagMutation, useListTagsQuery } from '../../api/endpoints/tags';
import type { Tag, WorkspaceRole } from '../../api/types';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { canEdit } from '../../lib/permissions';
import { tagFormSchema, type TagFormValues } from './transactionSchemas';
import { useTranslation } from 'react-i18next';

interface TagManagerDialogProps {
  open: boolean;
  workspaceId: string;
  role: WorkspaceRole | undefined;
  onClose: () => void;
}

const EMPTY: TagFormValues = { name: '', color: '' };

/**
 * Creating and removing the workspace's tags.
 *
 * Kept out of the transaction form on purpose: assigning a tag and *managing*
 * the vocabulary of tags are different jobs, and mixing them makes it easy to
 * create a near-duplicate ("Groceries" beside "groceries") while filling in
 * something else. Tag names are unique per workspace case-insensitively, so the
 * server rejects that anyway — better to make the existing list visible first.
 */
export default function TagManagerDialog({
  open,
  workspaceId,
  role,
  onClose,
}: TagManagerDialogProps): ReactElement {
  const { t } = useTranslation();
  const { data, isLoading, error: listError } = useListTagsQuery(open ? workspaceId : skipToken);
  const [createTag, createState] = useCreateTagMutation();
  const [deleteTag, deleteState] = useDeleteTagMutation();
  const [deleting, setDeleting] = useState<Tag | undefined>(undefined);

  const editable = canEdit(role);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<TagFormValues>({ resolver: zodResolver(tagFormSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(createState.error))) {
      setError(field as keyof TagFormValues, { type: 'server', message });
    }
  }, [createState.error, setError]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await createTag({
      workspaceId,
      name: values.name,
      color: values.color?.trim() ? values.color.trim() : null,
    })
      .unwrap()
      .catch(() => null);

    if (!result) return;
    reset(EMPTY);
  });

  const handleDelete = async (): Promise<void> => {
    if (!deleting) return;
    const ok = await deleteTag({ workspaceId, id: deleting.id })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) setDeleting(undefined);
  };

  const tags = data?.tags ?? [];
  const error = createState.error ?? deleteState.error ?? listError;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('transactions.manageTags')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{getApiErrorMessage(error, t('transactions.tagsFailed'))}</Alert> : null}

          {editable ? (
            <form onSubmit={onSubmit} noValidate>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  label={t('transactions.newTag')}
                  size="small"
                  fullWidth
                  error={Boolean(errors.name)}
                  helperText={fieldMessage(errors.name?.message)}
                  {...register('name')}
                />
                <TextField
                  label={t('common.colour')}
                  type="color"
                  size="small"
                  sx={{ width: 84 }}
                  value={watch('color') || '#1f6feb'}
                  {...register('color')}
                />
                <Button type="submit" variant="contained" disabled={createState.isLoading} sx={{ mt: 0.25 }}>
                  {t('common.add')}
                </Button>
              </Stack>
            </form>
          ) : null}

          {isLoading ? (
            <Stack spacing={1}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={40} />
              ))}
            </Stack>
          ) : tags.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('transactions.noTagsExplainer')}
            </Typography>
          ) : (
            <List dense disablePadding>
              {tags.map((tag) => (
                <ListItem
                  key={tag.id}
                  disableGutters
                  secondaryAction={
                    editable ? (
                      <Tooltip title={t('transactions.deleteTag')}>
                        <IconButton edge="end" size="small" color="error" onClick={() => setDeleting(tag)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : undefined
                  }
                >
                  <Chip
                    size="small"
                    label={tag.name}
                    sx={{
                      mr: 1.5,
                      ...(tag.color ? { bgcolor: tag.color, color: 'common.white' } : {}),
                    }}
                  />
                  <ListItemText
                    primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                    primary={
                      tag.usageCount === undefined
                        ? ''
                        : `${tag.usageCount} transaction${tag.usageCount === 1 ? '' : 's'}`
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('transactions.deleteTag')}
        description={
          deleting?.usageCount
            ? `Delete "${deleting.name}"? It will be removed from ${deleting.usageCount} transaction${
                deleting.usageCount === 1 ? '' : 's'
              }. The transactions themselves are not affected.`
            : `Delete "${deleting?.name}"?`
        }
        confirmLabel={t('common.delete')}
        destructive
        loading={deleteState.isLoading}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(undefined)}
      />
    </Dialog>
  );
}
