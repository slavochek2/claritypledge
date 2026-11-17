/**
 * @file exp-checks.ts
 * @description P1702 checks on the pipeline itself: exact solver vs Monte Carlo, calibration against
 * published anchors, and control probes that must be able to rank GAP first.
 */
import { logFixation, runAbm, stationary } from './dynamics';
import { ALL, FULL, POOLS, sub, type Table } from './grid';
import { DEFAULT_PARAMS, STRATEGIES, buildMatrices, playExact, playMonteCarlo, type Params } from './model';
import { mulberry32, seedFrom } from './prng';
import { mean, sd, topLabel } from './stats';

type Result = { summary: Record<string, unknown>; tables: Table[] };

/** Exact solver vs Monte Carlo (sampling-error report). */
export function mcValidation(baseSeed: number, games: number): Result {
  const p: Params = { ...DEFAULT_PARAMS, epsS: 0.05, epsM: 0.05 };
  const pairs: [string, string, boolean][] = [
    ['TFT', 'TFT', false], ['GTFT', 'GTFT', false], ['CTFT', 'CTFT', false], ['WSLS', 'PPAV', false],
    ['GAP', 'GAP', true], ['PARA', 'GAP', true], ['APOLOGY', 'FAKE_APOL', false], ['GAP', 'FAKER', true],
  ];
  const rows = pairs.map(([a, b, chk]) => {
    const ex = playExact(STRATEGIES[a], STRATEGIES[b], p, chk);
    const mc = playMonteCarlo(STRATEGIES[a], STRATEGIES[b], p, chk, games, mulberry32(seedFrom(baseSeed, `mc-${a}-${b}`)));
    return [a, b, chk ? 1 : 0, ex.payA, mc.payA, mc.seA, (mc.payA - ex.payA) / mc.seA];
  });
  return {
    summary: { maxAbsZ: Math.max(...rows.map((r) => Math.abs(r[6] as number))), games },
    tables: [{ name: 'mc_validation.csv', header: ['A', 'B', 'checkable', 'exact_payA', 'mc_payA', 'mc_se', 'z'], rows }],
  };
}

/** Calibration A: qualitative noise anchors (Boerlijst et al. 1997; Wu & Axelrod 1995). */
export function calibrationA(N: number): Result {
  const selfPlay = (id: string, p: Params) => playExact(STRATEGIES[id], STRATEGIES[id], p, false).payA;
  const ids = ['TFT', 'GTFT', 'GTFT10', 'TF2T', 'CTFT', 'WSLS', 'PPAV'];
  const conds: Record<string, Params> = {
    slip1: { ...DEFAULT_PARAMS, epsS: 0.01, epsM: 0 },
    slip5: { ...DEFAULT_PARAMS, epsS: 0.05, epsM: 0 },
    mis5: { ...DEFAULT_PARAMS, epsS: 0, epsM: 0.05 },
  };
  const table: Record<string, Record<string, number>> = {};
  const rows: (string | number)[][] = [];
  for (const [cn, p] of Object.entries(conds)) {
    table[cn] = {};
    for (const id of ids) {
      table[cn][id] = selfPlay(id, p);
      rows.push([cn, id, table[cn][id]]);
    }
  }
  // Invasion of ALLD (Boerlijst et al.: cTFT "as good as TFT in invading a population of defectors";
  // "PAVLOV and GTFT fare both very poorly in such an environment").
  const pInv: Params = { ...DEFAULT_PARAMS, epsS: 0.01, epsM: 0 };
  const inv: Record<string, number> = {};
  for (const id of ['TFT', 'CTFT', 'GTFT', 'WSLS', 'PPAV']) {
    const m = buildMatrices([id, 'ALLD'], pInv, 0).pay;
    inv[id] = logFixation(m[0][0], m[0][1], m[1][0], m[1][1], N, 1) / Math.LN10; // log10 rho
    rows.push(['invade_ALLD_log10rho_beta1', id, inv[id]]);
  }
  const checks = {
    E1_slip1_cope_better_than_TFT: ['GTFT', 'GTFT10', 'CTFT', 'WSLS', 'PPAV'].every((s) => table.slip1[s] > table.slip1.TFT),
    E1b_slip5_cope_better_than_TFT: ['GTFT', 'CTFT', 'WSLS', 'PPAV'].every((s) => table.slip5[s] > table.slip5.TFT),
    E2_CTFT_hurt_by_misreading: table.mis5.CTFT < table.slip5.CTFT - 0.1,
    E2b_CTFT_under_misreading_near_TFT: Math.abs(table.mis5.CTFT - table.mis5.TFT) < 0.15,
    E3_PPAV_beats_CTFT_under_misreading: table.mis5.PPAV > table.mis5.CTFT,
    E4_CTFT_invades_ALLD_like_TFT_better_than_WSLS_GTFT:
      Math.abs(inv.CTFT - inv.TFT) < 0.5 && inv.CTFT > inv.WSLS && inv.CTFT > inv.GTFT,
  };
  return {
    summary: { selfPlay: table, invadeAllD_log10rho: inv, checks },
    tables: [{ name: 'calibration_selfplay.csv', header: ['condition', 'strategy', 'value'], rows }],
  };
}

