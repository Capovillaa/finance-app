import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';

interface SeriesLegendProps {
  items: { label: string; color: string }[];
}

/**
 * Legend for a multi-series chart. Always present once there are two or more
 * series, because it is the identity channel that does not depend on the reader
 * distinguishing two hues. The swatch carries the colour; the label stays in the
 * theme's text colour rather than wearing the series hue.
 */
export default function SeriesLegend({ items }: SeriesLegendProps): ReactElement {
  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {items.map((item) => (
        <Stack key={item.label} direction="row" spacing={0.75} alignItems="center" component="li">
          <Box sx={{ width: 14, height: 3, borderRadius: 999, bgcolor: item.color }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 550 }}>
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
