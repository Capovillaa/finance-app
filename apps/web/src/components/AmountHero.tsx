import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import type { Money } from '../api/types';
import { appLocale } from '../lib/format';
import {
  canonicalFromDigits,
  currencyFractionDigits,
  digitsFromCanonical,
  digitsFromInput,
  formatDigits,
} from '../lib/moneyInput';
import { FONT_DISPLAY } from '../theme';

interface AmountHeroProps {
  /** The canonical decimal the API takes: `'1500.00'`, or `''` for empty. */
  value: Money;
  onChange: (value: Money) => void;
  currency: string;
  /** Tints the figure. `neutral` is right where direction is not a concept. */
  tone?: 'positive' | 'negative' | 'neutral';
  /** Accessible name — there is no visible label, the figure speaks for itself. */
  label: string;
  autoFocus?: boolean;
  error?: boolean;
  /** Validation message, or a hint. Sits under the rule where a caption would. */
  helperText?: ReactNode;
  /** A second line under the rule: the converted figure, an implied rate. */
  caption?: ReactNode;
}

const TONE_COLOR = {
  positive: 'money.positive',
  negative: 'money.negative',
  neutral: 'text.primary',
} as const;

/**
 * The amount, as the subject of the dialog rather than one field among twelve.
 *
 * The app's whole premise is that money is the content and everything else is
 * chrome, and entry was the one place that stopped being true: an amount was a
 * half-width `TextField` labelled "Amount", set at the same size and weight as
 * "Merchant" beside it. This is that premise applied to the moment of entry —
 * the figure set in the display face at display size, the currency named quietly
 * above it, and a statement rule underneath, which is the same hairline
 * `LedgerRow` draws beneath every line of money in the app. What the dialog is
 * *for* is legible before a single label is read.
 *
 * The rule is also the focus indicator. A borderless input in the middle of a
 * dialog needs to say when it has the caret, and boxing it would undo the point
 * of the whole component; instead the hairline thickens and takes the accent,
 * and the currency eyebrow takes it too. Two cues, both drawn from the design
 * language rather than bolted onto it, and the native caret is visible besides.
 *
 * Keystrokes accumulate from the right — type `150000` for `1.500,00`, the way a
 * card terminal takes an amount. See `lib/moneyInput.ts` for why that is the
 * representation rather than a mask over free text.
 */
export default function AmountHero({
  value,
  onChange,
  currency,
  tone = 'neutral',
  label,
  autoFocus = false,
  error = false,
  helperText,
  caption,
}: AmountHeroProps): ReactElement {
  const locale = appLocale();
  const inputId = useId();
  const [focused, setFocused] = useState(false);
  const fractionDigits = currencyFractionDigits(currency, locale);
  const digits = digitsFromCanonical(value, fractionDigits);
  const empty = digits === '';

  const accent = error ? 'error.main' : 'primary.main';

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography
        variant="eyebrow"
        component="label"
        htmlFor={inputId}
        sx={{
          display: 'block',
          color: error ? 'error.main' : focused ? accent : 'text.secondary',
          mb: 0.5,
          transition: 'color 160ms',
        }}
      >
        {currency}
      </Typography>

      <Box
        component="input"
        id={inputId}
        aria-label={label}
        aria-invalid={error || undefined}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        value={formatDigits(digits, fractionDigits, locale)}
        placeholder={formatDigits('0', fractionDigits, locale)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) =>
          onChange(canonicalFromDigits(digitsFromInput(event.target.value), fractionDigits))
        }
        sx={{
          width: '100%',
          border: 0,
          background: 'none',
          textAlign: 'center',
          padding: 0,
          // Paired with the focused rule below: 8px against a 1px hairline and
          // 7px against the 2px accent, so the figure does not lift by a pixel
          // when it takes focus.
          paddingBottom: '8px',
          fontFamily: FONT_DISPLAY,
          // A high optical size is what keeps Fraunces from looking like body
          // copy blown up; the same axis setting the theme's `display` uses.
          fontVariationSettings: "'opsz' 96, 'SOFT' 0, 'WONK' 0",
          fontWeight: 600,
          fontSize: 'clamp(2rem, 9vw, 2.875rem)',
          lineHeight: 1.08,
          letterSpacing: '-0.022em',
          // Lining tabular figures so the amount does not visibly re-flow as
          // group separators appear and move during typing.
          fontVariantNumeric: 'tabular-nums lining-nums',
          color: empty ? 'text.disabled' : TONE_COLOR[tone],
          transition: 'color 200ms',
          // The rule beneath the figure: a hairline at rest, the accent at 2px
          // when focused. This is the component's focus indicator — see above.
          borderBottom: '1px solid',
          borderBottomColor: error ? 'error.main' : 'divider',
          borderRadius: 0,
          '&::placeholder': { color: 'text.disabled', opacity: 1 },
          // The global ring would draw a hard rectangle around a control whose
          // whole design is that it has no box. The rule below replaces it.
          '&:focus-visible': { outline: 'none !important' },
          '&:focus': {
            borderBottomWidth: 2,
            borderBottomColor: accent,
            paddingBottom: '7px',
          },
        }}
      />

      {helperText ? (
        <Typography
          variant="caption"
          component="p"
          sx={{ mt: 1, color: error ? 'error.main' : 'text.secondary' }}
        >
          {helperText}
        </Typography>
      ) : null}

      {caption ? (
        <Typography variant="body2" component="div" sx={{ mt: 1, color: 'text.secondary' }}>
          {caption}
        </Typography>
      ) : null}
    </Box>
  );
}
