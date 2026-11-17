/**
 * @file exp-novel.ts
 * @description P1702 experiment 4, the novel prediction: does GAP's advantage over GTFT grow as error
 * shifts from slips to misreadings?
 */
import { stationaryLog } from './dynamics';
import { ALL, FULL, checkableFrom, sub, type Grid, type Log, type Table } from './grid';
import { DEFAULT_PARAMS, buildMatrices, mixMatrices, type Params } from './model';
import { olsSlope, quantile, signShares, signTol, tieAwareMedian } from './stats';

interface Series {
  /** x_GAP - x_GTFT at each sigma. */
  adv: number[];
  /** log x_GAP - log x_GTFT at each sigma, from the log-space stationary vector (cannot underflow). */
  logRatio: number[];
  /** Largest abundance (GAP or GTFT) over the series: the scale for the numerical-tie test. */
  scale: number;
}

/** Nuisance-cell key: (epsTotal, b, d, r, m, beta). */
const nKey = (et: number, b: number, d: number, r: number, m: number, beta: number) => `${et}|${b}|${d}|${r}|${m}|${beta}`;

/** Fill every nuisance cell's value at sigma index si, for total error et and benefit b. */
function fillSigma(g: Grid, et: number, b: number, si: number, out: { series: Map<string, Series>; rows: (string | number)[][] }): void {
  const ids = FULL;
  const sig = g.sigma[si];
  const p0: Params = { ...DEFAULT_PARAMS, b, epsS: et * (1 - sig), epsM: et * sig, q: 0.9 };
  const plain = buildMatrices(ALL, p0, 0);
  for (const d of g.d)
    for (const r of g.r) {
      const chk = checkableFrom(plain, { ...p0, d, r });
      for (const m of g.m) {
        const mix = mixMatrices(plain, chk, m);
        for (const beta of g.beta) {
          const lx = stationaryLog(sub(mix.pay, ids), g.N, beta);
          const lgap = lx[ids.indexOf('GAP')], lt = lx[ids.indexOf('GTFT')];
          if (!Number.isFinite(lgap) || !Number.isFinite(lt)) throw new Error(`novel prediction: non-finite log abundance at ${et}|${b}|${d}|${r}|${m}|${beta}`);
          const gap = Math.exp(lgap), t = Math.exp(lt);
          const k = nKey(et, b, d, r, m, beta);
          let s = out.series.get(k);
          if (!s) {
            s = { adv: new Array(g.sigma.length), logRatio: new Array(g.sigma.length), scale: 0 };
            out.series.set(k, s);
          }
          s.adv[si] = gap - t;
          s.scale = Math.max(s.scale, gap, t);
          s.logRatio[si] = lgap - lt;
          out.rows.push([et, sig, b, d, r, m, beta, gap, t, gap - t]);
        }
      }
    }
}

/** A slope with its numerical-tie scale. */
interface Slope {
  v: number;
  /** Magnitude against which a numerical tie is judged. */
  scale: number;
  /** Largest abundance of GAP or GTFT over the series (presence test). */
  presence: number;
}

/**
 * Presence tolerance (review round). A nuisance cell in which neither GAP nor GTFT ever reaches this
 * stationary abundance, at any sigma, says nothing about their difference: both are absent. Its slope
 * counts as a tie (0). 1e-12 is the absolute tie tolerance suggested in review; other thresholds are
 * reported as a sensitivity check.
 */
export const PRESENCE_TOL = 1e-12;

/** Tie-aware sign of a slope: 0 if both strategies are absent, or the slope is within TIE_REL of the scale. */
const slopeSign = (s: Slope, presence: number) => (s.presence < presence ? 0 : signTol(s.v, s.scale));

/**
 * The pre-registered rule, applied directly to slopes (review round 2):
 *  - CORROBORATED if >= 75% of cells are strictly positive (ties count as not positive) AND the median
 *    slope > 0;
 *  - REFUTED if the median slope <= 0;
 *  - otherwise INCONCLUSIVE.
 * The median is tie-aware: a slope within noise, or from a cell where both strategies are absent, counts
 * as exactly 0. One exception, made on reviewer advice: when that median is exactly 0 and absent cells
 * exist, the median sits on cells that carry no information, so the result is NOT CORROBORATED rather
 * than REFUTED. A median of 0 made only of present, flat slopes is still REFUTED.
 */
export function novelVerdict(slopes: number[], signs: number[], absent: boolean[]): string {
  const med = tieAwareMedian(slopes, signs);
  if (med < 0) return 'REFUTED';
  if (med === 0) return absent.some(Boolean) ? 'NOT CORROBORATED (median cell uninformative)' : 'REFUTED';
  return signShares(signs).pos >= 0.75 ? 'CORROBORATED' : 'INCONCLUSIVE';
}

