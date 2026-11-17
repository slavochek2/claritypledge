/**
 * @file stats.ts
 * @description Small statistics helpers for the P1702 runner: summaries, Student-t intervals,
 * tie-aware comparisons and ranks, OLS slope.
 */

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

export const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

/** Two-sided 95% Student-t critical values t_{0.975, df} for df = 1..30. */
const T975 = [
  12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.306, 2.2622, 2.2281, 2.201, 2.1788, 2.1604, 2.1448,
  2.1314, 2.1199, 2.1098, 2.1009, 2.093, 2.086, 2.0796, 2.0739, 2.0687, 2.0639, 2.0595, 2.0555, 2.0518, 2.0484,
  2.0452, 2.0423,
];

export function tCrit95(df: number): number {
  if (!Number.isInteger(df) || df < 1) throw new Error(`tCrit95: df must be a positive integer (got ${df})`);
  return df <= T975.length ? T975[df - 1] : 1.96;
}

/** Mean with a two-sided 95% Student-t interval, clamped to [lo, hi] (a proportion lives in [0, 1]). */
export function meanCI(xs: number[], bounds: [number, number] = [0, 1]): { mean: number; lo: number; hi: number } {
  const m = mean(xs);
  const h = xs.length > 1 ? (tCrit95(xs.length - 1) * sd(xs)) / Math.sqrt(xs.length) : Infinity;
  return { mean: m, lo: Math.max(bounds[0], m - h), hi: Math.min(bounds[1], m + h) };
}

/**
 * Numerical-tie tolerance, RELATIVE to the larger magnitude compared. Abundances in this model span
 * ~10^-3000 (in log space) to 1, so an absolute tolerance would either miss float noise on large values
 * or swallow real differences between rare strategies. Float noise in the solver is ~1e-15 relative.
 */
export const TIE_REL = 1e-9;

function finiteOrThrow(where: string, ...xs: number[]): void {
  if (xs.some((x) => Number.isNaN(x))) throw new Error(`${where}: NaN input (${xs.join(', ')}); a missing value must not vote`);
}

/** Sign of a - b, 0 when they agree to within TIE_REL of the larger magnitude. Throws on NaN. */
export function cmp(a: number, b: number, rel = TIE_REL): -1 | 0 | 1 {
  finiteOrThrow('cmp', a, b);
  const d = a - b;
  if (Math.abs(d) <= rel * Math.max(Math.abs(a), Math.abs(b))) return 0;
  return d > 0 ? 1 : -1;
}

/** Sign of v, 0 when |v| <= rel * scale. Throws on NaN. */
export function signTol(v: number, scale: number, rel = TIE_REL): -1 | 0 | 1 {
  finiteOrThrow('signTol', v, scale);
  if (Math.abs(v) <= rel * Math.abs(scale)) return 0;
  return v > 0 ? 1 : -1;
}

/** Largest magnitude in xs: the scale for ties among the top of an array. */
const arrayScale = (xs: number[]) => xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/** Differences below this are underflow artefacts (the grid's smallest abundance is ~1e-33). */
const TIE_ABS = 1e-300;

/** xs[i] ties the top value: within TIE_REL of the array's largest magnitude, or below TIE_ABS. */
function tiesTop(xs: number[], i: number, best: number): boolean {
  finiteOrThrow('strictArgmax', xs[i], xs[best]);
  return Math.abs(xs[i] - xs[best]) <= Math.max(TIE_REL * arrayScale(xs), TIE_ABS);
}

/**
 * Index of the strictly largest value, or -1 when the top two tie. The tie scale is the array's largest
 * magnitude, so negative or all-zero inputs behave (on a probability simplex this equals cmp()).
 */
export function strictArgmax(xs: number[]): number {
  let best = -1;
  for (let i = 0; i < xs.length; i++) if (best < 0 || xs[i] > xs[best]) best = i;
  for (let i = 0; i < xs.length; i++) if (i !== best && tiesTop(xs, i, best)) return -1;
  return best;
}

/**
 * Descending mid-rank of xs[k] (1 = largest); values within TIE_REL share the mean of their ranks.
 * Pairwise-relative on purpose: abundances come from a log-space solver, so two rare strategies at
 * 1e-30 and 2e-30 are genuinely different and must not tie just because the array also holds a 0.9.
 */
export function midRank(xs: number[], k: number): number {
  let above = 0, tied = 0;
  for (let i = 0; i < xs.length; i++) {
    const c = cmp(xs[i], xs[k]);
    if (c > 0) above++;
    else if (c === 0) tied++;
  }
  return above + (tied + 1) / 2;
}

/** OLS slope of ys on xs. */
export function olsSlope(xs: number[], ys: number[]): number {
  const xm = mean(xs), ym = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - xm) * (ys[i] - ym); den += (xs[i] - xm) ** 2; }
  return num / den;
}

/**
 * Median with numerical ties set to exactly 0 (values[i] replaced by 0 where signs[i] === 0), so the
 * median's sign cannot be decided by float noise.
 */
export function tieAwareMedian(values: number[], signs: number[]): number {
  return quantile(values.map((v, i) => (signs[i] === 0 ? 0 : v)), 0.5);
}

/** Share of values in each sign class. */
export function signShares(signs: number[]): { pos: number; neg: number; tie: number } {
  const n = signs.length;
  return {
    pos: signs.filter((s) => s > 0).length / n,
    neg: signs.filter((s) => s < 0).length / n,
    tie: signs.filter((s) => s === 0).length / n,
  };
}

/**
 * The single most abundant strategy: strictly above second place (beyond float noise, TIE_REL). When
 * the top places tie, returns "TIE(<ids>)" so that no tied strategy is credited with a win.
 */
export function topLabel(ids: string[], shares: number[]): string {
  const k = strictArgmax(shares);
  if (k >= 0) return ids[k];
  const top = shares.indexOf(Math.max(...shares));
  return `TIE(${ids.filter((_, i) => tiesTop(shares, i, top)).join('/')})`;
}
