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
// before/after per file (size.cjs). A `tree` metric collects findings over the whole
// project at both commits and compares them (cycles.cjs, duplicates.cjs); it receives an
// in-memory snapshot (path to content) read from git objects. A tool that needs files on
// disk (Knip, tsc for the deferred typecheck-gate.sh "Option B") would first need the
// runner to materialize each commit, e.g. with `git worktree add --detach`.

const { execFileSync } = require('child_process');
const size = require('./lib/quality-ratchet/size.cjs');
const cycles = require('./lib/quality-ratchet/cycles.cjs');
const duplicates = require('./lib/quality-ratchet/duplicates.cjs');
const { snapshot } = require('./lib/quality-ratchet/snapshot.cjs');
// Which files are judged, and every exclusion with its reason, lives in one place.
const { inScope } = require('./lib/quality-ratchet/scope.cjs');

// file metrics run anywhere; tree metrics read the whole project at two commits, so they
// run in range/CI mode only (spec invariant: whole-graph gates are CI-only).
const METRICS = {
  size: { kind: 'file', module: size },
  cycles: { kind: 'tree', module: cycles },
  duplicates: { kind: 'tree', module: duplicates },
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

// A rename that also cut the file hard falls below git's -M similarity and arrives as
// delete + add. Pair them back into one rename BEFORE anything is measured, when most of
// the new file's lines came from the deleted one, so the file is judged against its own
// past (a shrink is not a "new oversize file") and its functions can be followed.
function pairCutRenames(mod, list, beforeRev, afterRev) {
  const adds = list.filter((c) => c.status === 'A' && inScope(c.path));
  const dels = list.filter((c) => c.status === 'D' && inScope(c.oldPath));
  if (adds.length === 0 || dels.length === 0) return list;
  const dm = dels.map((c) => ({ c, movable: mod.measure(blob(beforeRev, c.oldPath), c.oldPath).movable }));
  const replaced = new Map();
  for (const a of adds) {
    const am = mod.measure(blob(afterRev, a.path), a.path);
    let best = null;
    for (const d of dm) {
      if (replaced.has(d.c)) continue;
      const share = mod.containment(d.movable, am.movable);
      if (share >= 0.5 && (!best || share > best.share)) best = { d, share };
    }
    if (best) replaced.set(best.d.c, a);
  }
  if (replaced.size === 0) return list;
  const drop = new Set([...replaced.keys(), ...replaced.values()]);
  return list.filter((c) => !drop.has(c)).concat([...replaced].map(([d, a]) => ({ status: 'R', oldPath: d.oldPath, path: a.path })));
}

function fileMetricViolations(mod, rawList, beforeRev, afterRev) {
  const list = pairCutRenames(mod, rawList, beforeRev, afterRev);
  const violations = [];
  let checked = 0;
  let frozen = 0;
  const measured = [];
  const gone = []; // over-limit functions that left their file (by key) in this change
  const added = new Map(); // net-added movable lines across every file in this change
  const ownAdded = new Map(); // path to that file's own net-added lines

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
    measured.push({ c, before: c.status === 'A' ? null : before, after });
    // Lines this change added to the file (all of them for a new file). Code moved out of
    // an over-limit file lands here whether the destination is new or already existed.
    const net = mod.multiset(after.movable);
    if (before) for (const l of before.movable) { const n = net.get(l) || 0; if (n > 0) net.set(l, n - 1); }
    ownAdded.set(c.path, net);
    for (const [l, n] of net) if (n > 0) added.set(l, (added.get(l) || 0) + n);
    if (c.status !== 'A' && before) {
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

  // A "new" over-limit function is not new when one that was at least as large left in
  // the same change AND shares most of its body: renamed in place (same file, any name)
  // or moved (same name, another file). Without the body check, deleting one long
  // function would license an unrelated new one. Renamed AND moved at once is not
  // recognised; the message says to split the rename into its own commit.
  const functionsLeaving = (f, file) => {
    const fits = (g) => g.lines >= f.lines && g.complexity >= f.complexity && mod.containment(g.body, f.body) >= mod.SAME;
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
      if (m.after.lines <= m.before.lines) {
        // Lines removed from this file that this change added somewhere else = moved out.
        const removed = mod.multiset(m.before.movable);
        for (const l of m.after.movable) { const n = removed.get(l) || 0; if (n > 0) removed.set(l, n - 1); }
        const own = ownAdded.get(m.c.path) || new Map();
        for (const [l, n] of removed) {
          const avail = (added.get(l) || 0) - (own.get(l) || 0);
          const take = Math.min(n, avail);
          // Claimed lines leave the pool: one copy cannot pay for growth in two files.
          if (take > 0) { movedOut += take; added.set(l, added.get(l) - take); }
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
  if (all.some((v) => v.metric === 'size')) {
    const L = size.LIMITS;
    process.stdout.write(`  Limits: file ${L.fileLines} / function ${L.functionLines} normalized lines, complexity ${L.complexity} (ESLint classic). Normalized lines\n`
      + '  exclude comments and blank lines and count one statement per line, so reformatting does not help.\n'
      + '  See a file\'s numbers: node scripts/quality-ratchet.cjs --measure <file>\n');
  }
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
  const target = `origin/${process.env.GITHUB_BASE_REF || 'main'}`;
  let base;
  try { base = git(['merge-base', target, 'HEAD']).trim(); } catch { die(`cannot compute merge-base with ${target} (is the checkout shallow, or the base branch not fetched?).`); }
  return `${base}..HEAD`;
}

function main() {
  const args = process.argv.slice(2);
  const mIdx = args.indexOf('--metrics');
  const staged = args.includes('--staged');
  const names = mIdx >= 0 ? (args[mIdx + 1] || '').split(',').filter(Boolean) : (staged ? DEFAULT_STAGED : DEFAULT_RANGE);
  if (names.length === 0) die('--metrics needs at least one metric name; an empty list would judge nothing.');
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
    if (range.includes('...')) die('--range takes BASE..TIP (two dots); a three-dot range would judge the wrong commits.');
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
