'use strict';
// P1566 stage 4 — exact duplicate blocks, whole project, CI-only.
//
// Why it matters for the product: a bug fixed in one copy of pasted code stays live in
// the other, and comes back as "we already fixed this".
//
// "Exact" means the same code once formatting and comments are set aside: files are
// compared as the size metric's normalized lines (TS printer, comments stripped, one
// statement per line), so re-indenting or re-commenting a copy does not hide it. Built on
// the TypeScript compiler already in the repo; no new dependency.
//
// A duplicate is a window of WINDOW consecutive normalized lines, at least SUBSTANTIVE of
// them real code, that occurs more than once. Import lines are ignored (every file shares
// them). The ratchet fails when a window occurs MORE often at the tip than at the base:
// moving or renaming code keeps the count, a new copy raises it.

const ts = require('typescript');
const { normalizedLines } = require('./size.cjs');

const WINDOW = 10;
const SUBSTANTIVE = 7;

const INCLUDE = [/^src\/.*\.(ts|tsx)$/, /^supabase\/functions\/.*\.ts$/];
// Prototype folders copy production code by design (the stage 4 trial's only noise class).
const EXCLUDE = [/\.test\.(ts|tsx)$/, /^src\/tests\//, /\.d\.ts$/, /^src\/app\/prototypes\//, /^src\/app\/pages\/prototypes\//, /^src\/app\/tree\//];
const inScope = (p) => INCLUDE.some((r) => r.test(p)) && !EXCLUDE.some((r) => r.test(p));

const isImport = (l) => /^(import\b|export \* from|export \{[^}]*\} from|export type \{[^}]*\} from)/.test(l);
const substantive = (l) => l.length >= 12 && /[A-Za-z]/.test(l);

// FNV-1a over the joined window; collisions only ever merge two windows' counts.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + ':' + s.length;
}

function collect(files) {
  const windows = new Map(); // id to [{file, at}]
  const text = new Map(); // file to normalized lines
  for (const [p, content] of files) {
    if (!inScope(p)) continue;
    let lines;
    try { lines = normalizedLines(content, p).filter((l) => !isImport(l)); } catch { continue; }
    text.set(p, lines);
    for (let i = 0; i + WINDOW <= lines.length; i++) {
      const w = lines.slice(i, i + WINDOW);
      if (w.filter(substantive).length < SUBSTANTIVE) continue;
      const id = hash(w.join('\n'));
      if (!windows.has(id)) windows.set(id, []);
      windows.get(id).push({ file: p, at: i });
    }
  }
  return { windows, text };
}

// Violations for windows that occur more often at the tip, merged into one finding per
// contiguous run of lines in a file, naming where else the block lives. Reported only in
// files this change touched (the new copy), unless none of the copies is in one.
function compare(base, tip, ctx = {}) {
  const changed = ctx.changed || null;
  const fresh = new Map(); // file to Set(at)
  const elsewhere = new Map(); // `${file}:${at}` to other locations
  for (const [id, locs] of tip.windows) {
    if (locs.length < 2) continue;
    const before = (base.windows.get(id) || []).length;
    if (locs.length <= before) continue;
    const touched = changed ? locs.filter((l) => changed.has(l.file)) : [];
    for (const l of touched.length ? touched : locs) {
      if (!fresh.has(l.file)) fresh.set(l.file, new Set());
      fresh.get(l.file).add(l.at);
      elsewhere.set(`${l.file}:${l.at}`, locs.filter((o) => o !== l));
    }
  }
  const out = [];
  for (const [file, ats] of fresh) {
    const sorted = [...ats].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = start;
    const flush = () => {
      const lines = tip.text.get(file);
      const others = [...new Set((elsewhere.get(`${file}:${start}`) || []).map((o) => o.file))];
      out.push({
        metric: 'duplicates',
        file,
        line: 1,
        message: `${prev - start + WINDOW} duplicated lines starting \`${lines[start].slice(0, 80)}\`; the same block is in ${others.join(', ')}.`,
        remedy: 'Extract the shared block into one function or component and call it from both places. '
          + 'If you moved code, delete the old copy in the same commit.',
      });
    };
    for (const at of sorted.slice(1)) {
      if (at > prev + 1) { flush(); start = at; }
      prev = at;
    }
    flush();
  }
  return out;
}

module.exports = { kind: 'tree', paths: ['src', 'supabase/functions'], collect, compare, WINDOW, SUBSTANTIVE };
