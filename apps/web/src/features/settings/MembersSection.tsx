import { PersonRemoveIcon, WorkspacePremiumIcon } from '../../icons';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
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
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { GrantableRole } from '../../api/endpoints/workspaces';
import {
  useRemoveMemberMutation,
  useTransferOwnershipMutation,
  useUpdateMemberRoleMutation,
} from '../../api/endpoints/workspaces';
import type { Workspace, WorkspaceMember } from '../../api/types';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getApiErrorMessage } from '../../lib/apiError';
import { canAdminister } from '../../lib/permissions';
import { formatDate } from '../../lib/format';
import { GRANTABLE_ROLES, ROLE_DESCRIPTION_KEYS, ROLE_LABEL_KEYS } from './settingsSchemas';

interface MembersSectionProps {
  workspace: Workspace;
  members: WorkspaceMember[];
  loading?: boolean;
  currentUserId: string | undefined;
}

/**
 * Who is in the workspace, and what they may do.
 *
 * The owner row is deliberately inert: the server refuses both a role change and
 * a removal for the owner, so offering either control would only produce a 403.
 * Ownership moves through its own action, and only the owner sees it.
 */
export default function MembersSection({
  workspace,
  members,
  loading = false,
  currentUserId,
}: MembersSectionProps): ReactElement {
  const { t } = useTranslation();
  const [updateRole, roleState] = useUpdateMemberRoleMutation();
  const [removeMember, removeState] = useRemoveMemberMutation();
  const [transferOwnership, transferState] = useTransferOwnershipMutation();

  const [removing, setRemoving] = useState<WorkspaceMember | undefined>(undefined);
  const [promoting, setPromoting] = useState<WorkspaceMember | undefined>(undefined);

  const isAdmin = canAdminister(workspace.role);
  const isOwner = workspace.role === 'owner';
  const error = roleState.error ?? removeState.error ?? transferState.error;

  const handleRemove = async (): Promise<void> => {
    if (!removing) return;
    const ok = await removeMember({ workspaceId: workspace.id, userId: removing.userId })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) setRemoving(undefined);
  };

  const handleTransfer = async (): Promise<void> => {
    if (!promoting) return;
    const ok = await transferOwnership({ workspaceId: workspace.id, newOwnerId: promoting.userId })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) setPromoting(undefined);
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h3">{t('settings.members')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isAdmin
                ? t('settings.membersAdminHint')
                : t('settings.membersViewerHint')}
            </Typography>
          </Stack>

          {error ? <Alert severity="error">{getApiErrorMessage(error, t('settings.memberFailed'))}</Alert> : null}

          {loading ? (
            <Stack spacing={1}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={48} />
              ))}
            </Stack>
          ) : (
            // Four columns do not fit a phone, and the enclosing `Card` clips
            // its overflow — so without this wrapper the table was simply cut
            // off at the viewport edge with no way to scroll to the rest of it,
            // which on a 390px screen hid the whole Actions column and left an
            // admin unable to remove a member or transfer ownership at all.
            // Same treatment the Reports tables already carry.
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 460 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('settings.member')}</TableCell>
                    <TableCell>{t('settings.role.label')}</TableCell>
                    <TableCell>{t('settings.joined')}</TableCell>
                    <TableCell align="right">{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => {
                    const isOwnerRow = member.role === 'owner';
                    const isSelf = member.userId === currentUserId;

                    return (
                      <TableRow key={member.userId}>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar src={member.avatarUrl ?? undefined} sx={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                              {member.fullName.charAt(0).toUpperCase()}
                            </Avatar>
                            <Stack spacing={0}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {member.fullName}
                                {isSelf ? ` (${t('settings.you')})` : ''}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {member.email}
                              </Typography>
                            </Stack>
                          </Stack>
                        </TableCell>

                        <TableCell sx={{ minWidth: 150 }}>
                          {isOwnerRow || !isAdmin ? (
                            <Tooltip title={t(ROLE_DESCRIPTION_KEYS[member.role])}>
                              <Chip size="small" label={t(ROLE_LABEL_KEYS[member.role])} variant="outlined" />
                            </Tooltip>
                          ) : (
                            <TextField
                              select
                              size="small"
                              fullWidth
                              aria-label={`Role for ${member.fullName}`}
                              value={member.role}
                              disabled={roleState.isLoading}
                              onChange={(event) =>
                                void updateRole({
                                  workspaceId: workspace.id,
                                  userId: member.userId,
                                  role: event.target.value as GrantableRole,
                                })
                              }
                            >
                              {GRANTABLE_ROLES.map((role) => (
                                <MenuItem key={role} value={role}>
                                  {t(ROLE_LABEL_KEYS[role])}
                                </MenuItem>
                              ))}
                            </TextField>
                          )}
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {formatDate(member.joinedAt.slice(0, 10))}
                          </Typography>
                        </TableCell>

                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            {isOwner && !isOwnerRow ? (
                              <Tooltip title={t('settings.makeOwner')}>
                                <IconButton
                                  size="small"
                                  onClick={() => setPromoting(member)}
                                  aria-label={`Transfer ownership to ${member.fullName}`}
                                >
                                  <WorkspacePremiumIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : null}

                            {isAdmin && !isOwnerRow ? (
                              <Tooltip title={t('settings.removeFromWorkspace')}>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => setRemoving(member)}
                                  aria-label={`Remove ${member.fullName}`}
                                >
                                  <PersonRemoveIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : null}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </CardContent>

      <ConfirmDialog
        open={Boolean(removing)}
        title={t('settings.removeMemberTitle')}
        description={`Remove ${removing?.fullName} from "${workspace.name}"? Anything they created stays, but they lose access immediately.`}
        confirmLabel={t('common.remove')}
        destructive
        loading={removeState.isLoading}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoving(undefined)}
      />

      <ConfirmDialog
        open={Boolean(promoting)}
        title={t('settings.transferOwnershipTitle')}
        description={`Make ${promoting?.fullName} the owner of "${workspace.name}"? You become an admin, and only they will be able to transfer it back.`}
        confirmLabel={t('settings.transfer')}
        destructive
        loading={transferState.isLoading}
        onConfirm={() => void handleTransfer()}
        onCancel={() => setPromoting(undefined)}
      />
    </Card>
  );
}
