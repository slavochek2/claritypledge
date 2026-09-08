/**
 * @file p1259-clamp-classes-compile.test.ts
 * @description P1259 change 5/6 — a `line-clamp-N` class that Tailwind never generates.
 *
 * THE BUG THIS EXISTS FOR IS NOT HYPOTHETICAL; IT SHIPPED AND SURVIVED A REVIEW.
 * `profile-page-v2.tsx` clamped agent story bodies with `line-clamp-8`. Tailwind 3.4's
 * default `lineClamp` scale is `{1..6}`, and this repo's `tailwind.config.js` does not
 * extend it — so `.line-clamp-8` was never emitted and that text was NEVER CLAMPED AT ALL.
 *
 * Measured 2026-09-08 with the Tailwind CLI over a file containing all four classes, with
 * `line-clamp-6` as the known-good control and `line-clamp-8` as the known-bad:
 *
 *     .line-clamp-6      → generated
 *     .line-clamp-8      → ABSENT
 *     .line-clamp-[18]   → generated
 *     .line-clamp-[24]   → generated
 *
 * The failure is silent in every direction that matters: the class sits in the source
 * looking correct, the page renders, nothing errors, and the only symptom is a "Show more"
 * control with nothing to reveal — which is precisely the defect the founder reported as
 * "this button here does nothing! siwting it moves nothing!" and which the spec attributes
 * to a character-threshold/clamp mismatch. The mismatch was real; this was under it.
 *
 * SO THE RULE: above the generated scale, use the ARBITRARY form `line-clamp-[N]`, which
 * Tailwind's JIT emits for any number and which therefore cannot silently vanish.
 *
 * The bound is READ FROM TAILWIND rather than hardcoded to 6, so that adding
 * `theme.extend.lineClamp` to the config relaxes this gate automatically instead of leaving
 * a stale constant to be worked around.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const REPO = join(SRC, '..');

/** Every `line-clamp-N` written in the BARE form — the arbitrary `line-clamp-[N]` cannot match. */
const BARE_CLAMP = /\bline-clamp-(\d+)\b/g;

/**
 * STRIP COMMENTS BEFORE MATCHING — the same lesson `p1212-agent-surface-contract.test.ts`
 * records, arriving from the other direction.
 *
 * There it was false NEGATIVES: assertions went green on prose that named the symbol while
 * the code never referenced it. Here it is false POSITIVES, and the first run of this file
 * produced nine of them — every comment explaining WHY `line-clamp-8` is broken contains the
 * string `line-clamp-8`, including this file's own header. A gate that fires on its own
 * documentation is one nobody can keep green, and the fix is to delete the comment, which
 * removes the explanation and keeps the bug.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments, including JSX {/* … */}
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // line comments, sparing the // in URLs
}

/**
 * The numbers Tailwind will actually emit a `.line-clamp-N` rule for: its own default scale,
 * plus anything this repo adds under `theme.extend.lineClamp`.
 */
function generatedClampScale(): Set<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stub = require('tailwindcss/stubs/config.full.js') as { theme: { lineClamp: Record<string, string> } };
  const scale = new Set(Object.keys(stub.theme.lineClamp));

  const config = readFileSync(join(REPO, 'tailwind.config.js'), 'utf8');
  const extendBlock = /lineClamp\s*:\s*\{([^}]*)\}/.exec(config);
  if (extendBlock) {
    for (const [, key] of (extendBlock[1] ?? '').matchAll(/["']?(\d+)["']?\s*:/g)) if (key) scale.add(key);
  }
  return scale;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx?|jsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('P1259 — every line-clamp class in the tree actually compiles', () => {
  it('the Tailwind scale really does stop below the values this repo needs', () => {
    // The premise control. If this ever passes trivially — because someone extended the
    // theme — the assertion below stops guarding anything, and this test says so out loud
    // rather than going quietly green.
    const scale = generatedClampScale();
    expect(scale.has('6'), 'the default scale should include 6').toBe(true);
    expect(
      scale.has('8'),
      'if 8 is now generated, theme.extend.lineClamp was added — re-read this file before trusting it',
    ).toBe(false);
  });

  it('no source file uses a bare line-clamp-N outside the generated scale', () => {
    const scale = generatedClampScale();
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const text = codeOnly(readFileSync(file, 'utf8'));
      for (const match of text.matchAll(BARE_CLAMP)) {
        const n = match[1];
        if (n === undefined || scale.has(n)) continue;
        const line = text.slice(0, match.index ?? 0).split('\n').length;
        offenders.push(`${relative(REPO, file)}:${line} → ${match[0]}`);
      }
    }

    expect(
      offenders,
      `Tailwind generates .line-clamp-N only for {${[...generatedClampScale()].join(',')}}. ` +
        'These compile to NOTHING, so the element is not clamped and any "show more" control ' +
        'beside it has nothing to reveal. Use the arbitrary form line-clamp-[N] instead:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The two surfaces the spec names by line number. Pinned individually so that reverting
   * either one to a bare class fails with the surface's own name rather than as an anonymous
   * entry in the sweep above.
   */
  it.each([
    ['the profile story body', 'app/pages/profile-page-v2.tsx', 'line-clamp-[24]'],
    ['the feed story body', 'app/components/feed/feed-story-card.tsx', 'line-clamp-[18]'],
  ])('%s uses the arbitrary-value clamp', (_name, file, expected) => {
    expect(readFileSync(join(SRC, file), 'utf8')).toContain(expected);
  });
});
