#!/usr/bin/env node
'use strict';
// P1566 — quality ratchet runner. Blocks a change that makes a measured code property
// WORSE, never a commit for debt that predates it.
//
// "Before" is computed at run time, never stored: HEAD in pre-commit, the event range's
// base in CI. There is no committed baseline file, so concurrent worktrees cannot
// conflict over one and the agent being gated has nothing to edit (spec invariant).
// "After" is always a git blob — the index in pre-commit — never the working tree, so a
// co-tenant's unstaged edit cannot change the verdict.
//
// Usage:
//   node scripts/quality-ratchet.cjs --staged                # pre-commit: HEAD vs index
//   node scripts/quality-ratchet.cjs --range BASE..TIP       # any two commits
//   node scripts/quality-ratchet.cjs --ci                    # CI: range derived from the GitHub event
//   node scripts/quality-ratchet.cjs --measure FILE...       # print a working-tree file's numbers
//   add --metrics NAME[,NAME] to select (default: size when staged, every metric in range/CI)
//
// Exit: 0 = no regression, 1 = regression (each printed with value, limit, remedy),
//       2 = the tool could not run (never reported as a pass).
//
// Metrics plug in through METRICS below. A `file` metric measures one blob and compares
// before/after per file (size.cjs). A `tree` metric would collect finding IDs over a
// materialized tree and fail on IDs new at TIP: that is the shape the deferred
// typecheck baseline (typecheck-gate.sh "Option B") and the whole-graph stages take.

const { execFileSync } = require('child_process');
const size = require('./lib/quality-ratchet/size.cjs');
const cycles = require('./lib/quality-ratchet/cycles.cjs');
const { snapshot } = require('./lib/quality-ratchet/snapshot.cjs');

// Files the size metric judges. Tests are out of scope for v1 (see the P1566 stage 1 trial).
const SCOPE = [/^src\/.*\.(ts|tsx)$/, /^supabase\/functions\/.*\.ts$/];
const OUT_OF_SCOPE = [/\.test\.(ts|tsx)$/, /^src\/tests\//, /\.d\.ts$/];

// Every exemption carries its reason (spec invariant: no silent exemptions). An entry
// without one is a tool error, not a pass.
const EXEMPT = [
  { glob: 'src/app/prototypes/**', reason: 'throwaway prototypes, already excluded from ESLint (eslint.config.js ignores)' },
];

// file metrics run anywhere; tree metrics read the whole project at two commits, so they
// run in range/CI mode only (spec invariant: whole-graph gates are CI-only).
const METRICS = {
  size: { kind: 'file', module: size },
  cycles: { kind: 'tree', module: cycles },
};
const DEFAULT_STAGED = ['size'];
const DEFAULT_RANGE = Object.keys(METRICS);
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function die(msg) {
  process.stderr.write(`quality-ratchet: ERROR: ${msg}\n`);
  process.exit(2);
}

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

for (const e of EXEMPT) {
  if (!e.reason || !e.reason.trim()) die(`EXEMPT entry '${e.glob}' has no reason — every exemption must say why.`);
}
const EXEMPT_RE = EXEMPT.map((e) => globToRegex(e.glob));

function inScope(p) {
  return SCOPE.some((r) => r.test(p)) && !OUT_OF_SCOPE.some((r) => r.test(p)) && !EXEMPT_RE.some((r) => r.test(p));
}

// rev '' means the index.
function blob(rev, p) {
  try {
    return git(['cat-file', 'blob', `${rev}:${p}`]);
  } catch (e) {
    die(`cannot read ${rev || 'index'}:${p} — ${String(e.stderr || e.message).trim()}`);
  }
  return null;
}

// [{status, oldPath, path}] for a diff. -M pairs a `git mv` with its before blob.
function changes(diffArgs) {
  const out = git(['diff', '-M', '--name-status', '-z', ...diffArgs]);
  const parts = out.split('\0').filter((x) => x !== '');
  const list = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    if (status[0] === 'R' || status[0] === 'C') {
      const oldPath = parts[i++];
      const p = parts[i++];
      list.push({ status: status[0], oldPath, path: p });
    } else {
      const p = parts[i++];
      list.push({ status: status[0], oldPath: p, path: p });
    }
  }
  return list;
}

