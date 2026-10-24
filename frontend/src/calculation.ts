// Input parsing and result formatting only. All arithmetic is done by the backend.

export type ParsedOperand =
  | { ok: true; value: number }
  | { ok: false; error: string };

// Plain decimal notation: optional sign, digits, optional fraction ("5", "-2.5", ".5", "5.").
// Rejects exponents, hex, "Infinity", thousands separators, etc.
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

// Beyond ±(2^53 − 1) a JavaScript number cannot represent every integer, so the value sent
// would silently differ from the one typed (e.g. 9007199254740993 becomes ...992).
const OUT_OF_RANGE_ERROR = `Enter a number between -${Number.MAX_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}.`;

export function parseOperand(text: string): ParsedOperand {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a number.' };
  if (!DECIMAL.test(trimmed)) {
    return { ok: false, error: 'Enter a valid number, such as 12, -3.5 or 0.25.' };
  }
  const value = Number(trimmed);
  // Also rejects Infinity from overly long input.
  if (!(Math.abs(value) <= Number.MAX_SAFE_INTEGER)) return { ok: false, error: OUT_OF_RANGE_ERROR };
  return { ok: true, value };
}

/**
 * Formats a backend result for display. Integers are shown exactly as received. Other values
 * are rounded to 12 significant digits, but never to fewer than 3 decimal places, to hide float
 * artefacts like 0.30000000000000004 without dropping the fraction of large values such as
 * 1234567890123.5. Past ~16 digits the rounding is a no-op and JavaScript's shortest
 * round-trip representation is shown.
 */
export function formatResult(value: number): string {
  // Number#toString never prints "-0"; normalise anyway so intent is explicit.
  if (Number.isInteger(value)) return String(value === 0 ? 0 : value);
  const integerDigits = String(Math.trunc(Math.abs(value))).length;
  return String(Number(value.toPrecision(Math.max(12, integerDigits + 3))));
}
