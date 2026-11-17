/**
 * @file exp-equivalence.ts
 * @description P1702 equivalence test: is GAP more than "pay for a lower error rate"? Compares GAP with
 * CTRL, an equal-cost untargeted error cut (see solver.ts effective()).
 */
import { cellKey, share, topOf, type Row } from './exp-main';
import type { Table } from './grid';
import { cmp, quantile, signShares, signTol, tieAwareMedian } from './stats';

const eqKey = (r: Row) => `${cellKey(r)}|${r.q}|${r.beta}`;

/**
 * The pre-registered equivalence rule, used for every control. GAP BEATS CONTROL if diff > 0 in >= 75% of
 * cells and the median diff > 0; CONTROL BEATS GAP if diff < 0 in >= 75% of cells (and, symmetrically,
 * the median diff < 0, which the 75% already implies); otherwise NO CONSISTENT DIFFERENCE. Signs and
 * the median are tie-aware: a numerical tie counts for neither side and as exactly 0 in the median.
 */
export function equivalenceVerdict(diffs: number[], signs: number[]): string {
  const { pos, neg } = signShares(signs);
  const med = tieAwareMedian(diffs, signs);
  if (pos >= 0.75 && med > 0) return 'GAP BEATS CONTROL';
  if (neg >= 0.75 && med < 0) return 'CONTROL BEATS GAP';
  return 'NO CONSISTENT DIFFERENCE';
}

function indexPool(rows: Row[], pool: string): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const row of rows) if (row.pool === pool) m.set(eqKey(row), row);
  return m;
}

function mustGet(m: Map<string, Row>, k: string, what: string): Row {
  const r = m.get(k);
  if (!r) throw new Error(`equivalence: no ${what} row for cell ${k}`);
  return r;
}

/**
 * Pre-registered. In FULL_CTRL (GAP and CTRL both present), diff = x_GAP - x_CTRL, over cells with
 * epsM > 0 and q = 0.9, every b, epsS, d, r, m, beta. GAP BEATS CONTROL if diff > 0 in >= 75% of cells
 * and the median diff > 0; CONTROL BEATS GAP if diff < 0 in >= 75% of cells; otherwise NO CONSISTENT
 * DIFFERENCE. "diff > 0" / "< 0" exclude numerical ties (stats.ts cmp, TIE_REL); ties count for neither.
 */
export function equivalence(rows: Row[]): { summary: Record<string, unknown>; table: Table } {
  const diffs: number[] = [], rel: number[] = [], swapDiff: number[] = [], h2h: number[] = [];
  const signs: number[] = [], swapSigns: number[] = [], h2hSigns: number[] = [];
  const out: (string | number)[][] = [];
  const fullByKey = indexPool(rows, 'FULL');
  const swapByKey = indexPool(rows, 'FULL_SWAP');
  for (const row of rows) {
    if (row.pool !== 'FULL_CTRL' || row.q !== 0.9 || row.epsM === 0) continue;
    const g = share(row, 'GAP'), c = share(row, 'CTRL');
    diffs.push(g - c);
    signs.push(cmp(g, c));
    rel.push(g + c > 0 ? (g - c) / (g + c) : 0); // both absent: no difference, and no NaN
    const f = mustGet(fullByKey, eqKey(row), 'FULL'), s = mustGet(swapByKey, eqKey(row), 'FULL_SWAP');
    const sd2 = share(f, 'GAP') - share(s, 'CTRL');
    swapDiff.push(sd2);
    swapSigns.push(cmp(share(f, 'GAP'), share(s, 'CTRL')));
    const hh = row.h2h ?? NaN;
    // The head-to-head diagnostic exists only where the main map computed it; a missing value never votes.
    if (row.h2h !== undefined) {
      h2h.push(row.h2h);
      h2hSigns.push(signTol(row.h2h, row.h2hScale ?? 1));
    }
    out.push([row.b, row.epsS, row.epsM, row.d, row.r, row.m, row.beta, g, c, g - c, signs[signs.length - 1], share(f, 'GAP'), share(s, 'CTRL'), sd2, topOf(row), hh]);
  }
  // Ties: |x_GAP - x_CTRL| within TIE_REL of the larger abundance is float noise, not a win (with
  // epsS = 0 the two strategies are mechanically identical and differ only by rounding).
  const { pos: fracPos, neg: fracNeg, tie: fracTie } = signShares(signs);
  const swap = signShares(swapSigns);
  const h2hS = signShares(h2hSigns);
  const summary = {
    cells: diffs.length,
    fracGapAhead: fracPos,
    fracCtrlAhead: fracNeg,
    fracTie,
    // Sensitivity to the tie rule: raw signs (no tolerance), and an absolute |diff| < 1e-12 rule.
    tieRuleSensitivity: {
      none: signShares(diffs.map((v) => Math.sign(v))),
      abs1e12: signShares(diffs.map((v) => signTol(v, 1, 1e-12))),
    },
    medianDiff: quantile(diffs, 0.5),
    diffP025: quantile(diffs, 0.025),
    diffP975: quantile(diffs, 0.975),
    medianRelDiff: quantile(rel, 0.5),
    swapMedianDiff: quantile(swapDiff, 0.5),
    swapFracGapAhead: swap.pos,
    swapFracTie: swap.tie,
    medianDiffTieAware: tieAwareMedian(diffs, signs),
    posthoc_h2h_log10RhoRatio: { cells: h2h.length, median: quantile(h2h, 0.5), p025: quantile(h2h, 0.025), p975: quantile(h2h, 0.975), fracGapFavoured: h2hS.pos, fracTie: h2hS.tie },
    verdict: equivalenceVerdict(diffs, signs),
  };
  const header = ['b', 'epsS', 'epsM', 'd', 'r', 'm', 'beta', 'x_GAP_withCTRL', 'x_CTRL_withGAP', 'diff', 'sign_tol', 'x_GAP_inFULL', 'x_CTRL_inSWAP', 'swap_diff', 'top_FULL_CTRL', 'h2h_log10_rho_ratio'];
  return { summary, table: { name: 'equivalence.csv', header, rows: out } };
}

/**
 * Second control (review round): CTRL_M, the misreading-only untargeted cut at GAP's cost, in pool
 * FULL_CTRLM. Same cells and the same pre-registered thresholds as the CTRL test. CTRL_M equals GAP by
 * construction, so every comparison should be a numerical tie.
 */
export function equivalenceMisOnly(rows: Row[]): Record<string, unknown> {
  const signs: number[] = [], diffs: number[] = [];
  let maxRel = 0;
  for (const row of rows) {
    if (row.pool !== 'FULL_CTRLM' || row.q !== 0.9 || row.epsM === 0) continue;
    const g = share(row, 'GAP'), c = share(row, 'CTRL_M');
    signs.push(cmp(g, c));
    diffs.push(g - c);
    if (g + c > 0) maxRel = Math.max(maxRel, Math.abs(g - c) / (g + c));
  }
  const { pos, neg, tie } = signShares(signs);
  return {
    cells: signs.length,
    fracGapAhead: pos,
    fracCtrlAhead: neg,
    fracTie: tie,
    maxRelDiff: maxRel,
    medianDiffTieAware: tieAwareMedian(diffs, signs),
    verdict: equivalenceVerdict(diffs, signs),
  };
}
