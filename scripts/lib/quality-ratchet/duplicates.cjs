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

const { normalizedLines } = require('./size.cjs');
const { scope } = require('./scope.cjs');

const WINDOW = 10;
const SUBSTANTIVE = 7;

// The shared scope, plus the stage 4 trial's only noise class: prototypes copy
// production code by design.
const inScope = scope([
  { glob: 'src/app/pages/prototypes/**', reason: 'prototype pages copy production code by design (P1566 stage 4 trial)' },
  { glob: 'src/app/tree/**', reason: 'dev-gated /tree demos copy production code by design (P1566 stage 4 trial)' },
]);

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
    // A file that cannot be measured is a tool error (exit 2), never a silent skip.
    const lines = normalizedLines(content, p).filter((l) => !isImport(l));
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

const countIn = (locs, file) => locs.reduce((n, l) => n + (l.file === file ? 1 : 0), 0);

// Violations for windows that occur more often at the tip, merged into one finding per
// contiguous run of lines in a file, naming where else the block lives. A copy is
// reported where it was ADDED: in a file whose own count of the window rose, so an
// existing copy in a file the change merely touched is never blamed.
function compare(base, tip, ctx = {}) {
  const renames = ctx.renames || new Map();
  const fresh = new Map(); // file to Set(at)
  const detail = new Map(); // `${file}:${at}` to { others, now, was }
  for (const [id, locs] of tip.windows) {
    if (locs.length < 2) continue;
    // Base locations under their tip names, so a renamed file's old copy stays its own.
    const baseLocs = (base.windows.get(id) || []).map((l) => ({ file: renames.get(l.file) || l.file, at: l.at }));
    if (locs.length <= baseLocs.length) continue;
    for (const l of locs) {
      if (countIn(locs, l.file) <= countIn(baseLocs, l.file)) continue;
      if (!fresh.has(l.file)) fresh.set(l.file, new Set());
      fresh.get(l.file).add(l.at);
      detail.set(`${l.file}:${l.at}`, { others: locs.filter((o) => o !== l), now: locs.length, was: baseLocs.length });
    }
  }
  const out = [];
  for (const [file, ats] of fresh) {
    const sorted = [...ats].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = start;
    const flush = () => {
      const lines = tip.text.get(file);
      const d = detail.get(`${file}:${start}`);
      const others = [...new Set(d.others.map((o) => o.file))];
      out.push({
        metric: 'duplicates',
        file,
        line: 1,
        message: `${prev - start + WINDOW} duplicated lines starting \`${lines[start].slice(0, 80)}\` now occur ${d.now} times `
          + `(was ${d.was}; no new copy allowed of any ${WINDOW}-line block with ${SUBSTANTIVE}+ lines of code). Also in: ${others.join(', ')}.`,
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
