/** P1210 DW-19 — the two-artifact seal model (RD-1 KEEP). */
import { describe, it, expect } from 'vitest'
import { run, emit, sealPublication, hashBody, SEALS, FIXTURES } from '../../scripts/points/seal.mjs'

describe('P1210 DW-19 — construction and eligibility seals', () => {
  it('MUST-PASS: untouched blocks VERIFY', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('VERIFIES')
    console.log('[DW-19 must-pass]', r.detail)
  })

  it('MUST-FAIL: one character changed returns TAMPERED, naming which seal broke', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('TAMPERED')
    expect(r.broken.map(b => b.kind)).toEqual(['eligibility'])
    expect(r.detail).toContain('eligibility')
    console.log('[DW-19 must-fail]', r.detail)
  })

  it('BOTH seals are required — a run carrying only the construction seal is TAMPERED', () => {
    const only = emit('construction', { run: 'B', predictions: { P1: '40%' } })
    const r = run({ seals: [only] })
    expect(r.verdict).toBe('TAMPERED')
    expect(r.broken.map(b => b.kind)).toContain('eligibility')
  })

  it('the publication version is sealed AGAINST the eligibility seal, not beside it', () => {
    const eligibility = emit('eligibility', { run: 'B', eligible: ['P3'] })
    const pub = sealPublication(eligibility, 1)
    expect(pub.body.eligibility_hash).toBe(eligibility.hash)
    // Re-pointing a publication at different eligibility changes its hash.
    const other = emit('eligibility', { run: 'B', eligible: ['P3', 'P5'] })
    expect(sealPublication(other, 1).hash).not.toBe(pub.hash)
    expect(() => sealPublication(emit('construction', { x: 1 }), 1)).toThrow()
  })

  it('construction accuracy and audience responses score against DIFFERENT artifacts', () => {
    expect(SEALS).toEqual(['construction', 'eligibility'])
    const c = emit('construction', { predictions: { P1: '40%' } })
    const e = emit('eligibility', { eligible: ['P1'] })
    expect(c.hash).not.toBe(e.hash)
    // A revised point set changes eligibility and leaves the prediction untouched.
    const revised = emit('eligibility', { eligible: ['P1', 'P2'] })
    expect(revised.hash).not.toBe(e.hash)
    expect(hashBody(c.body)).toBe(c.hash)
  })
})
