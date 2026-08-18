import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';

interface FormSectionProps {
  /** A short label, rendered as an eyebrow — the same treatment the dashboard's
   * stat tiles use for "TOTAL BALANCE" / "INCOME THIS MONTH". */
  label: string;
  /** A control that belongs to this section rather than to the dialog as a
   * whole — e.g. budgets' "Add line". Sits beside the label, not beneath it. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Groups a run of fields inside a dialog under a small caps label, so a long
 * form reads as a few named groups rather than one undifferentiated column.
 *
 * Deliberately lighter than `Panel`: a dialog section has no card, border or
 * `h3` heading of its own — it borrows the eyebrow treatment already used for
 * a stat tile's label, which is enough separation at this scale, and adding a
 * second bordered container inside an already-bordered dialog paper would be
 * one frame too many.
 */
export default function FormSection({ label, action, children }: FormSectionProps): ReactElement {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="eyebrow" component="h3" color="text.secondary">
          {label}
        </Typography>
        {action ? <Box>{action}</Box> : null}
      </Stack>
      <Stack spacing={1.5}>{children}</Stack>
    </Stack>
  );
}