/**
 * Calibration B: He, Shen, Shi & Tanimoto 2024 committed-TFT critical mass (well-mixed, weak PD, no
 * noise). Long-run payoffs, R=1, T=b=1.1, S=0, P=0; TFT vs D long-run 0. Strategies 0=C, 1=D, 2=TFT.
 * Both zealot rules: imitable = the Cardillo & Masuda rule used in experiment 5; not imitable = normals
 * hold only C or D, the setting of the mean-field condition rho > (T-R)/T = 0.0909 for C to beat D.
 */
export function calibrationHe(baseSeed: number, o: { N: number; mcs: number; burn: number; seeds: number; rhos: number[]; betas: number[] }): Result {
  const T = 1.1;
  const pay = [[1, 0, 1], [T, 0, 0], [1, 0, 1]];
  const coop = [[1, 1, 1], [0, 0, 0], [1, 0, 1]];
  const rows: (string | number)[][] = [];
  const summary: Record<string, unknown>[] = [];
  for (const imitable of [true, false])
    for (const beta of o.betas)
      for (const rho of o.rhos) {
        const vals: number[] = [];
        for (let seed = 0; seed < o.seeds; seed++) {
          const r = runAbm({
            pay, coop, pool: [0, 1], committed: 2, f: rho, N: o.N, graph: null, beta, mu: 0,
            mcs: o.mcs, burn: o.burn, init: -1, imitateCommitted: imitable,
            rng: mulberry32(seedFrom(baseSeed, `he-${imitable}-${beta}-${rho}-${seed}`)),
          });
          // FIXED after run 1: run 1 recorded r.shares[0] (pure-C normals only), which under-counts
          // cooperation when normals imitate committed TFT. F_C is now the cooperation rate of normals.
          vals.push(r.coopNormals);
          rows.push([imitable ? 1 : 0, beta, rho, seed, r.coopNormals, r.shares[0], r.shares[2]]);
        }
        summary.push({ imitable, beta, rho, FC_mean: mean(vals), FC_sd: sd(vals), meanFieldNonImitable: Math.min(1, (rho * 10) / (1 - rho)) });
      }
  return {
    summary: { he2024: summary },
    tables: [{ name: 'calibration_he2024.csv', header: ['committed_imitable', 'beta', 'rho', 'seed', 'FC_normals', 'share_C', 'share_TFT_imitators'], rows }],
  };
}

export interface Probe {
  name: string;
  p: Params;
  pool: string[];
  m: number;
  beta: number;
}

/** Control probes (POST-HOC): a known-good case must come out GAP-first, or the refutation is uninformative. */
export function controlProbeList(): Probe[] {
  const free: Partial<Params> = { d: 0, r: 0, s: 1, a: 0, q: 1 };
  const misOnly = { ...DEFAULT_PARAMS, epsS: 0, epsM: 0.1, ...free };
  return [
    { name: 'free_perfect_check_misread_only_FULL', p: misOnly, pool: FULL, m: 1, beta: 1 },
    { name: 'free_perfect_check_mixed_noise_FULL', p: { ...DEFAULT_PARAMS, epsS: 0.05, epsM: 0.05, ...free }, pool: FULL, m: 1, beta: 1 },
    { name: 'free_perfect_check_misread_only_FULL_noPPAV', p: misOnly, pool: POOLS.FULL_NOPP, m: 1, beta: 1 },
    { name: 'default_cost_misread_only_TFTfamily', p: { ...DEFAULT_PARAMS, epsS: 0, epsM: 0.05 }, pool: ['ALLC', 'ALLD', 'TFT', 'GAP'], m: 1, beta: 1 },
    { name: 'default_cost_misread_only_vsGTFT', p: { ...DEFAULT_PARAMS, epsS: 0, epsM: 0.05 }, pool: ['ALLC', 'ALLD', 'TFT', 'GTFT', 'GAP'], m: 1, beta: 1 },
    { name: 'free_perfect_check_misread_only_vsGTFT', p: misOnly, pool: ['ALLC', 'ALLD', 'TFT', 'GTFT', 'GAP'], m: 1, beta: 1 },
    // POST-HOC (review round): how small must slips be before a free, perfect check stops losing?
    // Replaces an unsupported universal claim ("a free check loses whenever slips are present").
    ...[1e-8, 1e-6, 1e-4, 1e-3, 0.01, 0.05].map((epsS) => ({
      name: `free_perfect_check_slip_sweep_epsS_${epsS}_FULL`, p: { ...misOnly, epsS }, pool: FULL, m: 1, beta: 1,
    })),
  ];
}

export function controlProbes(probes: Probe[], N: number): Result {
  const res: Record<string, unknown> = {};
  const rows: (string | number)[][] = [];
  for (const pr of probes) {
    const mat = buildMatrices(ALL, pr.p, pr.m);
    const x = stationary(sub(mat.pay, pr.pool), N, pr.beta);
    const order = pr.pool.map((id, i) => [id, x[i]] as [string, number]).sort((a, b) => b[1] - a[1]);
    res[pr.name] = { top: topLabel(pr.pool, x), gapShare: x[pr.pool.indexOf('GAP')], ranking: order.slice(0, 5).map(([id, v]) => `${id}:${v.toPrecision(3)}`) };
    for (const [id, v] of order) rows.push([pr.name, id, v]);
  }
  return { summary: res, tables: [{ name: 'control_probes.csv', header: ['probe', 'strategy', 'share'], rows }] };
}