function fileMetricViolations(mod, list, beforeRev, afterRev) {
  const violations = [];
  let checked = 0;
  let frozen = 0;
  const measured = [];
  const gone = []; // over-limit functions that left their file (by key) in this change
  const addedPool = new Map(); // movable lines of files added in this change

  const leave = (fns, file) => {
    for (const f of fns) gone.push({ ...f, file });
  };

  for (const c of list) {
    const beforeIn = c.status !== 'A' && inScope(c.oldPath);
    const afterIn = c.status !== 'D' && inScope(c.path);
    if (!beforeIn && !afterIn) continue;
    const beforeText = c.status === 'A' ? null : blob(beforeRev, c.oldPath);
    const afterText = c.status === 'D' ? null : blob(afterRev, c.path);
    const before = beforeText === null ? null : mod.measure(beforeText, c.oldPath);
    if (c.status === 'D') {
      if (before) leave(mod.overFunctions(before), c.oldPath);
      continue;
    }
    if (!afterIn) continue;
    const after = mod.measure(afterText, c.path);
    measured.push({ c, before: c.status === 'A' ? null : before, after, beforeText, afterText });
    if (c.status === 'A') {
      for (const l of mod.movableLines(afterText, c.path)) addedPool.set(l, (addedPool.get(l) || 0) + 1);
    } else if (before) {
      // Over-limit functions present before but gone (by key) after are candidates for a move.
      const afterKeys = mod.multiset(mod.overFunctions(after).map((f) => f.key));
      const left = [];
      for (const f of mod.overFunctions(before)) {
        const n = afterKeys.get(f.key) || 0;
        if (n > 0) afterKeys.set(f.key, n - 1); else left.push(f);
      }
      leave(left, c.path);
    }
  }

  // A "new" over-limit function is not new when one that was at least as large left
  // in the same change: renamed in place (same file, any name) or moved (same name,
  // another file). Renamed AND moved at once is not recognised; the message says to
  // split the rename into its own commit.
  const functionsLeaving = (f, file) => {
    const fits = (g) => g.lines >= f.lines && g.complexity >= f.complexity;
    let i = gone.findIndex((g) => g.file === file && fits(g));
    if (i < 0) i = gone.findIndex((g) => g.file !== file && g.name === f.name && fits(g));
    if (i < 0) return false;
    gone.splice(i, 1);
    return true;
  };

  for (const m of measured) {
    checked++;
    let movedOut = 0;
    if (m.before && m.before.lines > mod.LIMITS.fileLines) {
      frozen++;
      if (addedPool.size > 0 && m.after.lines < m.before.lines + 1) {
        const removed = mod.multiset(mod.movableLines(m.beforeText, m.c.oldPath));
        for (const l of mod.movableLines(m.afterText, m.c.path)) {
          const n = removed.get(l) || 0;
          if (n > 0) removed.set(l, n - 1);
        }
        for (const [l, n] of removed) {
          const avail = addedPool.get(l) || 0;
          const take = Math.min(n, avail);
          if (take > 0) { movedOut += take; addedPool.set(l, avail - take); }
        }
      }
    }
    violations.push(...mod.compareFile(m.before, m.after, { file: m.c.path, movedOut, functionsLeaving }));
  }
  return { violations, checked, frozen };
}

function treeMetricViolations(mod, list, beforeRev, afterRev) {
  const renames = new Map(list.filter((c) => c.status === 'R').map((c) => [c.oldPath, c.path]));
  const changed = new Set(list.filter((c) => c.status !== 'D').map((c) => c.path));
  const base = mod.collect(snapshot(beforeRev, mod.paths));
  const tip = mod.collect(snapshot(afterRev, mod.paths));
  return { violations: mod.compare(base, tip, { renames, changed }), checked: 0, frozen: 0 };
}

function report(results, label) {
  const all = results.flatMap((r) => r.violations);
  if (all.length === 0) {
    const checked = results.reduce((a, r) => a + r.checked, 0);
    const frozen = results.reduce((a, r) => a + r.frozen, 0);
    process.stdout.write(`quality-ratchet: OK (${label}; ${checked} file(s) checked, ${frozen} over-limit file(s) held)\n`);
    return 0;
  }
  process.stdout.write(`quality-ratchet: FAIL — ${all.length} regression(s) (${label})\n\n`);
  for (const v of all) {
    process.stdout.write(`  [${v.metric}] ${v.file}:${v.line}\n    ${v.message}\n    Fix: ${v.remedy}\n\n`);
  }
  const L = size.LIMITS;
  process.stdout.write(`  Limits: file ${L.fileLines} / function ${L.functionLines} normalized lines, complexity ${L.complexity} (ESLint classic). Normalized lines\n`
    + '  exclude comments and blank lines and count one statement per line, so reformatting does not help.\n'
    + '  See a file\'s numbers: node scripts/quality-ratchet.cjs --measure <file>\n');
  return 1;
}

