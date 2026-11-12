import type { Fraction, Note } from '../model/index.js';
/** A non-negative rational, `num / den`, kept reduced with `den > 0`. Exactly
 *  the model's `Fraction`; the alias names its use here (counting time). */
export type Rational = Fraction;
export declare const ZERO: Rational;
export declare function gcd(a: number, b: number): number;
export declare function lcm(a: number, b: number): number;
export declare function reduce(r: Rational): Rational;
export declare function mul(a: Rational, b: Rational): Rational;
export declare function add(a: Rational, b: Rational): Rational;
export declare function sub(a: Rational, b: Rational): Rational;
/** Negative, zero or positive as `a` is less than, equal to or greater than `b`. */
export declare function compare(a: Rational, b: Rational): number;
/** A note's duration in quarter notes, exact, dots and tuplet ratio folded in
 *  the same way `Note.durationWholes` folds them, but as a reduced fraction. */
export declare function noteDurationQuarters(note: Note): Rational;
/**
 * A whole-measure rest's length, which the model holds as a float (a time
 * signature's `beats / beatType`, e.g. 0.375 for 3/8), back as an exact
 * fraction of quarters: the smallest denominator that makes it whole. Any
 * real time signature's beat type is a small power of two (or, rarely, some
 * other small integer), so the search ends almost at once; the cap only
 * guards a corrupt value from looping, falling back to the float rounded at
 * 1/1024 of a quarter.
 */
export declare function quartersFromWholes(wholes: number): Rational;
/** Quarters to the model's unit (whole notes), and back. */
export declare function quartersToWholes(quarters: Rational): Rational;
export declare function wholesToQuarters(wholes: Rational): Rational;
