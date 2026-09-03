/** P1210 DW-2 — SOURCE-FIDELITY: assert AND deny, or REFUSE naming the missing side. */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/admissibility.mjs'

describe('P1210 DW-2 — admissibility', () => {
  it('MUST-PASS: an axis carrying a quote-grounded assert and deny FILES', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('FILE')
    expect(r.ok).toBe(true)
    console.log('[DW-2 must-pass]', r.detail)
  })

  it('MUST-FAIL: the deny-only fixture REFUSES and names the missing side', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('REFUSE')
    expect(r.missing).toContain('deny')
    expect(r.detail).toMatch(/missing side: deny/)
    console.log('[DW-2 must-fail]', r.detail)
  })

  it('PREDICTED-OPPOSITION is reported and never decides the verdict', () => {
    const opposedReading = { ...FIXTURES.fail, predicted: { A1: 3, A2: -3 } }
    // A perfectly opposed Likert reading must not rescue a missing deny.
    expect(run(opposedReading).verdict).toBe('REFUSE')
    const agreeingReading = { ...FIXTURES.pass, predicted: { A1: 3, A2: 3 } }
    // ...and an agreeing reading must not block an axis the sources carry.
    expect(run(agreeingReading).verdict).toBe('FILE')
  })

  it('a single arguer asserting and denying is not two sides', () => {
    const r = run({
      point: 'P-self', pair: ['A1', 'A2'],
      quotes: [
        { arguer: 'A1', stance: 'assert', quote: 'x', seconds: 1 },
        { arguer: 'A1', stance: 'deny', quote: 'y', seconds: 2 },
      ],
    })
    expect(r.verdict).toBe('REFUSE')
  })

  it('an ungrounded quote (no timecode) does not count as evidence', () => {
    const r = run({
      point: 'P-ungrounded', pair: ['A1', 'A2'],
      quotes: [
        { arguer: 'A1', stance: 'assert', quote: 'x', seconds: 1 },
        { arguer: 'A2', stance: 'deny', quote: 'y', seconds: null as unknown as number },
      ],
    })
    expect(r.verdict).toBe('REFUSE')
  })
})
