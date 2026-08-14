import { CheckIcon, UnfoldMoreIcon } from '../../icons';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import { useState, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/api';
import { useAppDispatch } from '../../app/hooks';
import { useActiveWorkspace } from './useActiveWorkspace';
import { workspaceSelected } from './workspaceSlice';

export default function WorkspaceSwitcher(): ReactElement {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { workspace, workspaces, isLoading } = useActiveWorkspace();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (isLoading) return <Skeleton variant="rounded" width={180} height={36} />;
  if (!workspace) return <Box />;

  const handleSelect = (id: string): void => {
    setAnchorEl(null);
    if (id === workspace.id) return;

    dispatch(workspaceSelected(id));
    // Every cached row belongs to the workspace it was fetched for. Resetting
    // is blunter than invalidating tag by tag, but it makes it impossible to
    // show one workspace's balances under another's name for even one frame.
    dispatch(api.util.resetApiState());
  };

  return (
    <>
      <Button
        onClick={(event: MouseEvent<HTMLButtonElement>) => setAnchorEl(event.currentTarget)}
        endIcon={<UnfoldMoreIcon />}
        color="inherit"
        sx={{ maxWidth: 260, justifyContent: 'space-between' }}
        aria-haspopup="menu"
        aria-expanded={anchorEl ? 'true' : undefined}
        aria-label={t('workspace.current', { name: workspace.name })}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workspace.name}
        </Box>
      </Button>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {workspaces.map((item) => (
          <MenuItem
            key={item.id}
            selected={item.id === workspace.id}
            onClick={() => handleSelect(item.id)}
          >
            <ListItemIcon>{item.id === workspace.id ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            <ListItemText
              primary={item.name}
              secondary={`${item.baseCurrency} · ${t('workspace.members', { count: item.memberCount })}`}
            />
            <Chip label={item.role} size="small" sx={{ ml: 2 }} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
