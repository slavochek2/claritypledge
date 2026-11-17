import { describe, expect, it } from 'vitest';
import { bootstrapFStar, committedMinority, criterion3Design, criterion3Differs, criterion3Verdict, runLabel, type CurvePoint, type Setting } from './exp-committed';
import { controlProbes, controlProbeList } from './exp-checks';
import { equivalence, equivalenceMisOnly, equivalenceVerdict } from './exp-equivalence';
import { criterion2, runMainMap, type Row } from './exp-main';
import { novelPrediction, novelVerdict } from './exp-novel';
import { ALL, FULL, POOLS, checkableFrom, silent, type Grid } from './grid';
import { DEFAULT_PARAMS, buildMatrices, mixMatrices } from './model';
import { mulberry32 } from './prng';
import { cmp, meanCI, midRank, signTol, strictArgmax, tCrit95, topLabel } from './stats';

const TINY: Grid = {
  N: 30,
  b: [3],
  eps: [0, 0.05],
  d: [0.1],
  r: [1],
  q: [0.9],
  m: [1],
  beta: [0.1, 1, 10],
  epsTotal: [0.05],
  sigma: [0, 0.5, 1],
};

/** A hand-made row: `top` gets the share `hi`, everyone else shares the rest. */
function row(pool: string, over: Partial<Row>, shares: Record<string, number>): Row {
  const ids = POOLS[pool];
  const rest = 1 - Object.values(shares).reduce((a, b) => a + b, 0);
  const free = ids.filter((id) => !(id in shares)).length;
  const base = { b: 3, epsS: 0.01, epsM: 0.05, d: 0.25, r: 2, q: 0.9, m: 1, beta: 1, kappa: 0.5 };
  return { pool, ...base, ...over, ids, shares: ids.map((id) => shares[id] ?? rest / free) };
}

describe('stats helpers', () => {
  it('Student-t critical values at the seed counts used', () => {
    expect(tCrit95(4)).toBeCloseTo(2.7764, 4);
    expect(tCrit95(9)).toBeCloseTo(2.2622, 4);
  });
  it('meanCI clamps to [0, 1]', () => {
    const ci = meanCI([0, 0, 1]);
    expect(ci.lo).toBe(0);
    expect(ci.hi).toBe(1);
  });
  it('NaN never votes: cmp and signTol throw', () => {
    expect(() => cmp(NaN, 1)).toThrow(/NaN/);
    expect(() => signTol(NaN, 1)).toThrow(/NaN/);
    expect(() => signTol(1, NaN)).toThrow(/NaN/);
  });
  it('strictArgmax judges ties on the array scale: negative noise ties, all-zero ties, a denormal does not win', () => {
    expect(strictArgmax([-1e-15, -2e-15, -1])).toBe(-1);
    expect(strictArgmax([0, 0, 0])).toBe(-1);
    expect(strictArgmax([0, 1e-320])).toBe(-1);
    expect(strictArgmax([0.2, 0.7, 0.1])).toBe(1);
  });
  it('float-noise ties have no strict winner and share their rank', () => {
    const xs = [0.5, 0.5 + 1e-16, 1e-7];
    expect(strictArgmax(xs)).toBe(-1);
    expect(topLabel(['PARA', 'GAP', 'X'], xs)).toBe('TIE(PARA/GAP)');
    expect(midRank(xs, 1)).toBe(1.5);
    expect(midRank(xs, 2)).toBe(3);
  });
});

