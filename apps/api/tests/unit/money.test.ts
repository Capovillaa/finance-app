import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  money,
  multiply,
  percentOf,
  splitByWeights,
  splitEvenly,
  subtract,
  sum,
} from '../../src/lib/money.js';

describe('money', () => {
  it('normalises every amount to four decimal places', () => {
    expect(money('10')).toBe('10.0000');
    expect(money(10.5)).toBe('10.5000');
    expect(money('-3.14159')).toBe('-3.1416');
  });

  it('adds without floating point drift', () => {
    // The canonical float failure: 0.1 + 0.2 !== 0.3
    expect(add('0.1', '0.2')).toBe('0.3000');
    expect(sum(['0.1', '0.2', '0.3', '0.4'])).toBe('1.0000');
  });

  it('keeps precision across many additions', () => {
    let total = '0';
    for (let i = 0; i < 1000; i += 1) total = add(total, '0.01');
    expect(total).toBe('10.0000');
  });

  it('subtracts and multiplies exactly', () => {
    expect(subtract('100.00', '33.33')).toBe('66.6700');
    expect(multiply('19.99', '3')).toBe('59.9700');
  });

  it('compares amounts numerically, not lexicographically', () => {
    expect(compare('9.00', '10.00')).toBe(-1);
    expect(compare('10.0000', '10')).toBe(0);
    expect(compare('100', '99.99')).toBe(1);
  });

  it('treats a zero total as 0% rather than dividing by zero', () => {
    expect(percentOf('50', '200')).toBe(25);
    expect(percentOf('50', '0')).toBe(0);
  });
});

describe('splitEvenly', () => {
  it('distributes the remainder so the parts sum to the whole', () => {
    const shares = splitEvenly('100.00', 3);
    expect(shares).toHaveLength(3);
    expect(sum(shares)).toBe('100.0000');
  });

  it('handles amounts that divide exactly', () => {
    expect(splitEvenly('90.00', 3)).toEqual(['30.0000', '30.0000', '30.0000']);
  });

  it('splits negative amounts without losing a cent', () => {
    const shares = splitEvenly('-10.00', 3);
    expect(sum(shares)).toBe('-10.0000');
  });

  it('rejects a non-positive participant count', () => {
    expect(() => splitEvenly('10', 0)).toThrow();
  });
});

describe('splitByWeights', () => {
  it('allocates proportionally and reconciles to the total', () => {
    const shares = splitByWeights('100.00', ['1', '1', '2']);
    expect(sum(shares)).toBe('100.0000');
    expect(compare(shares[2]!, shares[0]!)).toBe(1);
  });

  it('reconciles when the weights do not divide cleanly', () => {
    const shares = splitByWeights('10.00', ['1', '1', '1']);
    expect(sum(shares)).toBe('10.0000');
  });

  it('rejects weights that sum to zero', () => {
    expect(() => splitByWeights('10', ['0', '0'])).toThrow();
  });
});
