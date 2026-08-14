import { DarkModeIcon, LightModeIcon, LogoutIcon, SettingsBrightnessIcon } from '../icons';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useColorScheme } from '@mui/material/styles';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogoutMutation } from '../api/endpoints/auth';
import { useAppSelector } from '../app/hooks';
import { useEndSession } from '../features/auth/useEndSession';

const MODE_ICONS = {
  light: LightModeIcon,
  dark: DarkModeIcon,
  system: SettingsBrightnessIcon,
} as const;

export default function UserMenu(): ReactElement {
  const { t } = useTranslation();
  const endSession = useEndSession();
  const user = useAppSelector((state) => state.auth.user);
  const [logout] = useLogoutMutation();
  const { mode, setMode } = useColorScheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const nextMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
  const NextModeIcon = MODE_ICONS[nextMode];

  const handleLogout = async (): Promise<void> => {
    setAnchorEl(null);

    // The request revokes the refresh token server-side. Local state is cleared
    // regardless of the outcome: if the call fails the session is already
    // unusable from this browser's point of view, and leaving the user staring
    // at a signed-in shell would be worse than an orphaned server-side token.
    await logout().unwrap().catch(() => undefined);

    endSession();
  };

  const initials = (user?.fullName ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <>
      <Tooltip title={user?.fullName ?? t('account.fallback')}>
        <IconButton
          onClick={(event) => setAnchorEl(event.currentTarget)}
          size="small"
          aria-label={t('account.menu')}
        >
          <Avatar
            src={user?.avatarUrl ?? undefined}
            sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}
          >
            {initials}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <ListItemText primary={user?.fullName} secondary={user?.email} />
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => setMode(nextMode)}>
          <ListItemIcon>
            <NextModeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('theme.switchTo', { mode: t(`theme.${nextMode}`) })} />
        </MenuItem>

        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('account.signOut')} />
        </MenuItem>
      </Menu>
    </>
  );
}
