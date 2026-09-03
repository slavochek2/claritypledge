/** P1210 DW-10 — no timestamps in story prose; the evidence block is exempt. */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/story-scan.mjs'

describe('P1210 DW-10 — story timestamp scan', () => {
  it('MUST-PASS: clean prose PASSES with the evidence block present', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('PASS')
    expect(r.hits).toEqual([])
    console.log('[DW-10 must-pass]', r.detail)
  })

  it('MUST-FAIL: a timestamp in prose FAILS, naming the offending span', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('FAIL')
    expect(r.hits).toHaveLength(1)
    expect(r.hits[0].span).toBe('15:55')
    expect(r.detail).toContain('15:55')
    console.log('[DW-10 must-fail]', r.detail)
  })

  it('the exemption is the delimited block, not a guess about where evidence lives', () => {
    const outside = run({ text: 'prose\n<!-- evidence:start -->\nquote | seconds: 955\n<!-- evidence:end -->\nseconds: 12' })
    expect(outside.verdict).toBe('FAIL')
    expect(outside.hits[0].line).toBe(5)
  })

  it('catches the several timecode spellings this pipeline actually produces', () => {
    for (const span of ['[01:23]', '4:07', 'seconds: 955', '~1120s']) {
      expect(run({ text: `he says so ${span} directly` }).verdict).toBe('FAIL')
    }
  })
})
