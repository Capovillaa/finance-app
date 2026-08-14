import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';

const TONE_COLOR = {
  positive: 'money.positive',
  negative: 'money.negative',
  neutral: 'money.neutral',
  inherit: 'inherit',
} as const;

interface AmountProps {
  children: ReactNode;
  tone?: keyof typeof TONE_COLOR;
  /** The figure a row is *about*, rather than a supporting one. */
  strong?: boolean;
}

/**
 * A monetary figure inside a table or a list.
 *
 * Money is tabular data, so it is set in the monospaced face with
 * `tabular-nums`: digits occupy identical widths and a column of amounts lines
 * up on the decimal without anybody having to right-pad it. The same face
 * everywhere is also what makes a figure recognisable as a figure at a glance,
 * which matters most in the places money is *mixed* with prose.
 */
export default function Amount({ children, tone = 'inherit', strong = false }: AmountProps): ReactElement {
  return (
    <Typography
      variant="amount"
      component="span"
      sx={{ color: TONE_COLOR[tone], fontWeight: strong ? 600 : 500, whiteSpace: 'nowrap' }}
    >
      {children}
    </Typography>
  );
}
