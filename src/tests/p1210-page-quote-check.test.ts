import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/page-quote-check.mjs'

/**
 * P1358 R1c. The predicate that refuses a page quote with no confirmation record.
 *
 * Named p1210-* deliberately: `two-callers.mjs` reads only `src/tests/p1210-*.test.ts`
 * when asking whether a predicate has a test caller, so a differently-named file would
 * leave this module reported as wired-by-nothing.
 */

const CONFIRMED_QUOTE = {
  text: 'I think the trade-off people describe is mostly imaginary',
  person: 'The Guest',
  basis: 'speaker-labelled',
  confirmation: {
    step_4b: "interlocutor's reply",
    evidence: 'Host: "so you would say the trade-off is imaginary?"',
    step_4c: 'The Guest',
    window: '$DIARIZE_STORE/KyfUysrNaco/2040s+300s.json',
    speaker: 'The Guest',
  },
}

describe('page-quote-check: no page quotes a speaker the pipeline has not confirmed', () => {
  it('must-pass fixture is CONFIRMED', () => {
    const r = run(FIXTURES.pass)
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('CONFIRMED')
  })

  it('THE ACTUAL FAILURE: a diarized quote with no record is REFUSED', () => {
    const r = run(FIXTURES.fail)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/NO CONFIRMATION RECORD/)
  })

  it('a single-speaker quote passes with no record — that shape never needed one', () => {
    const r = run({ quotes: [{ text: 'one voice, one speaker', person: 'A Solo Speaker', basis: 'single-speaker' }] })
    expect(r.ok).toBe(true)
  })

  it('a MISSING basis is not read as single-speaker', () => {
    // How the measured failure travelled: nobody ever asserted the source had one voice.
    const r = run({ quotes: [{ text: 'we sacrifice happiness in order to be successful', person: 'The Guest' }] })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/NO BASIS/)
  })

  it('turn-inferred may never reach a page', () => {
    const r = run({ quotes: [{ ...CONFIRMED_QUOTE, basis: 'turn-inferred' }] })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/turn-inferred/)
  })

  it('an unknown basis string is refused rather than ignored', () => {
    const r = run({ quotes: [{ ...CONFIRMED_QUOTE, basis: 'diarized' }] })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/UNKNOWN BASIS/)
  })

  describe('the record must be a record, not the word "checked"', () => {
    it('refuses a 4b verdict with no confirming text', () => {
      const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, evidence: '' } }
      const r = run({ quotes: [q] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/names no confirming TEXT/)
    })

    it('refuses a missing 4b verdict', () => {
      const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, step_4b: '' } }
      expect(run({ quotes: [q] }).ok).toBe(false)
    })

    it('refuses a missing 4c verdict — 4b alone is the extractor grading itself', () => {
      const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, step_4c: '' } }
      const r = run({ quotes: [q] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/no Step 4c verdict/)
    })

    it('refuses 4c UNRESOLVED', () => {
      const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, step_4c: 'UNRESOLVED' } }
      const r = run({ quotes: [q] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/UNRESOLVED/)
    })

    it('refuses a 4b/4c DISAGREEMENT and never adjudicates it', () => {
      const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, step_4c: 'The Host' } }
      const r = run({ quotes: [q] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/disagree/)
    })

    it('accepts "agree" as a 4c verdict spelling', () => {
      const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, step_4c: 'agree' } }
      expect(run({ quotes: [q] }).ok).toBe(true)
    })

    it('refuses a record with no diarization window — labels are not stable across windows', () => {
      const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, window: '' } }
      const r = run({ quotes: [q] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/no diarization window/)
    })
  })

  describe('against the run file\'s confirmed list, when one exists', () => {
    it('refuses a page quote absent from the confirmed list', () => {
      const r = run({ quotes: [CONFIRMED_QUOTE], confirmed: [{ text: 'an entirely different sentence', person: 'The Guest' }] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/not in the run file's confirmed list/)
    })

    it('refuses a page quote attributed to a different person than the confirmed list', () => {
      const r = run({ quotes: [CONFIRMED_QUOTE], confirmed: [{ text: CONFIRMED_QUOTE.text, person: 'The Host' }] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/One of the two is wrong about a real person/)
    })

    it('passes when the text and person both match, ignoring whitespace and case', () => {
      const r = run({
        quotes: [CONFIRMED_QUOTE],
        confirmed: [{ text: `  I THINK the trade-off   people describe is mostly imaginary `, person: 'the guest' }],
      })
      expect(r.ok).toBe(true)
    })
  })

  // GATE 7c — the workflows that already exist must still pass this gate.
  it('7c: a page that quotes nobody is NO-QUOTES, not a refusal', () => {
    const r = run({ quotes: [] })
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('NO-QUOTES')
  })

  it('7c: a page with only single-speaker quotes needs no run file at all', () => {
    const r = run({ quotes: [1, 2, 3].map(n => ({ text: `sentence ${n}`, person: `Speaker ${n}`, basis: 'single-speaker' })) })
    expect(r.ok).toBe(true)
  })

  it('7c: several confirmed multi-speaker quotes pass together', () => {
    const r = run({ quotes: [CONFIRMED_QUOTE, { ...CONFIRMED_QUOTE, text: 'a second confirmed line', basis: 'turn-verified' }] })
    expect(r.ok).toBe(true)
  })

  it('refuses when no quote list was supplied at all — silence is not a clean page', () => {
    const r = run({})
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/no page-quote list supplied/)
  })

  it('a blank quote string is refused', () => {
    expect(run({ quotes: [{ text: '   ', basis: 'single-speaker' }] }).ok).toBe(false)
  })

  it('one bad quote refuses the whole list, and every quote is reported', () => {
    const r = run({ quotes: [CONFIRMED_QUOTE, { text: 'unconfirmed line', person: 'The Guest', basis: 'speaker-labelled' }] })
    expect(r.ok).toBe(false)
    expect(r.offenders).toHaveLength(1)
    expect(r.detail).toMatch(/2 page quote\(s\)/)
    expect(r.detail).toMatch(/ok — speaker-labelled/)   // the good one is still printed
  })
})
