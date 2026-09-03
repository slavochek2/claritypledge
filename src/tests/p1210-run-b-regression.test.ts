/**
 * P1210 DW-4 — the run-B regression reproduces the PINNED expectation.
 *
 * The five verdicts, the two counts and P3's AMBIGUOUS-PAIR were derived by hand
 * at /goalify time from the real run file under RD-6's tie-break and written into
 * the spec. THE CHECKER IS WRONG IF IT DISAGREES, until the derivation is shown
 * to be — these numbers are not recomputed from whatever the fixture yields.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { loadFixture, scoreRun, canonicalPair, strengthKey, formatScore, STRENGTH_RANK } from '../../scripts/points/run-scoring.mjs'

const FIXTURE = path.resolve(__dirname, 'fixtures/p1210/run-b-redacted.md')
const pairOf = (p: { pair: string[] | null }) => (p.pair ? [...p.pair].sort().join(',') : null)

describe('P1210 DW-4 — run-B regression against the pinned expectation', () => {
  const score = scoreRun(loadFixture(FIXTURE))

  it('2 of 3 written contradiction sentences are unspanned by the cast', () => {
    expect(score.sentences).toBe(3)
    expect(score.unspanned).toHaveLength(2)
    expect(score.unspanned.sort()).toEqual(['b', 'c'])
  })

  it('reproduces the five pinned canonical pairs, including P3 = AMBIGUOUS-PAIR', () => {
    const by = Object.fromEntries(score.points.map(p => [p.id, p]))
    expect(pairOf(by.P1)).toBe('A2,A4')
    expect(pairOf(by.P2)).toBe('A1,A4')
    expect(by.P3.verdict).toBe('AMBIGUOUS-PAIR')
    expect(pairOf(by.P4)).toBe('A2,A3')
    expect(pairOf(by.P5)).toBe('A1,A2')
  })

  it('P1, P2 and P4 sit on pairs carrying no written contradiction; P5 on sentence (a); P3 unscoreable', () => {
    expect(score.noWrittenContradiction.sort()).toEqual(['P1', 'P2', 'P4'])
    const p5 = score.points.find(p => p.id === 'P5')!
    expect(p5.pairSentence).toBe('a')
    expect(score.unscoreable).toEqual(['P3'])
  })

  it('4 of 5 points trace to no sentence, counted from the fixture\'s own declared field', () => {
    expect(score.points).toHaveLength(5)
    expect(score.untraced.sort()).toEqual(['P1', 'P2', 'P4', 'P5'])
  })

  it('RD-6 tie-break is a TOTAL order: close > derived > stretch, sorted descending', () => {
    expect(STRENGTH_RANK.close).toBeGreaterThan(STRENGTH_RANK.derived)
    expect(STRENGTH_RANK.derived).toBeGreaterThan(STRENGTH_RANK.stretch)
    expect(strengthKey({ strength: 'derived' }, { strength: 'close' })).toEqual([3, 2])
    // P3's two max-difference pairs both score [close, derived], which is why it is ambiguous.
    expect(strengthKey({ strength: 'close' }, { strength: 'derived' }))
      .toEqual(strengthKey({ strength: 'derived' }, { strength: 'close' }))
  })

  it('MUST-FAIL control: a constructed tie is reported AMBIGUOUS-PAIR, never resolved by picking one', () => {
    const tie = canonicalPair({
      id: 'P-tie',
      positions: [
        { arguer: 'A1', value: 3, strength: 'close' },
        { arguer: 'A2', value: -1, strength: 'derived' },
        { arguer: 'A3', value: -1, strength: 'derived' },
      ],
    })
    expect(tie.verdict).toBe('AMBIGUOUS-PAIR')
    expect(tie.pair).toBeNull()
    expect(tie.candidates).toHaveLength(2)
  })

  it('a pair is DERIVED even when the two agree — "no opposed pair" is a RESULT, not an absence', () => {
    const agreeing = canonicalPair({
      id: 'P-agree',
      positions: [
        { arguer: 'A1', value: 3, strength: 'close' },
        { arguer: 'A2', value: 2, strength: 'derived' },
      ],
    })
    expect(agreeing.verdict).toBe('PAIR')
    expect(agreeing.pair).toEqual(['A1', 'A2'])
  })

  it('fewer than two positioned arguers is UNPAIRABLE', () => {
    expect(canonicalPair({ id: 'P-lonely', positions: [{ arguer: 'A1', value: 3, strength: 'close' }] }).verdict)
      .toBe('UNPAIRABLE')
  })

  it('prints the scored run', () => {
    const printed = formatScore(score)
    expect(printed).toContain('AMBIGUOUS-PAIR')
    console.log('[DW-4 run-B score]\n' + printed)
  })
})
