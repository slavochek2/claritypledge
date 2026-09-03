/**
 * P1210 DW-20, wired so it survives the spec closing.
 *
 * WHY THIS FILE EXISTS. `verify-all.mjs` is the completeness sweep: it runs every
 * predicate against its must-pass AND its must-fail fixture and refuses any predicate
 * that has no must-fail fixture at all. Until this file, its only caller was P1210's
 * own goal-gate contract — which stops running the moment the spec closes and moves to
 * features/done/. That would have left the sweep as code nothing calls, which is the
 * exact defect §12 was written to end, come true about the branch's own safety net.
 *
 * Living in src/tests/ puts it under `npm test`, and therefore under
 * .github/workflows/test.yml, permanently and independently of any P-number.
 *
 * WHY A SUBPROCESS AND NOT AN IMPORT. `verify-all.mjs` resolves its predicates with
 * dynamic `import()`; vite's SSR transform rewrites that and then fails to parse the
 * file's shebang, so importing it here is not available. Spawning is also the more
 * faithful test — the contract this row asserts is an EXIT CODE, and that is what the
 * goal-gate and any future CI step read. Asserting the exit code directly tests the
 * thing, not a re-implementation of it.
 *
 * SCOPE, stated so nothing reads more into it: this is the sweep, not the per-line
 * controls. Each Done-When row still owns its own must-fail fixture; this only checks
 * that none is missing and that each one still bites. Two sibling checks remain
 * deliberately manual and are NOT wired here — `no-vacuous-tests.mjs` (would run vitest
 * inside vitest) and `verify-fixture.mjs` half (b) (its source run file is gitignored,
 * so it is unverifiable in CI by design). Founder decision 2026-09-03 at /ship.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function runSweep() {
  try {
    return { code: 0, out: execFileSync('node', ['scripts/points/verify-all.mjs'], { cwd: REPO_ROOT, encoding: 'utf8' }) }
  } catch (e: any) {
    return { code: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

describe('P1210 DW-20 — the completeness sweep, wired into npm test', () => {
  const r = runSweep()

  it('exits 0: every predicate passes its must-pass and FAILS its must-fail', () => {
    console.log('[DW-20 sweep]\n' + r.out)
    expect(r.out).not.toContain('MUST-FAIL DID NOT FAIL')
    expect(r.out).not.toContain('MUST-PASS DID NOT PASS')
    expect(r.out).not.toContain('NO-MUST-PASS')
    expect(r.code).toBe(0)
  })

  it('swept a non-trivial number of predicates — an empty sweep is not a pass', () => {
    const m = r.out.match(/PASS — (\d+) predicate\(s\)/)
    expect(m, 'sweep printed no PASS summary line').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(13)
  })

  // Gate 7: the sweep's own failure path, exercised rather than asserted. The CLI runs
  // a predicate carrying no must-fail fixture through the identical path every time and
  // exits non-zero if it fails to catch it — so a green run is never trusted alone.
  it('self-control: a predicate with no must-fail fixture is CAUGHT, not waved through', () => {
    expect(r.out).toContain('NO-MUST-FAIL')
    expect(r.out).toContain('CAUGHT — this sweep exits non-zero on it')
    expect(r.out).not.toContain('NOT CAUGHT — the sweep is blind')
  })
})
