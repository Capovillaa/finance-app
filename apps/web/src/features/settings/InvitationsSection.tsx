import { zodResolver } from '@hookform/resolvers/zod';
import { CloseIcon, SendIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import {
  useCreateInvitationMutation,
  useListInvitationsQuery,
  useRevokeInvitationMutation,
} from '../../api/endpoints/workspaces';
import type { WorkspaceInvitation } from '../../api/types';
import { getApiErrorMessage, getFieldErrors } from '../../lib/apiError';
import { fieldMessage } from '../../lib/validation';
import { formatDate } from '../../lib/format';
import { GRANTABLE_ROLES, ROLE_LABEL_KEYS, inviteFormSchema, type InviteFormValues } from './settingsSchemas';

interface InvitationsSectionProps {
  /** Admin-gated: the list endpoint itself requires admin, so the page hides this entirely otherwise. */
  workspaceId: string;
}

const STATUS_COLOR: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  accepted: 'success',
  revoked: 'default',
  expired: 'error',
};

const EMPTY: InviteFormValues = { email: '', role: 'editor' };

/** Only a pending invitation can still be withdrawn. */
function isRevocable(invitation: WorkspaceInvitation): boolean {
  return invitation.status === 'pending';
}

/**
 * Pending invitations, and the form that creates them.
 *
 * The acceptance link is emailed and never returned to this screen, so there is
 * deliberately no "copy link" action — the token exists in exactly one place,
 * which is what stops an admin from handing out a seat out of band.
 */
export default function InvitationsSection({ workspaceId }: InvitationsSectionProps): ReactElement {
  const { t } = useTranslation();
  const { data, isLoading, error: listError } = useListInvitationsQuery(workspaceId);
  const [createInvitation, createState] = useCreateInvitationMutation();
  const [revokeInvitation, revokeState] = useRevokeInvitationMutation();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    for (const [field, message] of Object.entries(getFieldErrors(createState.error))) {
      setError(field as keyof InviteFormValues, { type: 'server', message });
    }
  }, [createState.error, setError]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await createInvitation({ workspaceId, email: values.email, role: values.role })
      .unwrap()
      .catch(() => null);

    if (!result) return;
    reset(EMPTY);
  });

  const invitations = data?.invitations ?? [];
  const error = createState.error ?? revokeState.error ?? listError;

  return (
    <Card>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h3">{t('settings.invitations')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('settings.inviteExplainer')}
            </Typography>
          </Stack>

          {error ? <Alert severity="error">{getApiErrorMessage(error, t('settings.inviteFailed'))}</Alert> : null}

          <form onSubmit={onSubmit} noValidate>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr auto' },
                alignItems: 'start',
              }}
            >
              <TextField
                label={t('settings.emailAddress')}
                type="email"
                size="small"
                fullWidth
                error={Boolean(errors.email)}
                helperText={fieldMessage(errors.email?.message)}
                {...register('email')}
              />

              <TextField
                select
                label={t('settings.role.label')}
                size="small"
                fullWidth
                error={Boolean(errors.role)}
                helperText={fieldMessage(errors.role?.message)}
                value={watch('role')}
                {...register('role')}
              >
                {GRANTABLE_ROLES.map((role) => (
                  <MenuItem key={role} value={role}>
                    {t(ROLE_LABEL_KEYS[role])}
                  </MenuItem>
                ))}
              </TextField>

              <Button
                type="submit"
                variant="contained"
                startIcon={<SendIcon />}
                disabled={createState.isLoading}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {createState.isLoading ? t('settings.sending') : t('settings.invite')}
              </Button>
            </Box>
          </form>

          {isLoading ? (
            <Stack spacing={1}>
              {[0, 1].map((i) => (
                <Skeleton key={i} variant="rounded" height={40} />
              ))}
            </Stack>
          ) : invitations.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('settings.noInvitations')}
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>{t('settings.role.label')}</TableCell>
                  <TableCell>{t('common.status')}</TableCell>
                  <TableCell>Invited by</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>{t(ROLE_LABEL_KEYS[invitation.role])}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={invitation.status}
                        color={STATUS_COLOR[invitation.status] ?? 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {invitation.invitedByName ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(invitation.expiresAt.slice(0, 10))}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {isRevocable(invitation) ? (
                        <Tooltip title={t('settings.revokeInvitation')}>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={revokeState.isLoading}
                            onClick={() => void revokeInvitation({ workspaceId, invitationId: invitation.id })}
                            aria-label={`Revoke the invitation for ${invitation.email}`}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
