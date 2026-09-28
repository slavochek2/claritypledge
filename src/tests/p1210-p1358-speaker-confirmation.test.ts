import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run, RULE_SETS, REPO_ROOT, strippedFixture, instructionView } from '../../scripts/points/rule-present.mjs'

/**
 * P1358 R1a. The rule that a `speaker-labelled` quote is NOT exempt from per-quote
 * speaker confirmation — and the control that proves the row can fail.
 *
 * Why the control is built by MUTATING THE REAL FILE (epistemic.md gate 7d): a
 * synthetic fixture containing no examples proves nothing about a check that greps a
 * file which quotes its own history. positions.md deliberately records the withdrawn
 * sentence inside a blockquote, so the banned pattern must catch the sentence as an
 * INSTRUCTION and ignore it as a QUOTATION. Only a mutation of the real bytes tests
 * that distinction.
 */

const SET = 'speaker-confirmation'
const POSITIONS = '.claude/commands/slava/disagreement/positions.md'
const BANNED = 'Skip entirely for `single-speaker` and `speaker-labelled` sources. For every quote from a `turn-verified` source, do this **per quote** and record the result.'

const realPositions = () => readFileSync(path.join(REPO_ROOT, POSITIONS), 'utf8')

/** Write a mutated copy of the real positions.md and point the rule set at it. */
function withMutatedPositions(mutate: (text: string) => string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'p1358-'))
  const file = path.join(dir, 'positions.md')
  writeFileSync(file, mutate(realPositions()))
  return { ruleSet: SET, files: { [POSITIONS]: file } }
}

