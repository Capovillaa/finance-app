import { MenuIcon } from '../icons';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import WorkspaceSwitcher from '../features/workspace/WorkspaceSwitcher';
import AppBar from '@mui/material/AppBar';
import Brandmark from './Brandmark';
import EmailVerificationBanner from './EmailVerificationBanner';
import NotificationsMenu from './NotificationsMenu';
import UserMenu from './UserMenu';
import { EASE_OUT, MotionBox, useReducedMotion } from '../lib/motion';
import { NAV_ITEMS } from './navItems';

const DRAWER_WIDTH = 244;
/** Wide enough for a statement, narrow enough that a line is still readable. */
const CONTENT_MAX_WIDTH = 1320;

export default function AppLayout(): ReactElement {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  const navigation = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ gap: 1.25 }}>
        <Brandmark />
      </Toolbar>

      <List component="nav" sx={{ px: 1.5, py: 1, flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => {
          // `NavLink`'s own `end` matching would leave the dashboard highlighted
          // on `/accounts`, since every path starts with `/`.
          const selected = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          const Icon = item.icon;

          return (
            <ListItemButton
              key={item.to}
              component={NavLink}
              to={item.to}
              selected={selected}
              onClick={() => setMobileOpen(false)}
              sx={{
                position: 'relative',
                mb: 0.25,
                py: 0.75,
                color: selected ? 'primary.main' : 'text.secondary',
                '&:hover': { color: selected ? 'primary.main' : 'text.primary' },
              }}
            >
              {/* The active marker is a spine, the same one a statement line
                  uses for its status — the nav is a list of sections and this
                  says which one you are reading. One shared `layoutId` means it
                  slides from the old item to the new one instead of blinking
                  out and in, which is the difference between "you moved" and
                  "the page changed under you". */}
              {selected ? (
                <MotionBox
                  aria-hidden
                  layoutId={reduceMotion ? undefined : 'nav-indicator'}
                  transition={EASE_OUT}
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: 999,
                    bgcolor: 'primary.main',
                  }}
                />
              ) : null}

              <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>
                <Icon sx={{ fontSize: 19 }} />
              </ListItemIcon>
              <ListItemText
                primary={t(item.labelKey)}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: selected ? 600 : 500,
                }}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: 'none' } }}
            aria-label={t('nav.open')}
          >
            <MenuIcon />
          </IconButton>

          <WorkspaceSwitcher />

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={0.5} alignItems="center">
            <NotificationsMenu />
            <UserMenu />
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              borderRight: 1,
              borderColor: 'divider',
            },
          }}
        >
          {navigation}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          px: { xs: 2, sm: 3, lg: 4 },
          pb: 6,
        }}
      >
        <Toolbar />
        <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', pt: 3 }}>
          <EmailVerificationBanner />
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