describe('Criterion 2 verdict block', () => {
  it('tiny grid runs end to end and refutes, as the full grid does', () => {
    const rows = runMainMap(TINY, silent);
    const c2 = criterion2(rows, TINY).summary;
    expect(c2.cellsTotal).toBe(3); // (epsS, epsM) in {(0,.05), (.05,0), (.05,.05)}
    expect(c2.robustWins).toBe(0);
    expect(c2.verdict).toBe('REFUTED');
  });
  it('PASS when GAP is strictly top at every beta != 1 and q in a floor cell', () => {
    const g: Grid = { ...TINY, q: [0.9] };
    const rows = [0.1, 1, 10].map((beta) => row('FULL', { beta }, { GAP: 0.6 }));
    const c2 = criterion2(rows, g).summary;
    expect(c2.robustWins).toBe(1);
    expect(c2.verdict).toBe('PASS');
  });
  it('a float-noise tie at the top is not a win', () => {
    const g: Grid = { ...TINY, q: [0.9] };
    const rows = [0.1, 1, 10].map((beta) => row('FULL', { beta }, { GAP: 0.5, PARA: 0.5 }));
    const c2 = criterion2(rows, g).summary;
    expect(c2.robustWins).toBe(0);
    expect(c2.verdict).toBe('REFUTED');
  });
  it('a floor-meeting win only at the smallest tested d is still PASS, flagged as boundary-only (any grid order)', () => {
    const g: Grid = { ...TINY, q: [0.9], d: [0.5, 0.25] };
    const rows = [0.1, 1, 10].map((beta) => row('FULL', { beta, d: 0.25, kappa: 0.5 }, { GAP: 0.6 })); // kappa 0.5 >= eps*b 0.18
    const s = criterion2(rows, g).summary;
    expect(s.verdict).toBe('PASS');
    expect(s.boundaryOnlySupport).toBe(true);
    const rows2 = [0.1, 1, 10].map((beta) => row('FULL', { beta, d: 0.5, kappa: 0.5 }, { GAP: 0.6 }));
    expect(criterion2(rows2, g).summary.boundaryOnlySupport).toBe(false);
  });
  it('"any beta and q" counts include beta = 1, in FULL and in FULL_NOPP alike', () => {
    const g: Grid = { ...TINY, q: [0.9] };
    const onlyAtBeta1 = (pool: string) => [0.1, 1, 10].map((beta) => row(pool, { beta }, beta === 1 ? { GAP: 0.6 } : { PPAV: 0.6 }));
    const fullRows = onlyAtBeta1('FULL');
    const noppRows = onlyAtBeta1('FULL_NOPP').map((r) => (r.beta === 1 ? r : row('FULL_NOPP', { beta: r.beta }, { WSLS: 0.6 })));
    const s = criterion2([...fullRows, ...noppRows], g).summary;
    expect(s.floorCellsWhereGapTopInAnyBetaQ).toBe(1);
    expect(s.posthoc_floorCellsGapTopAnyBetaQ_FULL_without_PPAV).toBe(1);
    expect(s.robustWins).toBe(0); // beta = 1 is not part of the robust rule
  });
  it('a below-floor win does not count', () => {
    const g: Grid = { ...TINY, q: [0.9] };
    const rows = [0.1, 1, 10].map((beta) => row('FULL', { beta, kappa: 0.01 }, { GAP: 0.6 }));
    expect(criterion2(rows, g).summary.verdict).toBe('REFUTED');
  });
});

describe('equivalence verdict block', () => {
  const triple = (gap: number, ctrl: number, over: Partial<Row> = {}): Row[] => [
    row('FULL_CTRL', over, { GAP: gap, CTRL: ctrl }),
    row('FULL', over, { GAP: gap }),
    row('FULL_SWAP', over, { CTRL: ctrl }),
  ];
  it('CONTROL BEATS GAP when CTRL is ahead beyond noise in >= 75% of cells', () => {
    const rows = [0.1, 1, 10, 100].flatMap((beta) => triple(0.01, 0.02, { beta }));
    const eq = equivalence(rows).summary;
    expect(eq.fracCtrlAhead).toBe(1);
    expect(eq.verdict).toBe('CONTROL BEATS GAP');
  });
  it('one verdict rule for both controls, symmetric, with a tie-aware median', () => {
    expect(equivalenceVerdict([1, 1, 1, -1], [1, 1, 1, -1])).toBe('GAP BEATS CONTROL');
    expect(equivalenceVerdict([-1, -1, -1, 1], [-1, -1, -1, 1])).toBe('CONTROL BEATS GAP');
    expect(equivalenceVerdict([1e-20, 1e-20, -1e-20, -1e-20], [0, 0, 0, 0])).toBe('NO CONSISTENT DIFFERENCE');
  });
  it('rows without a head-to-head value are skipped, never counted', () => {
    const rows = [0.1, 1].flatMap((beta) => triple(0.01, 0.02, { beta }));
    const h = equivalence(rows).summary.posthoc_h2h_log10RhoRatio as { cells: number };
    expect(h.cells).toBe(0);
  });
  it('misreading-only control: identical shares give all ties', () => {
    const rows = [0.1, 1, 10].map((beta) => row('FULL_CTRLM', { beta }, { GAP: 0.01, CTRL_M: 0.01 }));
    const eq = equivalenceMisOnly(rows);
    expect(eq.fracTie).toBe(1);
    expect(eq.verdict).toBe('NO CONSISTENT DIFFERENCE');
  });
  it('float-noise differences are ties, not wins: NO CONSISTENT DIFFERENCE', () => {
    const rows = [0.1, 1, 10, 100].flatMap((beta, i) => triple(0.01, 0.01 + (i % 2 ? 1e-18 : -1e-18), { beta }));
    const eq = equivalence(rows).summary;
    expect(eq.fracTie).toBe(1);
    expect(eq.fracGapAhead).toBe(0);
    expect(eq.verdict).toBe('NO CONSISTENT DIFFERENCE');
  });
});

