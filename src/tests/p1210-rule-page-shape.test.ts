/**
 * P1367 — the Clarity Night page-shape rules, present at their named locations.
 *
 * SCOPE: presence, not obedience (P1210 §12). Obedience on the page is page-check.mjs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run, strippedFixture, RULE_SETS } from '../../scripts/points/rule-present.mjs'

const SET = 'page-shape'
const SKILL = '.claude/commands/slava/disagreement/clarity-night-publish.md'

describe('P1367 — ' + SET + ' rules present', () => {
  it('MUST-PASS: the real files RESOLVE every rule in the set', () => {
    const r = run({ ruleSet: SET })
    expect(r.missing).toEqual([])
    expect(r.found.length).toBe(Object.values(RULE_SETS[SET].locations).flat().length)
  })

  it('MUST-FAIL: the fixture with the /meet rule deleted is REJECTED', () => {
    const r = run(strippedFixture(SET))
    expect(r.verdict).toBe('REJECT')
    expect(r.missing.join()).toMatch(/linked once, plain/)
  })

  it.each([
    ['the seven-section list', 'These seven, in this order, and nothing else:'],
    ['the unlinked-/meet rule', 'once in the agenda with its one-line meaning and **never linked** (`/meet` stays unlinked).'],
  ])('MUST-FAIL: the real skill with %s restored is REJECTED', (_label, line) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p1367-'))
    const f = path.join(dir, 'clarity-night-publish.md')
    writeFileSync(f, readFileSync(SKILL, 'utf8') + '\n' + line + '\n')
    const r = run({ ruleSet: SET, files: { [SKILL]: f } })
    expect(r.verdict).toBe('REJECT')
    expect(r.missing.join()).toMatch(/PRESENT BUT BANNED/)
  })
})
