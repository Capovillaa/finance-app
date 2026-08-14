import { DoneAllIcon, NotificationsIcon } from '../icons';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '../api/endpoints/notifications';
import type { NotificationSeverity } from '../api/types';
import { formatRelative } from '../lib/format';

const SEVERITY_COLOR: Record<NotificationSeverity, 'info' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  critical: 'error',
};

export default function NotificationsMenu(): ReactElement {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const { data } = useListNotificationsQuery({ pageSize: 10 });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();

  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <>
      <Tooltip title={t('notifications.title')}>
        <IconButton
          onClick={(event) => setAnchorEl(event.currentTarget)}
          aria-label={
            unreadCount > 0 ? t('notifications.aria', { count: unreadCount }) : t('notifications.title')
          }
        >
          <Badge badgeContent={unreadCount} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { width: 380, maxWidth: '100vw' } } }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
          <Typography variant="h6">{t('notifications.title')}</Typography>
          {unreadCount > 0 ? (
            <Button size="small" startIcon={<DoneAllIcon />} onClick={() => void markAllRead()}>
              {t('notifications.markAllRead')}
            </Button>
          ) : null}
        </Stack>

        <Divider />

        {notifications.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('notifications.empty')}
            </Typography>
          </Box>
        ) : (
          notifications.map((notification) => (
            <MenuItem
              key={notification.id}
              onClick={() => {
                if (!notification.readAt) void markRead(notification.id);
              }}
              sx={{
                alignItems: 'flex-start',
                whiteSpace: 'normal',
                borderLeft: 3,
                borderLeftColor: notification.readAt
                  ? 'transparent'
                  : `${SEVERITY_COLOR[notification.severity]}.main`,
              }}
            >
              <ListItemText
                primary={notification.title}
                secondary={
                  <>
                    {notification.message}
                    <Typography component="span" variant="caption" display="block" color="text.disabled">
                      {formatRelative(notification.createdAt)}
                    </Typography>
                  </>
                }
                slotProps={{ primary: { fontWeight: notification.readAt ? 400 : 600 } }}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}
