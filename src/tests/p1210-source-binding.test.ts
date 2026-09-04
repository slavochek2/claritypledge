/**
 * A claim-match verdict belongs to a FILE, never to a person.
 *
 * Incident (2026-09-04): an arguer's position was evidenced from one video while a
 * different video was carried as the source. The carried file scored 0 on every term
 * of the position it was supposed to argue. Caught by the downstream judge, not here.
 */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/source-binding.mjs'

describe('source-binding — the verdict belongs to the file that was carried', () => {
  it('MUST-PASS: match measured against the selected source is BOUND', () => {
    const r = run(FIXTURES.pass)
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('BOUND')
    console.log('[source-binding must-pass]', r.detail)
  })

  it('MUST-FAIL: match measured against a DIFFERENT file than the one carried is REFUSED', () => {
    const r = run(FIXTURES.fail)
    expect(r.ok).toBe(false)
    expect(r.offenders).toEqual(['Arguer A'])
    expect(r.detail).toContain('STALE')
    console.log('[source-binding must-fail]', r.detail)
  })

  it('a source scoring zero on every term of its own position is REFUSED', () => {
    const r = run({ arguers: [{ arguer: 'B', position: 'public ownership', selected_source_id: 'S',
      claim_match: { measured_against_source_id: 'S', terms: { 'ownership stake': 0, '50%': 0 } } }] })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toContain('does not argue the position it is carried for')
  })

  it('no claim-match recorded at all is UNBOUND, not a pass', () => {
    const r = run({ arguers: [{ arguer: 'C', position: 'p', selected_source_id: 'S', claim_match: null }] })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toContain('UNBOUND')
  })

  it('an empty arguer list confirms nothing', () => {
    expect(run({ arguers: [] }).verdict).toBe('REFUSE')
  })
})
