import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import { formatMoney } from '../lib/format';

export interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  currency: string;
}

/**
 * Shared hover readout for every chart in the app.
 *
 * The colour swatch beside each row is what carries series identity — the text
 * itself stays in the theme's ink colours, because a light categorical hue is
 * not legible as text on either surface.
 */
export default function ChartTooltip({ active, label, payload, currency }: ChartTooltipProps): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <Paper elevation={4} sx={{ px: 1.5, py: 1.25, border: 1, borderColor: 'divider', minWidth: 168 }}>
      {label !== undefined ? (
        <Typography variant="eyebrow" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
          {label}
        </Typography>
      ) : null}

      <Stack spacing={0.5}>
        {payload.map((entry) => (
          <Stack
            key={String(entry.dataKey ?? entry.name)}
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: entry.color,
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" color="text.secondary">
                {entry.name}
              </Typography>
            </Stack>
            <Typography variant="amount" sx={{ fontWeight: 600 }}>
              {formatMoney(String(entry.value ?? '0'), currency)}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
