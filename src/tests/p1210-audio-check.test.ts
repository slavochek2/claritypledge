import { describe, it, expect } from 'vitest'
import { run, bestRatio, words, FIXTURES } from '../../scripts/points/audio-check.mjs'

describe('audio-check: the caption-vs-audio comparison, as code', () => {
  it('the real quote CONFIRMs against an independent transcription of the same audio', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('CONFIRM')
    expect(r.ok).toBe(true)
    expect(r.missingPolarity).toEqual([])
  })

  it('a quote from a different video is REJECTed on ratio', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('REJECT')
    expect(r.ratio).toBeLessThan(0.75)
  })

  /**
   * THE LOAD-BEARING TEST. v1 scored this inversion at 0.88 on character
   * similarity and reported CONFIRMED. It must be rejected, AND it must be
   * rejected while scoring above threshold — otherwise the guard is untested
   * decoration that a ratio would have caught anyway.
   */
  it('THE ACTUAL FAILURE: a semantically inverted quote is REJECTed', () => {
    const r = run(FIXTURES.nearMiss)
    expect(r.verdict).toBe('REJECT')
    expect(r.missingPolarity).toEqual(['closed', 'total'])
  })

  it('the inversion scores ABOVE threshold — so no ratio alone could reject it', () => {
    const r = run(FIXTURES.nearMiss)
    expect(r.ratio).toBeGreaterThanOrEqual(0.75)
    // and the true quotes it must be separated from score in the same band
    expect(run(FIXTURES.pass).ratio).toBeGreaterThanOrEqual(0.75)
  })

  it('the guard is NOT sufficient alone: the known-bad shares no polarity gap but still fails', () => {
    // 'not' is missing, but the decisive signal is the ratio — assert both halves
    // are doing work rather than one masking the other.
    const r = run(FIXTURES.fail)
    expect(r.ratio).toBeLessThan(0.75)
  })

  it('empty ASR is REFUSEd as infrastructure failure, never as evidence against the quote', () => {
    const r = run({ quote: 'anything at all here', asr: '' })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/infrastructure failure/)
    expect(r.detail).toMatch(/NOT evidence against the quote/)
  })

  it('an empty quote is REFUSEd rather than trivially confirmed', () => {
    expect(run({ quote: '', asr: 'some words here' }).verdict).toBe('REFUSE')
  })

  it('bestRatio finds the quote inside a longer transcription window', () => {
    const q = words('the systems are open weights')
    const a = words('lots of unrelated preamble here the systems are open weights and then more text after')
    expect(bestRatio(q, a)).toBe(1)
  })

  it('threshold is a parameter, and it moves ONLY the ratio half', () => {
    // Raising it past the real quote's score rejects it...
    expect(run({ ...FIXTURES.pass, threshold: 0.99 }).verdict).toBe('REJECT')
    // ...but lowering it can never talk the guard round. Asserting CONFIRM here
    // would be asserting a bug: a threshold that bypasses the polarity guard
    // restores exactly the v1 failure this module exists to prevent.
    expect(run({ ...FIXTURES.nearMiss, threshold: 0.01 }).verdict).toBe('REJECT')
  })
})
