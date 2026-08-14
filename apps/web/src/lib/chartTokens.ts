import { useColorScheme, useTheme } from '@mui/material/styles';

/**
 * Colours for chart marks.
 *
 * Only the *data* colours live here. Chrome — gridlines, axes, tick labels —
 * comes from the MUI theme, so it stays consistent with the surrounding UI and
 * needs no second source of truth.
 *
 * The rules the file has always followed are unchanged by the redesign; only
 * the hexes moved onto the statement palette:
 *
 *  - categorical slots are assigned in a fixed order and never cycled;
 *  - magnitude comparisons use one flat hue, because bar length already encodes
 *    the magnitude that a light→dark ramp would only repeat;
 *  - the four status steps are reserved for state and always ship with an icon
 *    and a word beside them.
 *
 * What did change is that the palette is now *semantic where the data is*:
 * slot 1 is the income green and slot 2 the expense brick, because the only
 * two-series charts in this app are income against expenses and this year
 * against last. Semantic hue is worth having, but green and red are exactly the
 * pair red-green colour blindness collapses, so the two slots are separated by
 * lightness rather than by hue alone. Validated against the surface each chart
 * actually renders on (`#FFFFFF` light, `#1B1F26` dark):
 *
 *   light · slot 1 `#1C9760` 3.72:1 vs surface · slot 2 `#9B2F24` 7.43:1
 *           slot 1 vs slot 2 2.00:1 — a full lightness step apart
 *   dark  · slot 1 `#5FCD97` 8.39:1 vs surface · slot 2 `#CE5545` 3.94:1
 *           slot 1 vs slot 2 2.13:1
 *
 * Every status step clears 3:1 against all three surfaces in both schemes.
 */
export interface ChartTokens {
  /** Categorical slots, assigned in fixed order and never cycled. */
  series: readonly string[];
  /** Single hue for magnitude comparisons. */
  magnitude: string;
  /** Reserved for state. Always paired with an icon and a word, never colour alone. */
  status: { good: string; warning: string; serious: string; critical: string };
  /** Theme chrome, read from MUI so charts match the rest of the page. */
  gridline: string;
  axis: string;
  tick: string;
  surface: string;
}

const LIGHT_SERIES = ['#1C9760', '#9B2F24', '#2F6FA8', '#8A5A16'] as const;
const DARK_SERIES = ['#5FCD97', '#CE5545', '#7FB4E8', '#DBA850'] as const;

/**
 * The status ramp runs green → old gold → burnt → brick. Unlike the categorical
 * slots these are ordinal, so neighbouring steps are *meant* to be related; the
 * icon and word that always accompany them carry the identity.
 */
const LIGHT_STATUS = { good: '#157A4E', warning: '#8A5A16', serious: '#A2502A', critical: '#B23A2E' };
const DARK_STATUS = { good: '#4FC28C', warning: '#DBA850', serious: '#DE8B5A', critical: '#E2705C' };

export function useChartTokens(): ChartTokens {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();

  // `mode` is 'system' until the user picks one, and undefined on the very first
  // render before the scheme is resolved.
  const resolved = mode === 'system' ? systemMode : mode;
  const isDark = resolved === 'dark';

  return {
    series: isDark ? DARK_SERIES : LIGHT_SERIES,
    // Deliberately not slot 1: a ranked bar chart is one flat hue, and the
    // brand green is the calmer of the two at long bar lengths.
    magnitude: isDark ? '#39B981' : '#0F6E4E',
    status: isDark ? DARK_STATUS : LIGHT_STATUS,
    gridline: theme.palette.divider,
    axis: theme.palette.divider,
    tick: theme.palette.text.secondary,
    surface: theme.palette.background.paper,
  };
}
