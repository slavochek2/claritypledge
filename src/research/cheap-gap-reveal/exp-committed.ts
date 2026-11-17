/**
 * @file exp-committed.ts
 * @description P1702 experiment 5: committed minority (zealots) under full agent-based Fermi dynamics,
 * the critical mass f*, and Criterion 3.
 */
import { randomRegularGraph, runAbm } from './dynamics';
import { ALL, FULL, checkableFrom, idx, type Log, type Table } from './grid';
import { DEFAULT_PARAMS, STRATEGIES, buildMatrices, mixMatrices, type Matrices, type Params } from './model';
import { mulberry32, seedFrom } from './prng';
import { mean, meanCI, quantile } from './stats';

export interface Setting {
  name: string;
  p: Params;
  graph: 'wm' | 'rrg';
  beta: number;
  fs: number[];
  seeds: number;
  mcs: number;
  burn: number;
  n: number;
}

export interface CurvePoint {
  f: number;
  mean: number;
  lo: number;
  hi: number;
  meanAll: number;
}

/** Pre-registered settings: b=3, epsS=0.01, epsM=0.05 (misreading-dominated), d=0.1, r=1, q=0.9, m=0.5. */
export function preregisteredSettings(): Setting[] {
  const pMain: Params = { ...DEFAULT_PARAMS, b: 3, epsS: 0.01, epsM: 0.05, d: 0.1, r: 1, q: 0.9 };
  const pEven: Params = { ...pMain, epsS: 0.03, epsM: 0.03 };
  const fWM = [0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5];
  const fNet = [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5];
  return [
    { name: 'wm_main_beta1', p: pMain, graph: 'wm', beta: 1, fs: fWM, seeds: 10, mcs: 3000, burn: 1000, n: 100 },
    { name: 'wm_main_beta10', p: pMain, graph: 'wm', beta: 10, fs: fWM, seeds: 10, mcs: 3000, burn: 1000, n: 100 },
    { name: 'wm_even_beta1', p: pEven, graph: 'wm', beta: 1, fs: fWM, seeds: 10, mcs: 3000, burn: 1000, n: 100 },
    { name: 'rrg4_main_beta1', p: pMain, graph: 'rrg', beta: 1, fs: fNet, seeds: 5, mcs: 1500, burn: 500, n: 1000 },
  ];
}

export const COMMITTED = ['GAP', 'BADGE', 'TFT'];
const M_CHECKABLE = 0.5;
const MU = 0.001;

/**
 * Run label. At f = 0 there are no committed agents, so every committed type is the same condition and
 * must share the same runs: the label omits the committed type there.
 */
export const runLabel = (setting: string, cid: string, f: number, seed: number) =>
  `z-${setting}-${f === 0 ? 'none' : cid}-${f}-${seed}`;

/** One committed type's curve over f (with per-seed values for the bootstrap), plus the per-seed CSV rows. */
function curveFor(st: Setting, mix: Matrices, cid: string, baseSeed: number, rows: (string | number)[][]): { curve: CurvePoint[]; vals: number[][] } {
  const pool = FULL.map(idx);
  const curve: CurvePoint[] = [];
  const perF: number[][] = [];
  for (const f of st.fs) {
    const vals: number[] = [], valsAll: number[] = [];
    for (let seed = 0; seed < st.seeds; seed++) {
      const rng = mulberry32(seedFrom(baseSeed, runLabel(st.name, cid, f, seed)));
      const graph = st.graph === 'rrg' ? randomRegularGraph(st.n, 4, rng) : null;
      const r = runAbm({ pay: mix.pay, coop: mix.coop, pool, committed: idx(cid), f, N: st.n, graph, beta: st.beta, mu: MU, mcs: st.mcs, burn: st.burn, init: idx('ALLD'), rng });
      vals.push(r.coopNormals);
      valsAll.push(r.coopAll);
      rows.push([st.name, cid, f, seed, r.coopNormals, r.coopAll, ...FULL.map((s) => r.shares[idx(s)]), r.shares[idx('BADGE')]]);
    }
    // Student-t 95% interval over seeds (df = seeds - 1), clamped to [0, 1].
    curve.push({ ...meanCI(vals), f, meanAll: mean(valsAll) });
    perF.push(vals);
  }
  return { curve, vals: perF };
}

