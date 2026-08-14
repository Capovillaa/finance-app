import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** One quiet line of context: the workspace, a count, a period. */
  subtitle?: ReactNode;
  /** Primary and secondary controls for the screen. */
  actions?: ReactNode;
}

/**
 * The masthead every screen opens with.
 *
 * A statement starts with a heading and a rule, and so does every page here —
 * shared rather than repeated per screen so the nine of them cannot drift apart
 * in spacing or weight.
 */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps): ReactElement {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 1.5,
        pb: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography variant="h1">{title}</Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" component="div">
            {subtitle}
          </Typography>
        ) : null}
      </Stack>

      {actions ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignItems: 'center' }}>
          {actions}
        </Stack>
      ) : null}
    </Box>
  );
}
