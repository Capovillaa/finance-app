import { appLocale } from './format';
import type { Money } from '../api/types';

/**
 * Typing an amount, formatted as you go.
 *
 * A plain `<input>` bound to `register('amount')` shows exactly what was typed,
 * so `1500` stays `1500` while every *rendered* figure in the app is grouped and
 * carries a decimal mark. Entry was the one place the statement language stopped
 * applying, and the two conventions sat side by side in the same dialog.
 *
 * Everything here is a pure string function over a **digit string** — the amount
 * expressed in the currency's minor unit with no separators at all (`150000` is
 * one and a half thousand at two decimal places). That representation is what
 * makes the whole thing tractable:
 *
 *  - **The caret never has to be tracked.** Keystrokes accumulate from the right,
 *    the way an ATM or a card terminal takes an amount, so the caret is always at
 *    the end and no edit can strand it in the middle of a group separator that is
 *    about to move. Masking approaches that preserve an arbitrary caret position
 *    have to re-derive it after every reformat, and get it wrong around exactly
 *    the separators this app inserts.
 *  - **`onChange` needs no diffing.** The displayed value is always fully
 *    formatted, so stripping every non-digit from whatever the browser hands back
 *    recovers the new digit string whether the user typed, deleted, or pasted.
 *    Typing `5` after `1.500,00` gives `1.500,005` → `1500005` → `15.000,05`;
 *    backspacing gives `1.500,0` → `150000`... → `150,00`. Both fall out for free.
 *  - **No value is ever a `number`.** The canonical form is built by inserting a
 *    `.` into the digit string, which is the same reason `lib/format.ts` hands
 *    raw strings to `Intl` — a balance past 2^53 must not round on its way to
 *    the screen, and the server's `NUMERIC(19,4)` can hold figures that do.
 *
 * The number of decimal places is the **currency's**, not a constant: JPY takes
 * none and KWD takes three, so a hardcoded `2` would silently invent centavos
 * for a yen amount. It follows the account or workspace currency in force at the
 * call site, which is what makes the account dialog format against the currency
 * being chosen in that same form.
 */

/**
 * `Intl` builds a formatter on every call and both lookups below are hot — they
 * run per keystroke, per rendered field. The set of currencies in play is tiny
 * and fixed for a session, so memoising on `locale|currency` is worth the map.
 */
const fractionDigitsCache = new Map<string, number>();
const symbolCache = new Map<string, string>();

/**
 * How many decimal places this currency actually has.
 *
 * Asked of `Intl` rather than kept in a table here: the table would be a second
 * copy of a list the platform already ships and would go stale silently. Falls
 * back to 2 for a code `Intl` does not recognise, which is the right guess for
 * anything that reaches this point.
 */
export function currencyFractionDigits(currency: string, locale = appLocale()): number {
  const key = `${locale}|${currency}`;
  const cached = fractionDigitsCache.get(key);
  if (cached !== undefined) return cached;

  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // An unknown or malformed code. 2 is the overwhelmingly common case and is
    // better than refusing to render the field at all.
  }

  fractionDigitsCache.set(key, digits);
  return digits;
}

/**
 * The currency's symbol in this locale — `R$`, `€`, `¥`.
 *
 * Pulled out of a formatted zero with `formatToParts` rather than from a lookup
 * table, so it follows the locale's own convention: a Brazilian reading English
 * still sees `R$` for BRL, and `US$` where the locale distinguishes it.
 */
export function currencySymbol(currency: string, locale = appLocale()): string {
  const key = `${locale}|${currency}`;
  const cached = symbolCache.get(key);
  if (cached !== undefined) return cached;

  let symbol = currency;
  try {
    const part = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((candidate) => candidate.type === 'currency');
    if (part) symbol = part.value;
  } catch {
    // `narrowSymbol` is unsupported on older engines; the code itself reads fine.
  }

  symbolCache.set(key, symbol);
  return symbol;
}

/**
 * Recovers the digit string from whatever is currently in the input.
 *
 * Every non-digit goes, which is what lets one rule cover typing, deleting and
 * pasting a formatted amount (see the module comment). Leading zeros are dropped
 * so that `007` reads as `7` rather than growing the string without bound, but
 * an all-zero entry keeps a single `0` so the field can still show `0,00`.
 */
export function digitsFromInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const trimmed = digits.replace(/^0+/, '');
  if (trimmed === '') return digits === '' ? '' : '0';
  return trimmed;
}

/**
 * The digit string as the decimal the API expects: `150000` → `1500.00`.
 *
 * Built by padding and splicing rather than by dividing, because dividing means
 * a `number` and a `number` means the rounding this whole stack exists to avoid.
 * An empty digit string stays empty so a required-amount rule still fires
 * instead of the field quietly submitting a zero.
 */
export function canonicalFromDigits(digits: string, fractionDigits: number): Money {
  if (digits === '') return '';
  if (fractionDigits === 0) return digits;

  const padded = digits.padStart(fractionDigits + 1, '0');
  const whole = padded.slice(0, padded.length - fractionDigits);
  const fraction = padded.slice(padded.length - fractionDigits);
  return `${whole}.${fraction}`;
}

/**
 * The reverse, for seeding the field when editing an existing row.
 *
 * The API stores four decimal places, so an amount arrives as `1500.0000` while
 * a BRL field wants `150000`. The extra places are truncated rather than
 * rounded: they are only ever zeros for a figure that was itself entered
 * through a currency-aware field, and rounding here would edit someone's amount
 * as a side effect of opening the dialog to change its description.
 */
export function digitsFromCanonical(canonical: Money | null | undefined, fractionDigits: number): string {
  if (canonical === null || canonical === undefined || canonical === '') return '';

  const [whole = '', fraction = ''] = canonical.trim().replace(/^[+-]/, '').split('.');
  const scaled = fraction.slice(0, fractionDigits).padEnd(fractionDigits, '0');
  return digitsFromInput(`${whole}${scaled}`);
}

/**
 * The digit string as the user should see it: `150000` → `1.500,00` in pt-BR.
 *
 * Deliberately *not* `style: 'currency'` — the symbol is rendered beside the
 * field as an adornment or above it as an eyebrow, so that the figure itself
 * stays a clean run of digits that lines up with every other figure in the app.
 * Baking the symbol into the input's own value would also put it inside the
 * text the caret moves through.
 */
export function formatDigits(digits: string, fractionDigits: number, locale = appLocale()): string {
  if (digits === '') return '';

  const canonical = canonicalFromDigits(digits, fractionDigits);
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  // The string input path formats the decimal exactly; `Number` would round a
  // large balance at the 15th significant digit. Same reasoning, and the same
  // fallback, as `formatMoney` in `lib/format.ts`.
  try {
    return formatter.format(canonical as unknown as number);
  } catch {
    return formatter.format(Number(canonical));
  }
}

/** True when the digit string carries no value — `''` or all zeros. */
export function isBlankAmount(digits: string): boolean {
  return digits === '' || /^0+$/.test(digits);
}