const B_BOOT = 2000;

/** First f whose resampled mean exceeds 0.5, or Infinity when none does. draw(i, n) gives seed indices at f index i. */
function crossing(fs: number[], vals: number[][], draw: (i: number, n: number) => number[]): number {
  for (let i = 0; i < fs.length; i++) if (mean(draw(i, vals[i].length).map((k) => vals[i][k])) > 0.5) return fs[i];
  return Infinity;
}

const finiteOrNull = (v: number) => (Number.isFinite(v) ? v : null);

/** Percentile 95% interval of a bootstrap sample (order statistics; Infinity reported as null = "never crosses"). */
function pctCI(xs: number[]): [number | null, number | null] {
  const s = [...xs].sort((a, b) => a - b);
  return [finiteOrNull(s[Math.floor(0.025 * s.length)]), finiteOrNull(s[Math.ceil(0.975 * s.length) - 1])];
}

/**
 * Bootstrap over seeds of the threshold crossing f*, for GAP and BADGE, and of f*(GAP) - f*(BADGE).
 * Each replicate resamples the seeds at every f independently (runs at different f are independent);
 * at f = 0 the two types share the same runs (no committed agents), so they share the resample there.
 */
export function bootstrapFStar(fs: number[], gap: number[][], badge: number[][], rng: () => number) {
  const resample = (n: number) => Array.from({ length: n }, () => Math.floor(rng() * n));
  const fsG: number[] = [], fsB: number[] = [], diff: number[] = [];
  for (let b = 0; b < B_BOOT; b++) {
    const zero = resample(gap[0].length);
    const draw = (i: number, n: number) => (fs[i] === 0 ? zero : resample(n));
    const g = crossing(fs, gap, draw), bb = crossing(fs, badge, draw);
    fsG.push(g); fsB.push(bb);
    // grid differences without float residue; both "never crosses" counts as equal
    diff.push(g === bb ? 0 : Math.round((g - bb) * 1e9) / 1e9);
  }
  const allFinite = diff.every((d) => Number.isFinite(d));
  return {
    replicates: B_BOOT,
    fStarCI95: { GAP: pctCI(fsG), BADGE: pctCI(fsB) },
    diffCI95_GAPminusBADGE: allFinite ? pctCI(diff) : null,
    probDiffNonZero: diff.filter((d) => d !== 0).length / diff.length,
    medianDiff: allFinite ? quantile(diff, 0.5) : null,
  };
}

/** f* = the smallest grid f with mean cooperation > 0.5, or null. */
export const fStarOf = (curve: CurvePoint[]) => curve.find((c) => c.mean > 0.5)?.f ?? null;

/**
 * Criterion 3 (pre-registered): f* differs between committed GAP (badge + check) and committed BADGE
 * (badge, TFT, no check) only if the two f* differ AND at the smaller f* the two 95% CIs of cooperation
 * do not overlap.
 */
export function criterion3Differs(gap: CurvePoint[], badge: CurvePoint[]): boolean {
  const fG = fStarOf(gap), fB = fStarOf(badge);
  if (fG === fB) return false;
  const fMin = Math.min(fG ?? Infinity, fB ?? Infinity);
  const g = gap.find((c) => c.f === fMin), b = badge.find((c) => c.f === fMin);
  return g !== undefined && b !== undefined && (g.lo > b.hi || b.lo > g.hi);
}

/**
 * Can this design tell the check from the badge at all? A check needs a willing partner. Against every
 * unwilling strategy, committed GAP and committed BADGE are the same player, in both payoff directions.
 * If the room's starting strategy is unwilling, the threshold f* is decided almost entirely in
 * encounters where the two are identical (review finding, verified here on the actual matrices).
 */
