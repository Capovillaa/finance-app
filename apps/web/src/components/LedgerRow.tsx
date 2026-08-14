import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import type { ReactElement, ReactNode } from 'react';
import { MotionBox, ledgerRow } from '../lib/motion';

/**
 * The condition of a row, as a colour. Callers map their own domain status onto
 * one of these rather than passing a hex, so a `pending` transaction and a
 * budget line that is `warning` are drawn with the same ink.
 */
export type LedgerTone = 'none' | 'neutral' | 'positive' | 'caution' | 'negative' | 'accent';

const TONE_COLOR: Record<Exclude<LedgerTone, 'none'>, string> = {
  neutral: 'tone.neutral',
  positive: 'tone.positive',
  caution: 'tone.caution',
  negative: 'tone.negative',
  accent: 'tone.accent',
};

const AMOUNT_COLOR = {
  positive: 'money.positive',
  negative: 'money.negative',
  neutral: 'money.neutral',
  inherit: 'text.primary',
} as const;

export interface LedgerRowProps {
  /** Left column, usually a date. Kept narrow and set in the tabular face. */
  lead?: ReactNode;
  /** What the row is about. */
  primary: ReactNode;
  /** Turns `primary` into the row's one interactive control. */
  onPrimaryClick?: () => void;
  /** Spoken label for that control, when the visible text is not enough. */
  primaryLabel?: string;
  /** A quieter line under `primary` — a merchant, an account, a note. */
  secondary?: ReactNode;
  /** The classifying column: a category, a schedule, a period. */
  meta?: ReactNode;
  /** The figure. Already formatted by the caller; rendered mono and right-aligned. */
  amount?: ReactNode;
  amountTone?: keyof typeof AMOUNT_COLOR;
  /** A second, quieter figure under the amount — a limit, a target, a balance. */
  amountCaption?: ReactNode;
  /** The 3px spine down the left edge. */
  tone?: LedgerTone;
  /**
   * What the spine means, in words. Required whenever `tone` is not `none`,
   * because a colour on its own is not a signal anybody can rely on: this is
   * read out by a screen reader and shown on hover.
   */
  toneLabel?: string;
  /** Trailing controls. */
  actions?: ReactNode;
  dense?: boolean;
}

/**
 * One line of a statement.
 *
 * This is the app's signature form: a thin rule underneath rather than a card
 * with a shadow around it, the figure right-aligned in a monospaced tabular
 * face so digits stack into a column, and the row's condition carried by a
 * narrow spine on the left instead of a chip loud enough to compete with the
 * money. Transactions, budget lines, schedules, bills and per-account balances
 * are all the same object seen from different angles, so they are all drawn by
 * this component.
 *
 * On a narrow screen the row folds: date and description stay on the first
 * line, the classifying column drops beneath them, and the figure takes a full
 * line of its own at the bottom — which keeps the amount right-aligned and
 * legible rather than squeezing five columns into 360px.
 */
export default function LedgerRow({
  lead,
  primary,
  onPrimaryClick,
  primaryLabel,
  secondary,
  meta,
  amount,
  amountTone = 'inherit',
  amountCaption,
  tone = 'none',
  toneLabel,
  actions,
  dense = false,
}: LedgerRowProps): ReactElement {
  const spine = tone === 'none' ? 'transparent' : TONE_COLOR[tone];

  const primaryContent = (
    <Typography
      variant="body2"
      sx={{ fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {primary}
    </Typography>
  );

  return (
    <MotionBox
      role="listitem"
      // The variants are inert unless an ancestor drives them, so a row used
      // outside `LedgerList` simply renders.
      variants={ledgerRow}
      sx={{
        display: 'grid',
        alignItems: 'center',
        columnGap: { xs: 1.5, md: 2 },
        rowGap: 0.25,
        py: dense ? 1 : 1.25,
        pr: { xs: 1.5, md: 2 },
        // The spine sits in the row's own left border, so it runs the full
        // height of the line no matter how tall the line grows.
        pl: { xs: 1.5, md: 2 },
        borderLeft: '3px solid',
        borderLeftColor: spine,
        borderBottom: '1px solid',
        borderBottomColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
        '&:hover': { bgcolor: 'action.hover' },
        gridTemplateColumns: { xs: 'auto minmax(0, 1fr) auto', md: 'auto minmax(0, 1fr) auto auto auto' },
        gridTemplateAreas: {
          xs: `"lead body actions" "lead meta actions" "amount amount amount"`,
          md: `"lead body meta amount actions"`,
        },
      }}
    >
      {toneLabel && tone !== 'none' ? <Box sx={visuallyHidden}>{toneLabel}</Box> : null}

      <Box sx={{ gridArea: 'lead', display: lead ? 'block' : 'none' }}>
        <Typography variant="amount" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {lead}
        </Typography>
      </Box>

      <Box sx={{ gridArea: 'body', minWidth: 0 }}>
        {onPrimaryClick ? (
          <ButtonBase
            onClick={onPrimaryClick}
            aria-label={primaryLabel}
            sx={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              borderRadius: 1,
              px: 0.5,
              mx: -0.5,
              '&:hover .MuiTypography-root': { textDecoration: 'underline' },
            }}
          >
            {primaryContent}
          </ButtonBase>
        ) : (
          primaryContent
        )}

        {typeof secondary === 'string' ? (
          <Typography
            variant="caption"
            color="text.secondary"
            component="div"
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {secondary}
          </Typography>
        ) : (
          secondary
        )}
      </Box>

      <Box
        sx={{
          gridArea: 'meta',
          minWidth: 0,
          justifySelf: { xs: 'start', md: 'end' },
          display: meta ? 'block' : 'none',
        }}
      >
        {typeof meta === 'string' ? (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {meta}
          </Typography>
        ) : (
          meta
        )}
      </Box>

      <Box
        sx={{
          gridArea: 'amount',
          justifySelf: 'end',
          textAlign: 'right',
          display: amount === undefined ? 'none' : 'block',
          // On the folded layout the figure gets its own line, so it needs a
          // little air above it to read as a total rather than as a caption.
          pt: { xs: 0.5, md: 0 },
        }}
      >
        <Typography
          variant="amount"
          component="div"
          sx={{ color: AMOUNT_COLOR[amountTone], whiteSpace: 'nowrap', fontWeight: 600 }}
        >
          {amount}
        </Typography>
        {amountCaption ? (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ whiteSpace: 'nowrap' }}>
            {amountCaption}
          </Typography>
        ) : null}
      </Box>

      <Box
        sx={{
          gridArea: 'actions',
          justifySelf: 'end',
          whiteSpace: 'nowrap',
          display: actions ? 'block' : 'none',
        }}
      >
        {actions}
      </Box>
    </MotionBox>
  );
}
