import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';
import Brandmark from '../../components/Brandmark';
import LanguageMenu from '../../components/LanguageMenu';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centred card used by the signed-out screens. */
export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps): ReactElement {
  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 6,
      }}
    >
      {/* The picker is reachable before sign-in on purpose: someone who cannot
          read the login screen cannot sign in to go and change the language. */}
      <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
        <LanguageMenu />
      </Box>

      <Stack spacing={3} sx={{ width: '100%', maxWidth: 440 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Brandmark size={34} />
        </Box>

        <Card elevation={1}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Stack spacing={0.5} sx={{ mb: 3, pb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h2" component="h1">
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            </Stack>

            {children}
          </CardContent>
        </Card>

        {footer ? (
          <Typography variant="body2" color="text.secondary" align="center">
            {footer}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}
