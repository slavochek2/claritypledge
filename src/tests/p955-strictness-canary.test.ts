/**
 * P955 Strictness Canary — Anti-Decay Guard
 *
 * EXPECTED STATE: THIS FILE IS RED UNTIL PHASE 2g EDITS dev.md AND fix.md.
 *
 * This canary is the epistemic-gate-7 proof required before committing:
 * it demonstrates the gate FAILING against the current pre-fix files.
 * The red state is intentional — it proves the grep patterns actually fire.
 *
 * After Phase 2g (the /dev step that replaces softening phrases with blocking
 * language in dev.md and fix.md), this canary turns green and remains green
 * as a permanent regression guard.
 *
 * Timeline:
 *   NOW (pre-Phase-2g):    absent-phrase + presence tests RED  <- required proof
 *   AFTER Phase 2g:        all tests GREEN                      <- permanent guard
 *
 * Softening phrases targeted — VERIFIED against the live files 2026-06-27
 * (do not trust the spec's shorthand; these are the real strings):
 *   dev.md:744  "advisory — don't block"
 *   dev.md:166  "take a screenshot or run visual QA subagent"
 *   dev.md:745  '...manually for visual QA" and proceed to step 4.'  (Chrome-unavailable fallback)
 *   fix.md:465  "OR write explicit `N/A:"
 *
 * NOTE on "proceed to step 4": this phrase also legitimately appears at
 * dev.md:742 (the PASS branch). The canary targets ONLY the Chrome-unavailable
 * fallback softening at :745 by matching its surrounding context, so Phase 2g
 * does not need to touch the legitimate PASS-flow line.
 *
 * Reference: features/p955_ui_build_loop.md § AD-5, § Phase 2(g)
 * Run: npx vitest run src/tests/p955-strictness-canary.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../');

function readSkillFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

const devMd = readSkillFile('.claude/commands/slava/build/dev.md');
const fixMd = readSkillFile('.claude/commands/slava/build/fix.md');

// ---------------------------------------------------------------------------
// Absent-phrase assertions — CURRENTLY RED against pre-fix files
//
// These FAIL now (the phrases are present). They turn GREEN after Phase 2g
// replaces the softening language. The current red state is the
// epistemic-gate-7 proof that the canary fires.
// ---------------------------------------------------------------------------

describe('P955 strictness canary — softening phrases must be ABSENT', () => {
  it('[dev.md] does NOT contain "advisory — don\'t block" (gate must block, not advise)', () => {
    expect(devMd).not.toContain("advisory — don't block");
  });

  it('[dev.md] does NOT contain "take a screenshot or run visual QA subagent" (OR makes the gate optional)', () => {
    expect(devMd).not.toContain('take a screenshot or run visual QA subagent');
  });

  it('[dev.md] Chrome-unavailable fallback does NOT silently advance past the gate', () => {
    // Targets ONLY the :745 fallback softening, not the legitimate :742 PASS line.
    expect(devMd).not.toContain('manually for visual QA" and proceed to step 4');
  });

  it('[fix.md] does NOT contain "OR write explicit `N/A:" (N/A escape hatch removed for tsx diffs)', () => {
    expect(fixMd).not.toContain('OR write explicit `N/A:');
  });
});

// ---------------------------------------------------------------------------
// Presence assertions — must be GREEN after Phase 2g
//
// Verify the gate's strictness tokens are added by Phase 2g. RED now (tokens
// don't exist yet), green after 2g.
// ---------------------------------------------------------------------------

describe('P955 strictness canary — strictness tokens must be PRESENT after Phase 2g', () => {
  it('[dev.md] references "p955-gate" (the deterministic gate must be named in the skill)', () => {
    expect(devMd).toContain('p955-gate');
  });

  it('[fix.md] references "p955-gate" (gate applies to /fix runs, not just /dev)', () => {
    expect(fixMd).toContain('p955-gate');
  });
});
