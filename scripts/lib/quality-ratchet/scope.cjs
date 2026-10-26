'use strict';
// P1566 — which files the quality ratchet judges, shared by every metric so one list
// cannot drift from another. Every exclusion carries its reason (spec invariant: no
// silent exemptions); an entry without one makes the runner exit 2, never pass.

// Every extension Vite or Deno would load as code, any case; [\s\S] so a path containing a
// newline cannot fall out of scope.
const SCOPE = [/^src\/[\s\S]*\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/i, /^supabase\/functions\/[\s\S]*\.(ts|tsx|js|mts|mjs)$/i];

const EXCLUDED = [
  { glob: '**/*.test.*', reason: 'tests are out of v1 scope: feature tests already go in new files (P1566 stage 1 trial)' },
  { glob: 'src/tests/**', reason: 'tests are out of v1 scope (P1566 stage 1 trial)' },
  { glob: '**/*.d.ts', reason: 'declaration files carry no runtime code' },
  { glob: '**/*.d.mts', reason: 'declaration files carry no runtime code' },
  { glob: '**/*.d.cts', reason: 'declaration files carry no runtime code' },
  { glob: 'src/app/prototypes/**', reason: 'throwaway prototypes, already excluded from ESLint (eslint.config.js ignores)' },
];

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:[\\s\\S]*/)?'; } else re += '[\\s\\S]*';
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

function compile(list) {
  return list.map((e) => {
    if (!e.reason || !String(e.reason).trim()) throw new Error(`exclusion '${e.glob}' has no reason; every exemption must say why`);
    return { ...e, re: globToRegex(e.glob) };
  });
}

const BASE = compile(EXCLUDED);

// extra: a metric's own reasoned exclusions, in the same { glob, reason } shape.
function scope(extra = []) {
  const all = BASE.concat(compile(extra));
  return (p) => SCOPE.some((r) => r.test(p)) && !all.some((e) => e.re.test(p));
}

module.exports = { scope, inScope: scope(), EXCLUDED };
