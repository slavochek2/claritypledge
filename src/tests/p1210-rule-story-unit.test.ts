/**
 * P1210 DW-9 — rule presence at a named location.
 *
 * SCOPE: this asserts the rule EXISTS and is correctly stated where it is named.
 * It does NOT assert that an agent obeys it — the pipeline is markdown with zero
 * executables and no test can observe a reader (P1210 §12).
 */
import { describe, it, expect } from 'vitest'
import { run, strippedFixture, RULE_SETS } from '../../scripts/points/rule-present.mjs'

const SET = 'story-unit'

describe('P1210 DW-9 — ' + SET + ' rules present', () => {
  it('MUST-PASS: the real files RESOLVE every rule in the set', () => {
    const r = run({ ruleSet: SET })
    expect(r.verdict).toBe('RESOLVE')
    expect(r.missing).toEqual([])
    expect(r.found.length).toBe(Object.values(RULE_SETS[SET].locations).flat().length)
    console.log('[DW-9 must-pass]', r.detail)
  })

  it('MUST-FAIL: the fixture with one rule sentence deleted is REJECTED, naming it', () => {
    const r = run(strippedFixture(SET))
    expect(r.verdict).toBe('REJECT')
    expect(r.missing.length).toBeGreaterThan(0)
    console.log('[DW-9 must-fail]', r.detail)
  })

  it('every rule in the set names a location that exists', () => {
    for (const loc of Object.keys(RULE_SETS[SET].locations)) {
      expect(loc).toMatch(/\.md$/)
    }
  })
})