function ciRange() {
  const ev = process.env.GITHUB_EVENT_NAME;
  const ref = process.env.GITHUB_REF;
  const before = process.env.PUSH_BEFORE;
  const zero = /^0+$/;
  if (ev === 'push' && ref === 'refs/heads/main') {
    // origin/main...HEAD is empty by construction once a push to main has landed
    // (closure-gate.yml learned this on a real run), so a push to main judges before..after.
    if (!before || zero.test(before)) die('push to main without a usable before SHA — refusing rather than judging an empty range.');
    try { git(['merge-base', '--is-ancestor', before, 'HEAD']); } catch { die(`before ${before} is not an ancestor of HEAD — refusing rather than judging an empty range.`); }
    return `${before}..HEAD`;
  }
  let base;
  try { base = git(['merge-base', 'origin/main', 'HEAD']).trim(); } catch { die('cannot compute merge-base with origin/main (is the checkout shallow?).'); }
  return `${base}..HEAD`;
}

function main() {
  const args = process.argv.slice(2);
  const mIdx = args.indexOf('--metrics');
  const staged = args.includes('--staged');
  const names = mIdx >= 0 ? (args[mIdx + 1] || '').split(',').filter(Boolean) : (staged ? DEFAULT_STAGED : DEFAULT_RANGE);
  for (const n of names) if (!METRICS[n]) die(`unknown metric '${n}' (known: ${Object.keys(METRICS).join(', ')})`);
  if (staged && names.some((n) => METRICS[n].kind === 'tree')) die('whole-project metrics (kind: tree) run in --range/--ci mode only.');

  if (args.includes('--measure')) {
    const fs = require('fs');
    const files = args.slice(args.indexOf('--measure') + 1).filter((a) => !a.startsWith('--'));
    for (const f of files) {
      const m = size.measure(fs.readFileSync(f, 'utf8'), f);
      const L = size.LIMITS;
      process.stdout.write(`${f}: ${m.lines} normalized lines (limit ${L.fileLines})${inScope(f) ? '' : ' [not in ratchet scope]'}\n`);
      for (const fn of size.overFunctions(m)) {
        process.stdout.write(`  ${fn.line}: ${fn.key} — ${fn.lines} lines, complexity ${fn.complexity}\n`);
      }
    }
    return 0;
  }

  let beforeRev;
  let afterRev;
  let list;
  let label;
  if (staged) {
    // First commit of a repo: compare against the empty tree.
    try { beforeRev = git(['rev-parse', '--verify', '-q', 'HEAD^{commit}']).trim(); } catch { beforeRev = EMPTY_TREE; }
    afterRev = '';
    list = changes(['--cached', beforeRev]);
    label = 'staged vs HEAD';
  } else {
    const range = args.includes('--ci') ? ciRange() : args[args.indexOf('--range') + 1];
    if (!range || !range.includes('..')) die('need --staged, --ci, --measure or --range BASE..TIP');
    const [b, t] = range.split('..');
    beforeRev = git(['rev-parse', '--verify', `${b}^{commit}`]).trim();
    afterRev = git(['rev-parse', '--verify', `${t}^{commit}`]).trim();
    list = changes([beforeRev, afterRev]);
    label = `${beforeRev.slice(0, 9)}..${afterRev.slice(0, 9)}`;
  }

  const results = [];
  for (const n of names) {
    const metric = METRICS[n];
    if (metric.kind === 'file') results.push(fileMetricViolations(metric.module, list, beforeRev, afterRev));
    else results.push(treeMetricViolations(metric.module, list, beforeRev, afterRev));
  }
  return report(results, label);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (e) {
    die(e && e.stack ? e.stack : String(e));
  }
}

module.exports = { changes, fileMetricViolations, inScope, size };
