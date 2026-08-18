import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Money } from '../api/types';
import { appLocale } from '../lib/format';
import {
  canonicalFromDigits,
  currencyFractionDigits,
  currencySymbol,
  digitsFromCanonical,
  digitsFromInput,
  formatDigits,
} from '../lib/moneyInput';
import { FONT_MONO } from '../theme';

type PassThrough = Omit<TextFieldProps, 'value' | 'onChange' | 'type' | 'placeholder'>;

interface MoneyFieldProps extends PassThrough {
  /** The canonical decimal the API takes: `'1500.00'`, or `''` for empty. */
  value: Money;
  onChange: (value: Money) => void;
  /** Decides both the decimal places and the symbol shown beside the figure. */
  currency: string;
  /** Hides the leading symbol where the surrounding layout already names the currency. */
  hideSymbol?: boolean;
  /**
   * Offers a sign toggle. Most amounts in this app are magnitudes whose
   * direction is carried by something else — a type, a column, a transfer's two
   * legs — but an opening balance and a reconciled statement balance are real
   * signed figures: a credit card starts owing money and an overdrawn account
   * is genuinely below zero. Their schemas use `isMoneyText`, not
   * `isPositiveMoneyText`, and this is the half of that rule the UI owes them.
   */
  allowNegative?: boolean;
}

/**
 * A field for typing an amount, grouped and pointed as the user types.
 *
 * Bound with `value`/`onChange` rather than `register()`, for the reason
 * `tagIds` is: react-hook-form's ref binding writes straight to the DOM node
 * without telling React, and a field whose display is *derived* from its value
 * has to re-render to reformat. The dialogs drive it with `watch`/`setValue`.
 *
 * It holds **no state of its own.** The digit string is recovered from the
 * canonical value on every render, so there is no second copy to fall out of
 * step with the form — reset, server-set errors and seeding an existing row all
 * work without this component knowing they happened. See `lib/moneyInput.ts`
 * for why keystrokes accumulate from the right.
 */
export default function MoneyField({
  value,
  onChange,
  currency,
  hideSymbol = false,
  allowNegative = false,
  slotProps,
  // Pulled out rather than spread: on a `TextField` this would land on the
  // wrapper `div`, leaving the input itself unnamed. It is forwarded to the
  // native element below.
  'aria-label': ariaLabel,
  ...rest
}: MoneyFieldProps): ReactElement {
  const { t } = useTranslation();
  const locale = appLocale();
  const fractionDigits = currencyFractionDigits(currency, locale);

  const negative = value.trimStart().startsWith('-');
  const digits = digitsFromCanonical(value, fractionDigits);

  const emit = (nextDigits: string, nextNegative: boolean): void => {
    const magnitude = canonicalFromDigits(nextDigits, fractionDigits);
    // An empty field stays empty rather than becoming a lone `-`, so a
    // "required" rule still fires on it and an optional one still sees nothing.
    onChange(magnitude === '' || !nextNegative ? magnitude : `-${magnitude}`);
  };

  const symbol = currencySymbol(currency, locale);

  return (
    <TextField
      {...rest}
      value={`${negative ? '-' : ''}${formatDigits(digits, fractionDigits, locale)}`}
      placeholder={formatDigits('0', fractionDigits, locale)}
      onChange={(event) => {
        const raw = event.target.value;
        // Typing a `-` anywhere sets the sign, and clearing the field clears it.
        // The accumulator only ever sees digits, so the sign character can never
        // interfere with where the caret sits.
        emit(digitsFromInput(raw), allowNegative && raw.includes('-'));
      }}
      slotProps={{
        ...slotProps,
        input: {
          startAdornment: hideSymbol ? undefined : (
            <InputAdornment position="start" sx={{ mr: 0.75 }}>
              {allowNegative ? (
                <Tooltip title={t('common.toggleSign')}>
                  <IconButton
                    size="small"
                    edge="start"
                    aria-label={t('common.toggleSign')}
                    aria-pressed={negative}
                    onClick={() => emit(digits, !negative)}
                    sx={{ borderRadius: 1.5, px: 0.75, minWidth: 0 }}
                  >
                    <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: '0.875rem' }}>
                      {negative ? `−${symbol}` : symbol}
                    </Box>
                  </IconButton>
                </Tooltip>
              ) : (
                symbol
              )}
            </InputAdornment>
          ),
          ...slotProps?.input,
        },
        htmlInput: {
          // These belong on the native `<input>`, and `slotProps.input` is not
          // it: that slot is the `InputBase` *wrapper*, so an `inputMode` set
          // there lands on a `div` and a phone keyboard never hears about it.
          // `slotProps.htmlInput` is the one that reaches the element.
          //
          // `decimal` rather than `numeric` so a phone keypad still offers the
          // separator key — the field ignores it, but a keypad without one looks
          // broken next to an amount that visibly has a decimal mark.
          inputMode: 'decimal',
          autoComplete: 'off',
          // Tabular mono while typing, matching every rendered figure in the
          // app: without it the digits shift sideways each time a group
          // separator is inserted, which reads as the field correcting itself.
          style: { fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' },
          ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
          ...slotProps?.htmlInput,
        },
      }}
    />
  );
}
