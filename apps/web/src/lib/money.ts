import type { Money } from '../api/types';

/**
 * Exact arithmetic on the API's decimal strings, for *display* only.
 *
 * The server owns money maths — `apps/api/src/lib/money.ts` and `decimal.js`
 * are the authority, and every figure the app shows comes from there. This
 * file exists for the one case the client genuinely cannot delegate: telling
 * someone, while they type, that their split shares do not yet add up. Waiting
 * for the server to say so on submit would be a worse form to fill in.
 *
 * It works on `BigInt` at the fixed four-decimal scale `NUMERIC(19,4)` stores,
 * so it is exact rather than approximately right. It deliberately offers only
 * addition and comparison: anything that needs multiplication, division or
 * rounding is a real calculation and belongs on the server, where half-even
 * rounding is applied consistently.
 */
const SCALE = 4;

/** `"12.5"` → `125000n`. Null when the text is not a decimal the API would accept. */
function toScaled(amount: Money): bigint | null {
  const trimmed = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;

  const negative = trimmed.startsWith('-');
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.');
  // More precision than the column keeps would round, and rounding is the
  // server's job — refuse rather than guess.
  if (fraction.length > SCALE) return null;

  const value = BigInt(`${whole}${fraction.padEnd(SCALE, '0')}`);
  return negative ? -value : value;
}

function fromScaled(value: bigint): Money {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(SCALE + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
}

/** Null if any input is not a decimal string, so a half-typed field never reads as zero. */
export function sumMoney(amounts: Money[]): Money | null {
  let total = 0n;

  for (const amount of amounts) {
    const scaled = toScaled(amount);
    if (scaled === null) return null;
    total += scaled;
  }

  return fromScaled(total);
}

/** Value equality, so `"10"`, `"10.0"` and `"10.0000"` all match. */
export function equalMoney(a: Money, b: Money): boolean {
  const left = toScaled(a);
  const right = toScaled(b);
  return left !== null && right !== null && left === right;
}
