import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { run, runControls, MUTATIONS, EXPECT, FIXTURES } from '../../scripts/points/page-check.mjs'

/**
 * P1367 S1. The Clarity Night page, checked rather than described.
 *
 * Named p1210-* deliberately: `two-callers.mjs` reads only `src/tests/p1210-*.test.ts`.
 *
 * `approved-page.md` is the description of the Clarity Night #2 TEST page as the founder left
 * it on 2026-09-28 (sha256 of the private JSON snapshot it came from is recorded in the spec).
 * The controls MUTATE THAT PAGE, not a synthetic one (epistemic.md gate 7d), and each must be
 * rejected for its own rule, not for any rule.
 */
const approved = readFileSync('src/tests/fixtures/p1367/approved-page.md', 'utf8')
const event1 = readFileSync('src/tests/fixtures/p1367/event1-draft.md', 'utf8')

describe('page-check', () => {
  it('the founder-corrected page passes', () => {
    const r = run({ description: approved })
    expect(r.findings).toEqual([])
    expect(r.verdict).toBe('PASS')
  })

  it.each(Object.keys(MUTATIONS))('rejects the real page with %s, for its own rule', name => {
    const mutated = MUTATIONS[name](approved)
    expect(mutated).not.toBe(approved)
    const r = run({ description: mutated })
    expect(r.ok).toBe(false)
    expect(r.findings.some(f => f.startsWith(EXPECT[name]))).toBe(true)
  })

  it('runControls reports ok on the real page', () => {
    expect(runControls(approved).ok).toBe(true)
  })

  it('is not topic-specific: a draft from event #1 material passes and never mentions this event', () => {
    expect(run({ description: event1 }).ok).toBe(true)
    expect(/ikigai|six/i.test(event1)).toBe(false)
  })

  it('verify-all fixtures: must-pass passes, must-fail fails', () => {
    expect(run(FIXTURES.pass).ok).toBe(true)
    expect(run(FIXTURES.fail).ok).toBe(false)
  })

  it('plain English "a stake in this" is not product vocabulary', () => {
    expect(approved).toMatch(/a stake in this/)
    expect(run({ description: approved }).findings.filter(f => f.startsWith('PRODUCT'))).toEqual([])
  })
})
