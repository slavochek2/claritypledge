/**
 * P1702 stage 2 runner. Regenerates every data file in docs/research/p1702/data/ from fixed seeds.
 *
 *   npx tsx scripts/p1702-run-model.ts
 *
 * Verdict rules live in the experiment modules and were written BEFORE the first run; they are not
 * tuned afterwards. Model: src/research/cheap-gap-reveal/model.ts (game, errors, checks), solver.ts
 * (exact solution), dynamics.ts (selection). Experiments: exp-*.ts in the same directory.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calibrationA, calibrationHe, controlProbeList, controlProbes, mcValidation } from '../src/research/cheap-gap-reveal/exp-checks';
import { committedMinority, preregisteredSettings } from '../src/research/cheap-gap-reveal/exp-committed';
import { equivalence, equivalenceMisOnly } from '../src/research/cheap-gap-reveal/exp-equivalence';
import { costFromRound2, criterion2, mainMapTable, runMainMap } from '../src/research/cheap-gap-reveal/exp-main';
import { novelPrediction } from '../src/research/cheap-gap-reveal/exp-novel';
import { FULL_GRID, type Table } from '../src/research/cheap-gap-reveal/grid';

const BASE_SEED = 1702;
const OUT = join(process.cwd(), 'docs/research/p1702/data');
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const fmt = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(5)).toString() : '');
function writeCsv(t: Table) {
  const body = [t.header.join(','), ...t.rows.map((r) => r.map((v) => (typeof v === 'number' ? fmt(v) : v)).join(','))].join('\n');
  writeFileSync(join(OUT, t.name), body + '\n');
  log(`wrote ${t.name} (${t.rows.length} rows)`);
}

const g = FULL_GRID;
const summary: Record<string, unknown> = { seed: BASE_SEED, N: g.N, generatedBy: 'scripts/p1702-run-model.ts' };

// 0. Exact solver vs Monte Carlo
const mc = mcValidation(BASE_SEED, 200000);
mc.tables.forEach(writeCsv);
summary.mcValidation = mc.summary;

// 1. Calibration
const calA = calibrationA(g.N);
log('calibration A (Boerlijst / Wu-Axelrod)', calA.summary.checks);
const calB = calibrationHe(BASE_SEED, { N: 1000, mcs: 1500, burn: 1000, seeds: 5, betas: [10, 100], rhos: [0, 0.02, 0.04, 0.06, 0.08, 0.085, 0.09, 0.095, 0.1, 0.12, 0.15, 0.2] });
log('calibration B (He et al. 2024) done');
[...calA.tables, ...calB.tables].forEach(writeCsv);
summary.calibration = { ...calA.summary, ...calB.summary };

// 2 + 3. Main map, Criterion 2, equivalence test
const rows = runMainMap(g, log);
writeCsv(mainMapTable(rows));
const c2 = criterion2(rows, g);
c2.tables.forEach(writeCsv);
summary.criterion2 = c2.summary;
log('criterion 2', c2.summary);
const eq = equivalence(rows);
writeCsv(eq.table);
summary.equivalence = eq.summary;
log('equivalence', eq.summary);
summary.equivalenceMisreadingOnlyControl = equivalenceMisOnly(rows);
log('equivalence vs misreading-only control', summary.equivalenceMisreadingOnlyControl);

// Control probes (POST-HOC)
const cp = controlProbes(controlProbeList(), g.N);
cp.tables.forEach(writeCsv);
summary.controlProbes = cp.summary;
log('control probes', cp.summary);

// 4. Novel prediction
const np = novelPrediction(g, log);
writeCsv(np.table);
summary.novelPrediction = np.summary;
log('novel prediction', np.summary);

// POST-HOC sensitivity (review round): check costs charged only from round 2 on
summary.posthoc_costFromRound2 = costFromRound2(g, log);
log('cost from round 2', summary.posthoc_costFromRound2);

// 5. Committed minority
const cm = committedMinority(preregisteredSettings(), BASE_SEED, log);
writeCsv(cm.table);
summary.committedMinority = cm.summary;

summary.runtimeSeconds = (Date.now() - t0) / 1000;
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
log('wrote summary.json');
