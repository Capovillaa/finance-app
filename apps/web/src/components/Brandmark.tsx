import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import { FONT_DISPLAY } from '../theme';

interface BrandmarkProps {
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
}

/**
 * The app's mark and wordmark.
 *
 * The mark is the product's own object rather than a generic wallet glyph:
 * three ruled lines, the last one short and heavier, which is what a statement
 * looks like from across the room. Drawn in `currentColor` so it inherits the
 * accent in both colour schemes without a second asset.
 */
export default function Brandmark({ size = 26 }: BrandmarkProps): ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Box
        component="svg"
        viewBox="0 0 26 26"
        aria-hidden
        sx={{ width: size, height: size, color: 'primary.main', flexShrink: 0 }}
      >
        <rect
          x="0.9"
          y="0.9"
          width="24.2"
          height="24.2"
          rx="7"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.32"
          strokeWidth="1.4"
        />
        <path d="M6.5 9.5h13" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M6.5 13.5h13" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M6.5 17.5h7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      </Box>

      <Typography
        component="span"
        sx={{
          fontFamily: FONT_DISPLAY,
          fontVariationSettings: "'opsz' 36, 'SOFT' 0, 'WONK' 0",
          fontWeight: 600,
          fontSize: size * 0.65,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        Finance
      </Typography>
    </Box>
  );
}