function slopeSummary(slopes: Slope[], presence = PRESENCE_TOL) {
  const signs = slopes.map((s) => slopeSign(s, presence));
  const sh = signShares(signs);
  const v = slopes.map((s) => s.v);
  const absent = slopes.map((s) => s.presence < presence);
  return {
    cells: slopes.length,
    median: quantile(v, 0.5),
    medianTieAware: tieAwareMedian(v, signs),
    fracPos: sh.pos,
    fracNeg: sh.neg,
    fracTie: sh.tie,
    fracAbsent: absent.filter(Boolean).length / slopes.length,
    presentCells: absent.filter((x) => !x).length,
    fracPosAmongPresent: signs.filter((x, i) => x > 0 && !absent[i]).length / Math.max(1, absent.filter((x) => !x).length),
    verdictIfAlone: novelVerdict(v, signs, absent),
  };
}

/** How the pooled verdict moves with the presence threshold, keeping or dropping absent cells. */
function presenceSensitivity(slopes: Slope[]) {
  const out: Record<string, unknown> = {};
  for (const t of [0, 1e-12, 1e-9, 1e-6, 1e-3]) {
    const present = slopes.filter((s) => s.presence >= t);
    out[String(t)] = {
      allCells: slopeSummary(slopes, t),
      // POST-HOC: absent cells dropped from the denominator instead of counted as ties.
      presentCellsOnly: present.length > 0 ? slopeSummary(present, t) : null,
    };
  }
  return out;
}

/**
 * Pre-registered: adv = x_GAP - x_GTFT in the FULL pool, q = 0.9. For each nuisance cell (epsTotal, b,
 * d, r, m, beta) fit an OLS slope of adv on sigma = epsM / epsTotal. CORROBORATED if slope > 0 in >= 75%
 * of cells and the median slope > 0; REFUTED if the median slope <= 0; otherwise INCONCLUSIVE.
 * Tie-aware reading: see novelVerdict and PRESENCE_TOL.
 */
export function novelPrediction(g: Grid, log: Log): { summary: Record<string, unknown>; table: Table } {
  const series = new Map<string, Series>();
  const rows: (string | number)[][] = [];
  for (const et of g.epsTotal)
    for (const b of g.b) for (let si = 0; si < g.sigma.length; si++) fillSigma(g, et, b, si, { series, rows });
  log(`novel prediction: ${series.size} nuisance cells`);
  const slope = (s: Series): Slope => ({ v: olsSlope(g.sigma, s.adv), scale: s.scale, presence: s.scale });
  const slopeLog = (s: Series): Slope => ({ v: olsSlope(g.sigma, s.logRatio), scale: Math.max(...s.logRatio.map(Math.abs)), presence: s.scale });
  const entries = [...series.entries()];
  const pick = (pred: (k: string) => boolean) => entries.filter(([k]) => pred(k)).map(([, v]) => slope(v));
  const byEt: Record<string, unknown> = {};
  for (const et of g.epsTotal) {
    const s = pick((k) => k.startsWith(`${et}|`));
    const v = s.map((x) => x.v);
    byEt[et] = { ...slopeSummary(s), p025: quantile(v, 0.025), p975: quantile(v, 0.975) };
  }
  // POST-HOC: the per-beta split. The pre-registered rule pools across beta.
  const byBeta: Record<string, unknown> = {};
  for (const beta of g.beta) byBeta[beta] = slopeSummary(pick((k) => k.endsWith(`|${beta}`)));
  const slopes = entries.map(([, s]) => slope(s));
  const v = slopes.map((x) => x.v);
  const all = slopeSummary(slopes);
  const summary = {
    cells: slopes.length,
    medianSlope: all.median,
    iqr: [quantile(v, 0.25), quantile(v, 0.75)],
    p025_p975: [quantile(v, 0.025), quantile(v, 0.975)],
    fracPositive: all.fracPos,
    fracNegative: all.fracNeg,
    fracTie: all.fracTie,
    presenceTol: PRESENCE_TOL,
    untoleranced_fracPositive: v.filter((x) => x > 0).length / v.length,
    logRatioSlope: slopeSummary(entries.map(([, s]) => slopeLog(s))),
    byEpsTotal: byEt,
    byBeta,
    presenceSensitivity: presenceSensitivity(slopes),
    verdict: all.verdictIfAlone,
  };
  return { summary, table: { name: 'novel_prediction.csv', header: ['epsTotal', 'sigma', 'b', 'd', 'r', 'm', 'beta', 'x_GAP', 'x_GTFT', 'adv'], rows } };
}
