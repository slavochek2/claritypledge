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
  // `seconds` is mandatory for a multi-speaker quote since 2026-09-28: without it the
  // confirmation record binds to no timecode and can be copied from another quote.
  seconds: 2073,
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
      // Both names are printed so the founder sees the two readings, and neither is picked.
      expect(r.detail).toMatch(/Step 4c says "The Host"/)
      expect(r.detail).toMatch(/attributes it to "The Guest"/)
    })

    // Found by review 2026-09-28. The first version accepted "agree" / "confirms" /
    // "same" / "match" as 4c verdicts — and a blind 4c agent CANNOT say "agree", because
    // it was never told what to agree with. Those spellings could only come from a record
    // written by something that already knew the answer, which is what 4c excludes.
    it('REFUSES "agree" and its spellings — 4c must NAME the person', () => {
      for (const spelling of ['agree', 'agrees', 'confirm', 'confirms', 'same', 'match', 'yes']) {
        const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, step_4c: spelling } }
        const r = run({ quotes: [q] })
        expect(r.ok, `4c: "${spelling}" must not pass`).toBe(false)
        expect(r.detail).toMatch(/must independently NAME the same person/)
      }
    })

    it('REFUSES a quote that names no person, even with a full record', () => {
      // The measured exploit: `claimed` fell back to an empty string, so the speaker
      // comparison skipped itself and a record naming a DIFFERENT speaker passed, exit 0.
      const { person: _person, ...noPerson } = CONFIRMED_QUOTE
      const r = run({ quotes: [{ ...noPerson, confirmation: { ...CONFIRMED_QUOTE.confirmation, speaker: '', step_4c: 'The Host' } }] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/NO PERSON/)
    })

    it('REFUSES a window that is not a window — "none", "window 1", a bare id', () => {
      for (const w of ['none', 'window 1', 'KyfUysrNaco', '$DIARIZE_STORE/KyfUysrNaco', 'notes.txt']) {
        const q = { ...CONFIRMED_QUOTE, confirmation: { ...CONFIRMED_QUOTE.confirmation, window: w } }
        const r = run({ quotes: [q] })
        expect(r.ok, `window "${w}" must not pass`).toBe(false)
        expect(r.detail).toMatch(/is not a diarization window/)
      }
    })

    it('accepts a real window path shape whose bounds contain the quote', () => {
      for (const [w, seconds] of [
        ['$DIARIZE_STORE/KyfUysrNaco/2040s+300s.json', 2073],
        ['/abs/store/id/0s+900s.json', 412],
      ] as Array<[string, number]>) {
        const q = { ...CONFIRMED_QUOTE, seconds, confirmation: { ...CONFIRMED_QUOTE.confirmation, window: w } }
        expect(run({ quotes: [q] }).ok, `window "${w}" must pass`).toBe(true)
      }
    })

    it('REFUSES a multi-speaker quote with no `seconds` — the record would bind to nothing', () => {
      const { seconds: _s, ...noSeconds } = CONFIRMED_QUOTE
      const r = run({ quotes: [noSeconds] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/no `seconds` on the quote/)
    })

    it('REFUSES a record whose window cannot contain the quote — a copied record', () => {
      const q = { ...CONFIRMED_QUOTE, seconds: 240 }   // window covers 2040–2340
      const r = run({ quotes: [q] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/window covers 2040–2340s/)
    })

    it('REFUSES a window from a different video when the quote names one', () => {
      const q = { ...CONFIRMED_QUOTE, video: 'SOME_OTHER_ID' }
      const r = run({ quotes: [q] })
      expect(r.ok).toBe(false)
      expect(r.detail).toMatch(/names a different video/)
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

    it('the SAME line quoted from both speakers resolves per person, not by first match', () => {
      // Text-only matching made the first confirmed entry answer for the second quote,
      // which was then refused as a person mismatch although it was confirmed.
      const line = 'that is exactly the point'
      const mk = (who: string) => ({
        text: line, person: who, basis: 'turn-verified' as const, seconds: 2100,
        confirmation: { step_4b: "interlocutor's reply", evidence: 'the other party answers back', step_4c: who, window: '$DIARIZE_STORE/KyfUysrNaco/2040s+300s.json', speaker: who },
      })
      const r = run({
        quotes: [mk('The Host'), mk('The Guest')],
        confirmed: [{ text: line, person: 'The Host' }, { text: line, person: 'The Guest' }],
      })
      expect(r.ok).toBe(true)
    })

    it('still refuses when the page attributes it to someone with no confirmed entry', () => {
      const line = 'that is exactly the point'
      const r = run({
        quotes: [{
          text: line, person: 'The Guest', basis: 'turn-verified', seconds: 120,
          confirmation: { step_4b: "interlocutor's reply", evidence: 'reply', step_4c: 'The Guest', window: '$DIARIZE_STORE/x/0s+300s.json', speaker: 'The Guest' },
        }],
        confirmed: [{ text: line, person: 'The Host' }],
      })
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

  it('THE REVIEW EXPLOIT: a self-asserted single-speaker basis cannot skip the run file', () => {
    // Executed 2026-09-28: the real incident quote passed with exit 0 and the summary
    // claimed it appeared in the confirmed list, because `basis: "single-speaker"` jumped
    // past the cross-check. One word in the page's own JSON was the whole evasion.
    const r = run({
      quotes: [{ text: 'we sacrifice happiness in order to be successful', person: 'The Guest', basis: 'single-speaker', seconds: 2053 }],
      confirmed: [{ text: 'we sacrifice happiness in order to be successful', person: 'The Host', basis: 'turn-verified' }],
    })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/One of the two is wrong about a real person/)
  })

  it('a page may not relabel a multi-speaker source as single-speaker', () => {
    const r = run({
      quotes: [{ text: 'a line the run file recorded as diarized', person: 'The Guest', basis: 'single-speaker', seconds: 100 }],
      confirmed: [{ text: 'a line the run file recorded as diarized', person: 'The Guest', basis: 'speaker-labelled' }],
    })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/may not relabel a source's shape/)
  })

  it('the verdict distinguishes a run-file check from a self-attested one', () => {
    const selfAttested = run({ quotes: [CONFIRMED_QUOTE] })
    expect(selfAttested.ok).toBe(true)
    expect(selfAttested.verdict).toBe('CONFIRMED-SELF-ATTESTED')
    expect(selfAttested.detail).toMatch(/checked only against THEMSELVES/)

    const checked = run({ quotes: [CONFIRMED_QUOTE], confirmed: [{ text: CONFIRMED_QUOTE.text, person: 'The Guest', basis: 'speaker-labelled' }] })
    expect(checked.verdict).toBe('CONFIRMED')
    expect(checked.detail).toMatch(/matched against the run file/)
  })

  it('a page of only single-speaker quotes is CONFIRMED, not self-attested', () => {
    const r = run({ quotes: [{ text: 'one voice', person: 'A Solo Speaker', basis: 'single-speaker' }] })
    expect(r.verdict).toBe('CONFIRMED')
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
