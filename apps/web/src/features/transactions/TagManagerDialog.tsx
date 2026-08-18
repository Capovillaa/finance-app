import { zodResolver } from '@hookform/resolvers/zod';
import { DeleteIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
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
import ColorSwatchPicker from '../../components/ColorSwatchPicker';
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
 *
 * Four things were wrong with this dialog and they are worth naming, because
 * three of them are patterns rather than one-offs:
 *
 *  - The confirmation dialog was rendered **inside** the open `Dialog`. Both
 *    portal to the body, so it appeared, but MUI's parent modal keeps a focus
 *    trap and pulls focus back out of the child — so the confirmation opened
 *    without the keyboard following it. It is a sibling now.
 *  - Four strings were hardcoded English and stayed English in the other two
 *    languages: the "Done" button, the usage count, and both branches of the
 *    delete confirmation. `check:i18n` cannot see this class of bug — it
 *    verifies that the keys a `t()` call names exist, and a string that never
 *    calls `t()` names nothing.
 *  - The colour input was an `<input type="color">` wired to react-hook-form,
 *    which stalls under a drag for the reason `ColorSwatchPicker` documents.
 *  - The Add button was nudged with a hardcoded `mt` that only lined up while
 *    the field beneath it had no helper text, so the row broke apart the moment
 *    a validation message appeared. It is pinned to the field's own height.
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
    setValue,
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
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>{t('transactions.manageTags')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5}>
            {error ? (
              <Alert severity="error">{getApiErrorMessage(error, t('transactions.tagsFailed'))}</Alert>
            ) : null}

            {editable ? (
              <Stack component="form" onSubmit={onSubmit} noValidate spacing={2}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <TextField
                    label={t('transactions.newTag')}
                    size="small"
                    fullWidth
                    error={Boolean(errors.name)}
                    helperText={fieldMessage(errors.name?.message)}
                    {...register('name')}
                  />
                  {/*
                    Pinned to the field's own height rather than nudged with a
                    margin: helper text grows the field downward, and a margin
                    tuned to the no-error case drifts the moment there is one.
                  */}
                  <Button type="submit" variant="contained" disabled={createState.isLoading} sx={{ height: 40, flexShrink: 0 }}>
                    {t('common.add')}
                  </Button>
                </Stack>

                <ColorSwatchPicker
                  label={t('common.colour')}
                  value={watch('color') ?? ''}
                  onChange={(next) => setValue('color', next, { shouldDirty: true })}
                  error={Boolean(errors.color)}
                  helperText={fieldMessage(errors.color?.message)}
                />
              </Stack>
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
              <Box>
                {tags.map((tag) => (
                  <Stack
                    key={tag.id}
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{
                      py: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-of-type': { borderBottom: 0 },
                    }}
                  >
                    <Chip
                      size="small"
                      label={tag.name}
                      sx={tag.color ? { bgcolor: tag.color, color: 'common.white' } : undefined}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    {tag.usageCount === undefined ? null : (
                      <Typography variant="amount" color="text.secondary">
                        {t('transactions.count', { count: tag.usageCount })}
                      </Typography>
                    )}
                    {editable ? (
                      <Tooltip title={t('transactions.deleteTag')}>
                        <IconButton size="small" color="error" onClick={() => setDeleting(tag)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </Stack>
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>{t('common.done')}</Button>
        </DialogActions>
      </Dialog>

      {/*
        A sibling of the dialog above, not a child of it — see the note on the
        component. Rendering it inside left the parent's focus trap fighting it.
      */}
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('transactions.deleteTag')}
        description={
          deleting?.usageCount
            ? t('transactions.deleteTagUsed', { name: deleting.name, count: deleting.usageCount })
            : t('transactions.deleteTagUnused', { name: deleting?.name ?? '' })
        }
        confirmLabel={t('common.delete')}
        destructive
        loading={deleteState.isLoading}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(undefined)}
      />
    </>
  );
}
