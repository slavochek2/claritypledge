/** P1210 DW-3a — the deterministic half of the redundancy check. DW-3b prints, RD-7. */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES, normalise } from '../../scripts/points/redundancy.mjs'

describe('P1210 DW-3a — redundancy, deterministic half', () => {
  it('MUST-PASS: two distinct propositions PASS', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('PASS')
    console.log('[DW-3a must-pass]', r.detail)
  })

  it('MUST-FAIL: one proposition repeated verbatim FAILS', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('FAIL')
    expect(r.dupes).toHaveLength(1)
    console.log('[DW-3a must-fail]', r.detail)
  })

  it('normalisation covers whitespace, case and terminal punctuation only', () => {
    expect(normalise('The  Same  Claim.')).toBe(normalise('the same claim'))
    expect(normalise('a claim')).not.toBe(normalise('a different claim'))
  })

  it('DW-3b: the reworded near-miss is PRINTED and left undecided, never rounded to a verdict', () => {
    const r = run(FIXTURES.nearMiss)
    expect(r.nearMisses.length).toBeGreaterThan(0)
    expect(r.detail).toContain('NEAR-MISS (undecided, founder judges at /ship)')
    // It is NOT a duplicate: no similarity threshold decides this half.
    expect(r.dupes).toHaveLength(0)
    console.log('[DW-3b near-miss, for the founder at /ship]', r.detail)
  })
})
