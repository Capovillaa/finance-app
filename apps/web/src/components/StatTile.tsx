import { ArrowDownwardIcon, ArrowUpwardIcon, RemoveIcon } from '../icons';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Money } from '../api/types';
import { formatMoney, formatSignedPercent } from '../lib/format';
import { EASE_OUT, useReducedMotion } from '../lib/motion';
import { FONT_DISPLAY } from '../theme';

interface StatTileProps {
  label: string;
  value: string;
  /**
   * The same figure unformatted. Optional, and only used to count the value up
   * when the tile first shows it — the counter has to interpolate a number, and
   * `value` has already been through `Intl` by the time it arrives here.
   */
  amount?: Money | null;
  /** Required alongside `amount`, to format each frame of the count. */
  currency?: string;
  /** Percentage change against the previous period, if there is one. */
  deltaPercent?: number | null;
  /**
   * What the delta is measured against, e.g. "vs last month". Also renders on
   * its own, without a delta, for a tile whose footnote is a plain fact rather
   * than a comparison — a savings rate, say. Defaults to "vs last month" only
   * when there *is* a delta, so a tile with neither shows no footer at all.
   */
  deltaCaption?: string;
  /**
   * Whether an increase is a good thing. Expenses going up is not, so the
   * direction of the arrow and the colour of the delta have to be told apart.
   */
  upIsGood?: boolean;
  loading?: boolean;
}

/**
 * A single figure with its context.
 *
 * One of only two places in the app that gets a shadow — the interface is
 * otherwise flat, so lifting the KPI row off the page is what marks it as the
 * summary rather than as more content. The figure itself is set in the display
 * serif: at this size Instrument Sans would read as a label, and the number is
 * the point of the tile.
 */
export default function StatTile({
  label,
  value,
  amount,
  currency,
  deltaPercent,
  deltaCaption,
  upIsGood = true,
  loading = false,
}: StatTileProps): ReactElement {
  const { t } = useTranslation();
  const hasDelta = deltaPercent !== undefined && deltaPercent !== null && Number.isFinite(deltaPercent);
  const caption = hasDelta ? (deltaCaption ?? t('dashboard.vsLastMonth')) : deltaCaption;
  const rising = hasDelta && deltaPercent > 0;
  const flat = hasDelta && deltaPercent === 0;

  // Colour is never the only cue: the arrow direction and the signed number
  // both say the same thing, so a red-green-blind reader loses nothing.
  const DeltaIcon = flat ? RemoveIcon : rising ? ArrowUpwardIcon : ArrowDownwardIcon;
  const deltaColor = flat ? 'text.secondary' : rising === upIsGood ? 'money.positive' : 'money.negative';

  return (
    <Card elevation={1} sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1.25}>
          <Typography variant="eyebrow" component="h3" color="text.secondary">
            {label}
          </Typography>

          {loading ? (
            <Skeleton variant="text" width="70%" height={44} />
          ) : (
            <Typography
              component="p"
              sx={{
                fontFamily: FONT_DISPLAY,
                fontVariationSettings: "'opsz' 60, 'SOFT' 0, 'WONK' 0",
                fontWeight: 600,
                fontSize: 'clamp(1.5rem, 3.4vw, 1.875rem)',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums lining-nums',
              }}
            >
              <CountUp value={value} amount={amount} currency={currency} />
            </Typography>
          )}

          {!loading && (hasDelta || caption) ? (
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
              {hasDelta ? (
                <>
                  <DeltaIcon sx={{ fontSize: 15, color: deltaColor }} />
                  <Typography variant="amount" sx={{ color: deltaColor, fontWeight: 600 }}>
                    {formatSignedPercent(deltaPercent)}
                  </Typography>
                </>
              ) : null}
              {caption ? (
                <Typography variant="caption" color="text.secondary">
                  {caption}
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

interface CountUpProps {
  value: string;
  amount?: Money | null;
  currency?: string;
}

/**
 * Counts a figure up to its value once, when it first resolves.
 *
 * The point is legibility, not spectacle: a tile that lands on its number is
 * obviously *this month's* number, where a tile that was simply always there
 * could be a stale render. It runs for less than a second, only on the way in,
 * and never on an update the user did not cause.
 *
 * The interpolated value is written straight to a MotionValue rather than to
 * React state, so forty frames of counting cost zero re-renders. Formatting
 * still goes through `formatMoney`, so the currency, grouping and decimals are
 * the same on every frame as they are at rest.
 */
function CountUp({ value, amount, currency }: CountUpProps): ReactElement {
  const reduceMotion = useReducedMotion();
  const target = amount === null || amount === undefined ? Number.NaN : Number(amount);
  const animatable = currency !== undefined && Number.isFinite(target) && !reduceMotion;

  const count = useMotionValue(0);
  const text = useTransform(count, (current) => formatMoney(String(current), currency ?? 'USD'));

  useEffect(() => {
    if (!animatable) return;
    const controls = animate(count, target, { ...EASE_OUT, duration: 0.7 });
    return () => controls.stop();
  }, [animatable, count, target]);

  if (!animatable) return <>{value}</>;

  return <motion.span>{text}</motion.span>;
}