export function criterion3Design(mix: Matrices, initId: string) {
  const G = idx('GAP'), B = idx('BADGE');
  const unwilling = FULL.filter((id) => !STRATEGIES[id].willing);
  let maxDiff = 0;
  for (const id of unwilling) {
    const j = idx(id);
    maxDiff = Math.max(maxDiff, Math.abs(mix.pay[G][j] - mix.pay[B][j]), Math.abs(mix.pay[j][G] - mix.pay[j][B]));
  }
  const initWilling = STRATEGIES[initId].willing;
  return {
    unwillingPoolStrategies: unwilling.length,
    willingPoolStrategies: FULL.filter((id) => STRATEGIES[id].willing),
    maxPayoffDiffGAPvsBADGE_againstUnwilling: maxDiff,
    startingStrategyWilling: initWilling,
    selfPlayCoop: { GAP: mix.coop[G][G], BADGE: mix.coop[B][B] },
    /**
     * Blind AGAINST THE STARTING POPULATION only. Normals that copy a committed (willing) type make the
     * room willing later in a run, so the design can register the check after conversion.
     */
    blindAtStart: maxDiff <= 1e-12 && !initWilling,
  };
}

/**
 * Criterion 3 verdict. A detected difference is always reported (DIFFERS), whatever the design. Only
 * when nothing is detected does the design matter: if the check could not act against the starting
 * population, non-detection is UNINFORMATIVE rather than NO DETECTABLE DIFFERENCE.
 */
export function criterion3Verdict(differs: boolean, blindAtStart: boolean): string {
  if (differs) return 'DIFFERS';
  return blindAtStart ? 'UNINFORMATIVE (blind against the starting population)' : 'NO DETECTABLE DIFFERENCE';
}

/**
 * Normals start as ALLD ("a room of defectors"), imitate by the Fermi rule (they can imitate committed
 * agents) and explore the FULL pool with mu = 0.001. Cooperation = time-averaged cooperation rate of
 * normal agents' moves.
 */
export function committedMinority(settings: Setting[], baseSeed: number, log: Log): { summary: Record<string, unknown>; table: Table } {
  const rows: (string | number)[][] = [];
  const res: Record<string, unknown> = {};
  for (const st of settings) {
    const plain = buildMatrices(ALL, st.p, 0);
    const mix = mixMatrices(plain, checkableFrom(plain, st.p), M_CHECKABLE);
    const curves: Record<string, CurvePoint[]> = {};
    const vals: Record<string, number[][]> = {};
    for (const cid of COMMITTED) {
      const r = curveFor(st, mix, cid, baseSeed, rows);
      curves[cid] = r.curve;
      vals[cid] = r.vals;
      log(`zealots ${st.name} committed=${cid}`, curves[cid].map((c) => `${c.f}:${c.mean.toFixed(2)}`).join(' '));
    }
    const fStar = { GAP: fStarOf(curves.GAP), BADGE: fStarOf(curves.BADGE), TFT: fStarOf(curves.TFT) };
    const design = criterion3Design(mix, 'ALLD');
    const differs = criterion3Differs(curves.GAP, curves.BADGE);
    res[st.name] = {
      fStar,
      criterion3_differs: differs,
      criterion3_verdict: criterion3Verdict(differs, design.blindAtStart),
      criterion3_designLimitation: design.blindAtStart
        ? 'blind against the starting population: GAP and BADGE are payoff-identical against every unwilling strategy, and the room starts unwilling'
        : null,
      criterion3_design: design,
      fStarBootstrap: bootstrapFStar(st.fs, vals.GAP, vals.BADGE, mulberry32(seedFrom(baseSeed, `boot-${st.name}`))),
      curves,
      params: { ...st.p, m: M_CHECKABLE, beta: st.beta, N: st.n, graph: st.graph, mu: MU, mcs: st.mcs, burn: st.burn, seeds: st.seeds },
    };
  }
  const header = ['setting', 'committed', 'f', 'seed', 'coop_normals', 'coop_all', ...FULL.map((s) => `x_${s}`), 'x_BADGE'];
  return { summary: res, table: { name: 'committed_minority.csv', header, rows } };
}
