import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  /** A quiet clarifier beside the title: the period, the currency, a count. */
  caption?: ReactNode;
  /** A control belonging to this panel rather than to the screen. */
  action?: ReactNode;
  children: ReactNode;
  /**
   * Off for a panel whose content is a run of `LedgerRow`s: statement lines
   * must reach the panel's edges or their rules stop short of it and the whole
   * effect collapses into "a list inside a box".
   */
  padded?: boolean;
  /** Stretches to the height of a grid row, for panels sitting side by side. */
  fullHeight?: boolean;
}

/**
 * A titled region of a screen.
 *
 * The whole interface is flat, so a panel is a hairline rectangle and its
 * heading is separated by a rule rather than by a shadow or a filled bar. Every
 * screen composes out of these, which is what keeps nine screens looking like
 * one product.
 */
export default function Panel({
  title,
  caption,
  action,
  children,
  padded = true,
  fullHeight = false,
}: PanelProps): ReactElement {
  return (
    <Card sx={{ height: fullHeight ? '100%' : undefined, display: 'flex', flexDirection: 'column' }}>
      {title || action ? (
        <Stack
          direction="row"
          alignItems="baseline"
          justifyContent="space-between"
          gap={1}
          flexWrap="wrap"
          sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap" sx={{ minWidth: 0 }}>
            {title ? (
              <Typography variant="h3" component="h2">
                {title}
              </Typography>
            ) : null}
            {caption ? (
              <Typography variant="caption" color="text.secondary">
                {caption}
              </Typography>
            ) : null}
          </Stack>
          {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
        </Stack>
      ) : null}

      <Box sx={{ flexGrow: 1, ...(padded ? { p: 2.5 } : null) }}>{children}</Box>
    </Card>
  );
}
