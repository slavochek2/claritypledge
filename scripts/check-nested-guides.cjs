#!/usr/bin/env node
'use strict';
// P1566 layer C — nested folder guides stay short and harness-neutral.
//
// Every CLAUDE.md under src/ is a nested guide: at most MAX_LINES lines, with a sibling
// AGENTS.md that is a symlink to it (the root pair's shape, AGENTS.md -> CLAUDE.md), so
// Codex reads the same file Claude Code does. The hot folders the spec names must have one.
//
// Reads git objects, never the working tree: the index by default (pre-commit), or a
// commit with --rev (CI).
//
// Exit: 0 = ok, 1 = a guide is missing, too long or not linked, 2 = could not run.

const { execFileSync } = require('child_process');

const MAX_LINES = 40;
// The spec's hot folders: the seed is hand-typed, every other guide is derived from git.
const REQUIRED = ['src/app/data', 'src/app/pages', 'src/app/components'];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
}

function entries(rev) {
  const out = rev ? git(['ls-tree', '-r', '-z', rev, '--', 'src']) : git(['ls-files', '-s', '-z', '--', 'src']);
  const map = new Map();
  for (const rec of out.split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab).split(/\s+/);
    // ls-files -s: mode sha stage · ls-tree: mode type sha
    const mode = meta[0];
    const sha = rev ? meta[2] : meta[1];
    map.set(rec.slice(tab + 1), { mode, sha });
  }
  return map;
}

function main() {
  const args = process.argv.slice(2);
  const rev = args.includes('--rev') ? args[args.indexOf('--rev') + 1] : null;
  const files = entries(rev);
  const blob = (sha) => git(['cat-file', 'blob', sha]);
  const problems = [];

  const guides = [...files.keys()].filter((p) => /^src\/(.+\/)?CLAUDE\.md$/.test(p));
  for (const dir of REQUIRED) {
    if (!files.has(`${dir}/CLAUDE.md`)) {
      problems.push(`${dir}/CLAUDE.md is missing. Fix: restore the folder guide (what the folder owns, how to split a file at the size limit, how to test).`);
    }
  }
  for (const g of guides) {
    const dir = g.slice(0, -'/CLAUDE.md'.length);
    const lines = blob(files.get(g).sha).replace(/\n$/, '').split('\n').length;
    if (lines > MAX_LINES) {
      problems.push(`${g} has ${lines} lines (limit ${MAX_LINES}). Fix: cut it to what an agent needs in this folder; link to docs/ for the rest.`);
    }
    const a = files.get(`${dir}/AGENTS.md`);
    if (!a) {
      problems.push(`${dir}/AGENTS.md is missing. Fix: (cd ${dir} && ln -s CLAUDE.md AGENTS.md) and stage it.`);
    } else if (a.mode !== '120000' || blob(a.sha) !== 'CLAUDE.md') {
      problems.push(`${dir}/AGENTS.md must be a symlink to CLAUDE.md, not a copy. Fix: rm it, then (cd ${dir} && ln -s CLAUDE.md AGENTS.md) and stage it.`);
    }
  }
  for (const p of files.keys()) {
    if (/^src\/(.+\/)?AGENTS\.md$/.test(p) && !files.has(p.replace(/AGENTS\.md$/, 'CLAUDE.md'))) {
      problems.push(`${p} has no sibling CLAUDE.md. Fix: write the guide as CLAUDE.md and keep AGENTS.md as a symlink to it.`);
    }
  }

  if (problems.length) {
    process.stdout.write(`nested-guides: FAIL\n${problems.map((p) => `  ${p}`).join('\n')}\n`);
    return 1;
  }
  process.stdout.write(`nested-guides: OK (${guides.length} guide(s), each at most ${MAX_LINES} lines with an AGENTS.md symlink)\n`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  process.stderr.write(`nested-guides: ERROR: ${String(e.stderr || e.message).trim()}\n`);
  process.exitCode = 2;
}