describe('novel-prediction verdict block', () => {
  // v: slope, s: tie-aware sign, a: both strategies absent
  const cells = (spec: [number, number, boolean][]) => [spec.map((c) => c[0]), spec.map((c) => c[1]), spec.map((c) => c[2])] as const;
  const rep = (n: number, c: [number, number, boolean]) => Array.from({ length: n }, () => c);
  it('486/486 split of negative and positive slopes, no ties: the median slope is negative, so REFUTED', () => {
    const [v, s, a] = cells([...rep(486, [-0.05, -1, false]), ...rep(486, [0.001, 1, false])]);
    expect(novelVerdict(v, s, a)).toBe('REFUTED');
  });
  it('486/486 split where the positive slopes are larger: median slope > 0, 50% positive, so INCONCLUSIVE', () => {
    // A median of the signs would be 0 here and wrongly read as "median slope <= 0".
    const [v, s, a] = cells([...rep(486, [-0.001, -1, false]), ...rep(486, [0.05, 1, false])]);
    expect(novelVerdict(v, s, a)).toBe('INCONCLUSIVE');
  });
  it('median on cells where both strategies are absent: NOT CORROBORATED, never REFUTED', () => {
    const [v, s, a] = cells([[-0.1, -1, false], [-0.1, -1, false], [1e-30, 0, true], [0.1, 1, false], [0.1, 1, false]]);
    expect(novelVerdict(v, s, a)).toBe('NOT CORROBORATED (median cell uninformative)');
  });
  it('median 0 made only of present, flat slopes is REFUTED (median slope <= 0)', () => {
    const [v, s, a] = cells([[-0.1, -1, false], [0, 0, false], [0, 0, false], [0.1, 1, false], [0.1, 1, false]]);
    expect(novelVerdict(v, s, a)).toBe('REFUTED');
  });
  it('CORROBORATED needs >= 75% strictly positive and a positive median; ties are not positive', () => {
    const [v1, s1, a1] = cells([[-0.1, -1, false], [0.1, 1, false], [0.1, 1, false], [0.1, 1, false], [0.1, 1, false]]);
    expect(novelVerdict(v1, s1, a1)).toBe('CORROBORATED'); // 80%
    const [v2, s2, a2] = cells([[1e-30, 0, true], [0.1, 1, false], [0.1, 1, false], [0.1, 1, false]]);
    expect(novelVerdict(v2, s2, a2)).toBe('CORROBORATED'); // 75%
    const [v3, s3, a3] = cells([[1e-30, 0, true], [1e-30, 0, true], [0.1, 1, false], [0.1, 1, false], [0.1, 1, false]]);
    expect(novelVerdict(v3, s3, a3)).toBe('INCONCLUSIVE'); // 60%: ties count as not positive
  });
  it('tiny grid: one slope per nuisance cell, per-beta split reported', () => {
    const np = novelPrediction(TINY, silent).summary as { cells: number; byBeta: Record<string, { cells: number }>; verdict: string };
    expect(np.cells).toBe(3); // 1 eps x 1 b x 1 d x 1 r x 1 m x 3 beta
    expect(Object.keys(np.byBeta).sort()).toEqual(['0.1', '1', '10']);
    expect(np.byBeta['10'].cells).toBe(1);
  });
});