describe('P1358 R1a: the speaker-labelled exemption is withdrawn and cannot come back', () => {
  it('the real files RESOLVE — all eight rules present', () => {
    const r = run({ ruleSet: SET })
    expect(r.verdict, r.detail).toBe('RESOLVE')   // detail is the failure message, not an assert
    expect(r.ok).toBe(true)
  })

  it('GATE 7d: the REAL positions.md with the old skip sentence restored is REJECTED', () => {
    const r = run(withMutatedPositions(t => `${t}\n\n${BANNED}\n`))
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REJECT')
    expect(r.missing.join('\n')).toMatch(/PRESENT BUT BANNED/)
    // Two findings, both about the restored sentence and nothing collateral: the verbatim
    // ban and the semantic one (the exemption is banned in any wording) each fire.
    expect(r.missing).toHaveLength(2)
    for (const m of r.missing) expect(m).toMatch(/PRESENT BUT BANNED/)
    expect(r.missing.join('\n')).toMatch(/in any wording/)
  })

  it('the file\'s own blockquoted record of the withdrawn sentence does NOT trip the rule', () => {
    // The distinction the whole row rests on. If this ever fails, the pattern has
    // stopped telling an instruction from the history of one, and the honest fix is
    // NOT to delete the history — positions.md explains why the exemption existed.
    const text = realPositions()
    expect(text).toMatch(/This sentence used to read/)
    expect(text).toMatch(/Skip entirely for/)              // the quotation is present…
    expect(run({ ruleSet: SET }).ok).toBe(true)             // …and the rule still passes
  })

  // INVERTED 2026-09-28 after review. This test used to assert that the sentence inside a
  // blockquote was PERMITTED — it codified a hole. positions.md writes BINDING procedure in
  // blockquotes (the 4c deadline steps, the 4c subagent prompt), so a `>` block is the exact
  // shape a future author would use to add an exception in this file's own normative style.
  // Exemption is now by explicit historical marker, not by formatting.
  it('REJECTS the exemption written as a blockquote — this file makes instructions in blockquotes', () => {
    const asHouseStyle = run(withMutatedPositions(t =>
      `${t}\n\n> **Exception, added later.** ${BANNED}\n> A diarization already names the speaker.\n`))
    expect(asHouseStyle.ok).toBe(false)
    const asInstruction = run(withMutatedPositions(t => `${t}\n\n${BANNED}\n`))
    expect(asInstruction.ok).toBe(false)
  })

  it('the must-fail fixture on disk REJECTS, and for the banned sentence', () => {
    const r = run(strippedFixture(SET))
    expect(r.ok).toBe(false)
    expect(r.missing.join('\n')).toMatch(/PRESENT BUT BANNED/)
  })

  describe('each required sentence is load-bearing — removing it REJECTS', () => {
    const required = RULE_SETS[SET].locations[POSITIONS]
      .filter(([, , opts]: any[]) => !opts?.absent)

    it('covers exactly the positions.md rules this suite knows about', () => {
      // A floor (>= 3) stays green when one row is deleted and another added; the labels
      // are the requirement. Update this list deliberately when a rule is added.
      expect((required as Array<[string, RegExp]>).map(([label]) => label)).toEqual([
        'Step 4b covers every multi-speaker source, diarized included',
        'Step 4c receives diarized turns with the labels stripped',
        'only turns from a window that passed Step 2c may be used',
      ])
    })

    for (const [label, re] of required as Array<[string, RegExp]>) {
      it(`REJECTS when "${label}" is deleted from the real file`, () => {
        const r = run(withMutatedPositions(t =>
          t.split('\n').filter(l => !re.test(l)).join('\n')))
        expect(r.ok).toBe(false)
        expect(r.missing.join('\n')).toMatch(/MISSING/)
      })
    }
  })

  // Both demonstrated by review 2026-09-28 against the first, line-anchored pattern:
  // an indented blockquote false-positived, and a wrapped re-introduction evaded the ban.
  describe('the ban survives reformatting, and never fires on a quotation', () => {
    it('REJECTS the sentence re-introduced WRAPPED ACROSS TWO LINES', () => {
      const wrapped = 'Skip entirely for `single-speaker`\nand `speaker-labelled` sources.'
      const r = run(withMutatedPositions(t => `${t}\n\n${wrapped}\n`))
      expect(r.ok).toBe(false)
      expect(r.missing.join('\n')).toMatch(/PRESENT BUT BANNED/)
    })

    it('REJECTS it as a list item and with odd spacing', () => {
      for (const form of [
        '- Skip entirely for `single-speaker` and `speaker-labelled` sources.',
        '1. Skip entirely for single-speaker and speaker-labelled sources.',
        '   Skip entirely for   `single-speaker`   and   `speaker-labelled`   sources.',
        '**Skip entirely for `single-speaker` and `speaker-labelled` sources.**',
      ]) {
        const r = run(withMutatedPositions(t => `${t}\n\n${form}\n`))
        expect(r.ok, `form must be caught: ${form}`).toBe(false)
      }
    })

    it('REJECTS it at any blockquote depth or indentation — formatting is not an exemption', () => {
      for (const form of [` > ${BANNED}`, `   > ${BANNED}`, `> > ${BANNED}`, `\t${BANNED}`]) {
        const r = run(withMutatedPositions(t => `${t}\n\n${form}\n`))
        expect(r.ok, `must be caught: ${JSON.stringify(form)}`).toBe(false)
      }
    })

    it('REJECTS equivalent rewordings — the EXEMPTION is banned, not one sentence', () => {
      // All four passed the verbatim-only ban when review tried them.
      for (const form of [
        'Skip for `single-speaker` and `speaker-labelled` sources.',
        'A `speaker-labelled` source is EXEMPT from Steps 4b and 4c; do not run them.',
        'Skip entirely for `speaker-labelled` and `single-speaker` sources.',
        'A `speaker-labelled` source needs no 4c; the diarization adds nothing.',
      ]) {
        const r = run(withMutatedPositions(t => `${t}\n\n${form}\n`))
        expect(r.ok, `reworded exemption must be caught: ${form}`).toBe(false)
      }
    })

    it('REJECTS a new exemption dressed as history — the record gets ONE mention', () => {
      const r = run(withMutatedPositions(t =>
        `${t}\n\nThis rule was withdrawn: ${BANNED}\n`))
      expect(r.ok).toBe(false)
      expect(r.missing.join('\n')).toMatch(/QUOTED \d+ TIMES|PRESENT BUT BANNED/)
    })

    it('does not fire on a blockquote that wraps the sentence across quoted lines', () => {
      const quoted = '> **It used to read** *"Skip entirely for `single-speaker`\n> and `speaker-labelled` sources"*, and that is withdrawn.'
      const r = run(withMutatedPositions(t => `${t}\n\n${quoted}\n`))
      expect(r.ok).toBe(true)
    })
  })

  it('an absent-rule that finds nothing reports as satisfied, not as missing', () => {
    const r = run({ ruleSet: SET })
    expect(r.found.join('\n')).toMatch(/absent as required/)
  })

  describe('instructionView — the mechanism, tested directly', () => {
    it('KEEPS blockquotes (they carry binding procedure here) and drops only marked history', () => {
      const v = instructionView([
        'plain line',
        '> a blockquote that instructs',
        'this sentence used to read something else',
        '   > an indented blockquote that instructs',
        'second   plain',
      ].join('\n'))
      expect(v).toMatch(/plain line/)
      expect(v).toMatch(/a blockquote that instructs/)          // kept
      expect(v).toMatch(/an indented blockquote that instructs/) // kept
      expect(v).toMatch(/second plain/)
      expect(v).not.toMatch(/something else/)                    // dropped: "used to read"
    })

    it('joins wrapped prose so a sentence split across lines is still one sentence', () => {
      expect(instructionView('Skip entirely for\nspeaker-labelled sources')).toBe('Skip entirely for speaker-labelled sources')
    })
  })
})
