/**
 * Exact rational arithmetic utility for deterministic business workload calculations.
 * Avoids binary floating-point drift during intermediate calculations.
 * Only rounds at the designated output boundary (4 decimal places).
 */

export interface Rational {
  readonly n: bigint; // numerator
  readonly d: bigint; // denominator (always > 0)
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function makeRational(numerator: bigint, denominator: bigint = 1n): Rational {
  if (denominator === 0n) {
    throw new Error('Denominator cannot be zero.');
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const g = gcd(numerator, denominator);
  return {
    n: numerator / g,
    d: denominator / g,
  };
}

export const ZERO_RATIONAL: Rational = { n: 0n, d: 1n };
export const ONE_RATIONAL: Rational = { n: 1n, d: 1n };

/**
 * Parse a finite non-negative number with at most 4 decimal places into an exact Rational.
 */
export function rationalFromNumber(val: number): Rational {
  if (!Number.isFinite(val) || Number.isNaN(val)) {
    throw new Error(`Invalid number for exact rational conversion: ${val}`);
  }
  const s = val.toString();
  if (s.includes('e') || s.includes('E')) {
    throw new Error(`Scientific notation unsupported for exact decimal conversion: ${val}`);
  }
  return rationalFromString(s);
}

/**
 * Parse a decimal string (e.g., "17", "1.005", "0.1234") into an exact Rational.
 */
export function rationalFromString(s: string): Rational {
  const trimmed = s.trim();
  const isNegative = trimmed.startsWith('-');
  const clean = isNegative ? trimmed.slice(1) : trimmed;

  const parts = clean.split('.');
  if (parts.length > 2) {
    throw new Error(`Invalid decimal string: ${s}`);
  }

  const integerPart = parts[0] === '' ? '0' : parts[0];
  const fractionalPart = parts.length === 2 ? parts[1] : '';

  const scale = 10n ** BigInt(fractionalPart.length);
  const n = BigInt(integerPart) * scale + BigInt(fractionalPart || '0');
  const signedN = isNegative ? -n : n;

  return makeRational(signedN, scale);
}

export function rationalAdd(a: Rational, b: Rational): Rational {
  const num = a.n * b.d + b.n * a.d;
  const den = a.d * b.d;
  return makeRational(num, den);
}

export function rationalSub(a: Rational, b: Rational): Rational {
  const num = a.n * b.d - b.n * a.d;
  const den = a.d * b.d;
  return makeRational(num, den);
}

export function rationalMul(a: Rational, b: Rational): Rational {
  return makeRational(a.n * b.n, a.d * b.d);
}

export function rationalDiv(a: Rational, b: Rational): Rational {
  if (b.n === 0n) {
    throw new Error('Division by zero in Rational division.');
  }
  return makeRational(a.n * b.d, a.d * b.n);
}

export function rationalDivInt(a: Rational, k: number | bigint): Rational {
  const bigK = BigInt(k);
  if (bigK <= 0n) {
    throw new Error(`Divisor must be a positive integer, got ${k}`);
  }
  return makeRational(a.n, a.d * bigK);
}

export function rationalMax(a: Rational, b: Rational): Rational {
  // a >= b <=> a.n * b.d >= b.n * a.d
  return a.n * b.d >= b.n * a.d ? a : b;
}

export function rationalCompare(a: Rational, b: Rational): number {
  const diff = a.n * b.d - b.n * a.d;
  if (diff < 0n) return -1;
  if (diff > 0n) return 1;
  return 0;
}

export function rationalEquals(a: Rational, b: Rational): boolean {
  return a.n * b.d === b.n * a.d;
}

/**
 * Deterministic rounding at output boundary to 4 fractional decimal places (half-up).
 */
export function rationalRound4(r: Rational): number {
  if (r.n === 0n) return 0;
  const isNegative = r.n < 0n;
  const absN = isNegative ? -r.n : r.n;

  // We want to scale by 10^4 and round half-up:
  // (absN * 10000 + d / 2) / d
  const scaled = absN * 10000n;
  const quotient = scaled / r.d;
  const remainder = scaled % r.d;

  let roundedQuotient = quotient;
  // Half-up: if 2 * remainder >= denominator, round up
  if (2n * remainder >= r.d) {
    roundedQuotient += 1n;
  }

  const intPart = roundedQuotient / 10000n;
  const fracPart = roundedQuotient % 10000n;

  const formattedStr = `${isNegative ? '-' : ''}${intPart}.${fracPart.toString().padStart(4, '0')}`;
  return parseFloat(formattedStr);
}

/**
 * Exact addition of numbers rounded only at output boundary 4 decimals.
 */
export function exactAdd(a: number, b: number): number {
  return rationalRound4(rationalAdd(rationalFromNumber(a), rationalFromNumber(b)));
}

/**
 * Exact subtraction of numbers rounded only at output boundary 4 decimals.
 */
export function exactSub(a: number, b: number): number {
  return rationalRound4(rationalSub(rationalFromNumber(a), rationalFromNumber(b)));
}

/**
 * Sum a list of numbers with exact rational accumulator and round once at the end.
 */
export function exactSum(values: readonly number[]): number {
  let acc = ZERO_RATIONAL;
  for (const v of values) {
    acc = rationalAdd(acc, rationalFromNumber(v));
  }
  return rationalRound4(acc);
}
