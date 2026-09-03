/** P1210 DW-8 — the point target is a planning figure; the shortfall is reported, never enforced. */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/report-target.mjs'
import { run as rulePresent } from '../../scripts/points/rule-present.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const PREPARE = path.resolve(__dirname, '../../.claude/commands/slava/disagreement/prepare.md')

describe('P1210 DW-8 — point target and shortfall report', () => {
  it('MUST-FAIL: short of target prints "<filed> of <planned>"', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('SHORT')
    expect(r.line).toBe('3 of 7')
    expect(r.detail).toContain('3 of 7')
    console.log('[DW-8 must-fail]', r.detail)
  })

  it('MUST-PASS: at target prints NOTHING — a line that always appears is a banner', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('AT-TARGET')
    expect(r.detail).toBe('')
    console.log('[DW-8 must-pass] (no output, as required)')
  })

  it('above target is also silent', () => {
    expect(run({ filed: 8, planned: 7 }).detail).toBe('')
  })

  it('the rule that an arguer is added only against a named new contradiction is STATED in prepare.md', () => {
    const text = readFileSync(PREPARE, 'utf8')
    expect(text).toMatch(/added only against a \*\*named new contradiction sentence\*\*/)
    expect(text).toMatch(/file what the topic honestly yields/i)
    // and the rule-presence harness still resolves the sibling one-gate rules in this file
    expect(rulePresent({ ruleSet: 'one-gate' }).verdict).toBe('RESOLVE')
  })
})
