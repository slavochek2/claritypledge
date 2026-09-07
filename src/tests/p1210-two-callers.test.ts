/** P1210 DW-22 — one implementation, two callers. */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES, HARNESS } from '../../scripts/points/two-callers.mjs'

describe('P1210 DW-22 — two callers per predicate', () => {
  it('MUST-PASS: every predicate is invoked by a skill file and imported by a p1210 test', () => {
    const r = run({})
    expect(r.verdict).toBe('PASS')
    expect(r.wired.length).toBeGreaterThanOrEqual(13)
    console.log('[DW-22 must-pass]', r.detail, '\n    wired: ' + r.wired.join(', '))
  })

  it('MUST-FAIL: a module reachable from tests only is FLAGGED', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('FLAG')
    expect(r.findings[0].module).toBe('orphan-predicate.mjs')
    expect(r.findings[0].missing.join(' ')).toContain('no skill file invokes it')
    console.log('[DW-22 must-fail]', r.detail)
  })

  it('the wired fixture PASSES, so the control is not a formatter', () => {
    expect(run(FIXTURES.pass).verdict).toBe('PASS')
  })

  it('the harness exemption is an explicit, named allowlist — not an inferred category', () => {
    expect([...HARNESS].sort()).toEqual([
      'build-rule-fixtures.mjs', 'md-spans.mjs', 'no-vacuous-tests.mjs',
      'redact-run.mjs', 'two-callers.mjs', 'verify-all.mjs', 'verify-fixture.mjs',
    ])
  })
})

describe('DW-22 — a CLI caller that cannot run is not a caller (found 2026-09-04)', () => {
  // room-split.mjs was invoked as a command by select.md and imported by a test —
  // both callers present, contract green — while having NO `import.meta.url`
  // block at all. The documented command exited 0 printing nothing: a gate wired
  // into Gate 2 that could never fail. Tests exercised the module; nothing
  // exercised the command.
  const FX = 'src/tests/fixtures/p1210/two-callers'

  it('a module a skill invokes as a command, with no CLI entry point, is FLAGGED', () => {
    const r = run({
      modulesDir: `${FX}/nocli`,
      skillFiles: [`${FX}/skill-nocli.md`],
      testFiles: [`${FX}/test-nocli.ts`],
      harness: new Set(),
    })
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('FLAG')
    expect(r.detail).toMatch(/NO CLI entry point/)
  })

  it('7c: the real repo still passes — every live predicate has a runnable command', () => {
    const r = run({})
    expect(r.verdict).toBe('PASS')
  })
})
