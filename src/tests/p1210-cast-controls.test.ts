/** P1210 DW-17 — cast-level controls: one verdict, two printed values, and they must differ. */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/cast-controls.mjs'

describe('P1210 DW-17 — cast controls', () => {
  const star = run(FIXTURES.fail)
  const balanced = run(FIXTURES.pass)

  it('MUST-FAIL: a star cast — one arguer carrying more than half the filed points — is FLAGGED', () => {
    expect(star.verdict).toBe('FLAG')
    expect(star.detail).toContain('FINDING for the founder, not an auto-drop')
    console.log('[DW-17 must-fail]\n' + star.detail)
  })

  it('MUST-PASS: a balanced cast is NOT flagged', () => {
    expect(balanced.verdict).toBe('CLEAR')
    console.log('[DW-17 must-pass]\n' + balanced.detail)
  })

  it('THE TWO PRINTED VALUE SETS DIFFER — identical output on both means the control is a formatter', () => {
    expect(star.values).not.toEqual(balanced.values)
    expect(star.values.pairCoverage).not.toEqual(balanced.values.pairCoverage)
    expect(star.values.concentration).not.toEqual(balanced.values.concentration)
  })

  it('distinct verified axes and pair coverage are printed with NO threshold', () => {
    // Both fixtures carry four axes; the axis count alone decides nothing.
    expect(star.values.distinctVerifiedAxes).toBe(4)
    expect(balanced.values.distinctVerifiedAxes).toBe(4)
    expect(star.detail).toContain('printed, no threshold')
    expect(balanced.detail).toContain('printed, no threshold')
  })

  it('exactly half is not "more than half" — the threshold is strict', () => {
    const half = run({
      cast: ['A1', 'A2', 'A3', 'A4'],
      points: [
        { id: 'P1', axis: 'a', positions: [{ arguer: 'A1', value: 3, strength: 'close' }, { arguer: 'A2', value: -3, strength: 'close' }] },
        { id: 'P2', axis: 'b', positions: [{ arguer: 'A3', value: 3, strength: 'close' }, { arguer: 'A4', value: -3, strength: 'close' }] },
      ],
    })
    expect(half.verdict).toBe('CLEAR')
  })
})
