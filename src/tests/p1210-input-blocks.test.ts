/** P1210 DW-16 — founder inputs live in their blocks; zero asks after them. */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES, TARGETS, INPUT_ASK } from '../../scripts/points/input-block-scan.mjs'

describe('P1210 DW-16 — input blocks', () => {
  it('MUST-PASS: the edited files carry every named input in its block, and nothing after', () => {
    const r = run({})
    expect(r.verdict).toBe('PASS')
    expect(r.found.join('\n')).toContain('the event tag')
    expect(r.found.join('\n')).toContain('the filing identity')
    expect(r.found.join('\n')).toContain('the story fan-out approval')
    console.log('[DW-16 must-pass]', r.detail, '\n' + r.found.map(f => '    ' + f).join('\n'))
  })

  it('MUST-FAIL: the event tag moved to a mid-stage ask is FLAGGED with its section', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('FLAG')
    const midStage = r.findings.find(f => f.reason.includes('after the input block'))
    expect(midStage).toBeTruthy()
    expect(midStage!.section).toContain('Stage 1')
    console.log('[DW-16 must-fail]', r.detail)
  })

  it('the clean fixture PASSES, so the control is not a formatter', () => {
    expect(run(FIXTURES.pass).verdict).toBe('PASS')
  })

  it('an APPROVAL gate is not an input ask — §9 weakens none of them', () => {
    expect(INPUT_ASK.test('write only after an explicit founder affirmative')).toBe(false)
    expect(INPUT_ASK.test('halt for founder approval of the set')).toBe(false)
    expect(INPUT_ASK.test('Ask if not supplied; never invent one.')).toBe(true)
    expect(INPUT_ASK.test('ask the founder for the event tag')).toBe(true)
  })

  it('both pipeline files are covered', () => {
    expect(TARGETS.map(t => t.file.split('/').pop())).toEqual(['publish.md', 'run-pipeline.md'])
  })
})
