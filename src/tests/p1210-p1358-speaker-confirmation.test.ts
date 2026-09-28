import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run, RULE_SETS, REPO_ROOT, strippedFixture } from '../../scripts/points/rule-present.mjs'

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
    expect(r.detail).toBe(r.detail) // keep the message in the failure output
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('RESOLVE')
  })

  it('GATE 7d: the REAL positions.md with the old skip sentence restored is REJECTED', () => {
    const r = run(withMutatedPositions(t => `${t}\n\n${BANNED}\n`))
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REJECT')
    expect(r.missing.join('\n')).toMatch(/PRESENT BUT BANNED/)
    // Exactly one finding: the restored sentence, nothing collateral.
    expect(r.missing).toHaveLength(1)
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

  it('restored as a blockquote it is still permitted; restored as an instruction it is not', () => {
    const asQuote = run(withMutatedPositions(t => `${t}\n\n> ${BANNED}\n`))
    expect(asQuote.ok).toBe(true)
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

    it('covers every non-absent positions.md rule', () => {
      expect(required.length).toBeGreaterThanOrEqual(3)
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

  it('an absent-rule that finds nothing reports as satisfied, not as missing', () => {
    const r = run({ ruleSet: SET })
    expect(r.found.join('\n')).toMatch(/absent as required/)
  })
})
