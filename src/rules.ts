// Multiplier, payout and the max-win rule of HouseBets Hubie's Road (new engine), in exact integer arithmetic. The board is
// 25 slots (N = 25 below); a difficulty is its trap count m.
//   multiplier after k safe lanes with m traps = 99/100 × C(25, k) / C(25 − m, k)               (E01 "multiplier")
//   payout = floor(stake × that fraction) on the wallet's 1e-8 grid, rounded down once           (E01 rules)
//   the served `multiplier` field is that fraction as the nearest binary64 (measured: ROAD-13)
//   a step that would take the cash-out value past the round's max win is not taken: lane k is allowed iff
//   payout(k) − stake ≤ maxWin (maxWin ≤ 0: no cap)                                              (E01 rules)
// Amounts are carried as bigint 1e-8 units; decimals from JSON are converted through their 8-decimal string form.

export const comb = (n: number, k: number): bigint => {
  if (k < 0 || k > n) return 0n;
  let r = 1n; for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1);
  return r;
};

/** The formula's coefficient 99/100 (E01 "multiplier" "× 99/100 ×", E02 rulesRoadReturn "0.99 ×"); ROAD-26 asserts at run time
 *  that both exhibits still state it (src/exhibits.ts publishedCoefficient). */
export const MULT_NUM = 99n, MULT_DEN = 100n;
/** The multiplier as an exact fraction [numerator, denominator]. */
export const multFrac = (N: number, m: number, k: number): [bigint, bigint] => [MULT_NUM * comb(N, k), MULT_DEN * comb(N - m, k)];

/** floor(stake × multiplier) in 1e-8 units. */
export const pay8 = (stake8: bigint, N: number, m: number, k: number): bigint => { const [a, b] = multFrac(N, m, k); return (stake8 * a) / b; };

/** The nearest binary64 to num/den (round half to even), exact for any size of bigint. */
export function fracToDouble(num: bigint, den: bigint): number {
  if (num === 0n) return 0;
  const bl = (x: bigint) => x.toString(2).length;
  let s = 54 - (bl(num) - bl(den));               // aim for a quotient of 54 or 55 bits
  let q: bigint, r: bigint;
  for (;;) {
    const n = s >= 0 ? num << BigInt(s) : num, d = s >= 0 ? den : den << BigInt(-s);
    q = n / d; r = n % d;
    if (bl(q) > 54) { s--; continue; } if (bl(q) < 54) { s++; continue; } break;
  }
  let m53 = q >> 1n; const half = q & 1n, sticky = r !== 0n;
  if (half === 1n && (sticky || (m53 & 1n) === 1n)) m53 += 1n;
  return Number(m53) * 2 ** (1 - s);
}

/** The served multiplier: the fraction's nearest binary64. */
export const multDouble = (N: number, m: number, k: number): number => { const [a, b] = multFrac(N, m, k); return fracToDouble(a, b); };

/** A decimal number (as JSON gave it) to integer 1e-8 units, through its 8-decimal string form. */
export function units8(x: number | string): bigint {
  const s = typeof x === 'number' ? x.toFixed(8) : String(x);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`not a decimal: ${s}`);
  const [i, f = ''] = s.replace('-', '').split('.');
  if (f.length > 8 && /[1-9]/.test(f.slice(8))) throw new Error(`more than 8 decimals: ${s}`);
  const v = BigInt(i) * 100000000n + BigInt((f + '00000000').slice(0, 8));
  return s.startsWith('-') ? -v : v;
}

/** The max-win rule: is lane k allowed at this stake under this cap (both 1e-8 units)? */
export const allowed = (stake8: bigint, cap8: bigint | null, N: number, m: number, k: number): boolean =>
  cap8 === null || cap8 <= 0n || pay8(stake8, N, m, k) - stake8 <= cap8;

/** The chance that k lanes are all safe: C(N − m, k) / C(N, k), and its product form Π (N − m − i)/(N − i). */
export const survivalComb = (N: number, m: number, k: number): [bigint, bigint] => [comb(N - m, k), comb(N, k)];
export function survivalProduct(N: number, m: number, k: number): [bigint, bigint] {
  let a = 1n, b = 1n; for (let i = 0; i < k; i++) { a *= BigInt(N - m - i); b *= BigInt(N - i); } return [a, b];
}
