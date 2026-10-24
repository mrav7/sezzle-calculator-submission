import { describe, expect, it } from 'vitest';
import { formatResult, parseOperand } from './calculation';

describe('parseOperand', () => {
  it.each([
    ['5', 5],
    ['-3.5', -3.5],
    ['+2', 2],
    ['.5', 0.5],
    ['5.', 5],
    ['  42  ', 42],
    ['0', 0],
    ['0.0', 0],
    ['-0', -0],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['-9007199254740991', -Number.MAX_SAFE_INTEGER],
  ])('accepts %j', (text, value) => {
    expect(parseOperand(text)).toEqual({ ok: true, value });
  });

  it.each(['', '   ', '\t\n'])('rejects empty input %j instead of treating it as 0', (text) => {
    expect(parseOperand(text)).toEqual({ ok: false, error: 'Enter a number.' });
  });

  it.each(['abc', '1,5', '1 2', '--1', '.', '-', '1e5', '0x10', 'Infinity', 'NaN', '1..2'])(
    'rejects non-numeric input %j',
    (text) => {
      const result = parseOperand(text);
      expect(result.ok).toBe(false);
    },
  );

  it.each([
    '9007199254740992',
    '9007199254740993',
    '-9007199254740993',
    '12345678901234567890.5',
    '9'.repeat(400),
  ])('rejects %s, which a JavaScript number cannot hold exactly', (text) => {
    expect(parseOperand(text)).toEqual({
      ok: false,
      error: 'Enter a number between -9007199254740991 and 9007199254740991.',
    });
  });
});

describe('formatResult', () => {
  // Inputs are written as the literal float64 the backend would return, so each case states
  // exactly which number is being formatted.
  it.each([
    [15, '15'],
    [-2.5, '-2.5'],
    [1234567.891, '1234567.891'],
    [-0, '0'],
    [0, '0'],
    // Binary floating-point artefacts are hidden.
    [0.30000000000000004, '0.3'], // 0.1 + 0.2
    [-0.30000000000000004, '-0.3'],
    [0.7999999999999999, '0.8'], // 0.7 + 0.1
    [1.2100000000000002, '1.21'], // 1.1 × 1.1
    [434.99999999999994, '435'], // 4.35 × 100
    // Cancellation leaves an artefact in the 14th digit; 12 significant digits still hide it.
    [0.09999999999999432, '0.1'], // 100.1 − 100
    // Repeating decimals are cut to 12 significant digits.
    [0.3333333333333333, '0.333333333333'],
    [0.6666666666666666, '0.666666666667'],
    // Small values: 12 significant digits, in exponent notation below 1e-6.
    [0.000123456789012345, '0.000123456789012'],
    [1e-7, '1e-7'],
    [1.5e-10, '1.5e-10'],
    [3.333333333333333e-7, '3.33333333333e-7'],
    // Integers are shown exactly, without significant-digit rounding.
    [-42, '-42'],
    [123456789012345, '123456789012345'],
    [-123456789012345, '-123456789012345'],
    [9007199254740991, '9007199254740991'],
    [-9007199254740991, '-9007199254740991'],
    // Large non-integers keep their fraction (at least 3 decimal places).
    [1234567890123.5, '1234567890123.5'],
    [-1234567890123.5, '-1234567890123.5'],
    [1234567890123.25, '1234567890123.25'],
    [99999999999.25, '99999999999.25'],
    [123456789012345.1, '123456789012345.1'],
    [4503599627370495.5, '4503599627370495.5'], // 2^52 − 0.5, the last .5 below 2^52
    // ...while artefacts at these magnitudes are still hidden.
    [1000000000.3000001, '1000000000.3'], // 1000000000.1 + 0.2
    [10000000000.300001, '10000000000.3'], // 10000000000.1 + 0.2
    [3333333333.3333335, '3333333333.333'], // 1e10 / 3
    // Near powers of ten the integer part is kept and the fraction is not rounded away.
    [9999999999.5, '9999999999.5'],
    [999999999999.5, '999999999999.5'],
    [999999999999999.5, '999999999999999.5'],
    [99.99999999999999, '100'], // artefact, not a real fraction
    // From 1e21, JavaScript uses exponent notation.
    [1e21, '1e+21'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatResult(value)).toBe(expected);
  });

  it('rounds away digits beyond the kept precision, even across a power of ten', () => {
    // Documented trade-off: below 1e9 only 12 significant digits are kept, so 0.0005 short of
    // 1e9 cannot be told apart from an artefact such as 99.99999999999999.
    expect(formatResult(999999999.9995)).toBe('1000000000');
  });
});
