import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** The one thing to do about it, if there is one. */
  action?: ReactNode;
}

/**
 * What a screen says when it has nothing to show.
 *
 * Shared because "nothing here" appeared on nine screens in nine slightly
 * different shapes, and an empty screen is exactly where a product looks
 * unfinished if the wording and spacing wander.
 */
export default function EmptyState({ title, description, action }: EmptyStateProps): ReactElement {
  return (
    <Card>
      <Stack spacing={1} alignItems="center" sx={{ px: 3, py: 7, textAlign: 'center' }}>
        <Typography variant="h3" component="h2">
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
            {description}
          </Typography>
        ) : null}
        {action ? <Box sx={{ pt: 1.5 }}>{action}</Box> : null}
      </Stack>
    </Card>
  );
}