describe('Criterion 3 verdict block (committed minority)', () => {
  const pt = (f: number, mean: number, lo: number, hi: number): CurvePoint => ({ f, mean, lo, hi, meanAll: mean });
  it('differs only when f* differ AND the CIs at the smaller f* do not overlap', () => {
    const gap = [pt(0, 0.1, 0, 0.2), pt(0.1, 0.8, 0.7, 0.9)];
    const badgeFar = [pt(0, 0.1, 0, 0.2), pt(0.1, 0.3, 0.2, 0.4), pt(0.2, 0.8, 0.7, 0.9)];
    const badgeNear = [pt(0, 0.1, 0, 0.2), pt(0.1, 0.45, 0.2, 0.75), pt(0.2, 0.8, 0.7, 0.9)];
    expect(criterion3Differs(gap, badgeFar)).toBe(true);
    expect(criterion3Differs(gap, badgeNear)).toBe(false);
    expect(criterion3Differs(gap, gap)).toBe(false);
  });
  it('design check: against every unwilling strategy committed GAP and BADGE are identical, so the design is blind', () => {
    const p = { ...DEFAULT_PARAMS, b: 3, epsS: 0.01, epsM: 0.05, d: 0.1, r: 1, q: 0.9 };
    const plain = buildMatrices(ALL, p, 0);
    const mix = mixMatrices(plain, checkableFrom(plain, p), 0.5);
    const d = criterion3Design(mix, 'ALLD');
    expect(d.maxPayoffDiffGAPvsBADGE_againstUnwilling).toBe(0);
    expect(d.blindAtStart).toBe(true);
    expect(criterion3Design(mix, 'FAKER').blindAtStart).toBe(false); // a willing starting room would not be blind
  });
  it('a detected difference is reported even when the design is blind at the start', () => {
    expect(criterion3Verdict(true, true)).toBe('DIFFERS');
    expect(criterion3Verdict(false, true)).toBe('UNINFORMATIVE (blind against the starting population)');
    expect(criterion3Verdict(false, false)).toBe('NO DETECTABLE DIFFERENCE');
  });
  it('f = 0 runs share one seed across committed types', () => {
    expect(runLabel('s', 'GAP', 0, 3)).toBe(runLabel('s', 'BADGE', 0, 3));
    expect(runLabel('s', 'GAP', 0.1, 3)).not.toBe(runLabel('s', 'BADGE', 0.1, 3));
  });
  it('tiny ABM: identical f = 0 points across types, clamped t-CIs, bootstrap shape', () => {
    const st: Setting = { name: 'tiny', p: { ...DEFAULT_PARAMS, epsS: 0.01, epsM: 0.05 }, graph: 'wm', beta: 1, fs: [0, 0.5], seeds: 3, mcs: 30, burn: 10, n: 20 };
    const res = committedMinority([st], 1702, silent).summary.tiny as {
      curves: Record<string, CurvePoint[]>;
      fStarBootstrap: { replicates: number; fStarCI95: Record<string, unknown[]> };
    };
    const z = (cid: string) => res.curves[cid][0];
    expect(z('GAP').mean).toBe(z('BADGE').mean);
    expect(z('GAP').mean).toBe(z('TFT').mean);
    for (const c of Object.values(res.curves).flat()) {
      expect(c.lo).toBeGreaterThanOrEqual(0);
      expect(c.hi).toBeLessThanOrEqual(1);
    }
    expect(res.fStarBootstrap.fStarCI95.GAP).toHaveLength(2);
  });
  it('bootstrap: identical data give a zero difference in every replicate', () => {
    const vals = [[0.1, 0.2, 0.3], [0.6, 0.7, 0.8]];
    const b = bootstrapFStar([0, 0.1], vals, vals, mulberry32(1));
    expect(b.probDiffNonZero).toBe(0);
    expect(b.fStarCI95.GAP).toEqual([0.1, 0.1]);
  });
});

describe('control probes', () => {
  it('the free perfect check with misreading only ties GAP with PARA and labels it a tie', () => {
    const probe = controlProbeList().filter((p) => p.name === 'free_perfect_check_misread_only_FULL');
    const res = controlProbes(probe, 100).summary.free_perfect_check_misread_only_FULL as { top: string };
    expect(res.top).toBe('TIE(PARA/GAP)');
    expect(FULL).toContain('GAP');
  });
});
