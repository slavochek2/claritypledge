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

describe('page-check: review findings of 2026-09-28, each pinned', () => {
  it('a long sentence hand-wrapped across two lines is still one sentence', () => {
    const d = approved.replace('## Agenda', 'This sentence is deliberately long and wrapped across two source lines so that\nthe checker sees two short halves and never counts the full thirty words it has.\n\n## Agenda')
    expect(run({ description: d }).findings.some(f => f.startsWith('SENTENCE'))).toBe(true)
  })
  it('a ### subheading inside a section is not a sixth section', () => {
    expect(run({ description: approved.replace('3. Conversations', '### Round 1\n\n3. Conversations') }).ok).toBe(true)
  })
  it('a clock time or room number with 8 is not round mechanics; "under 8" is', () => {
    expect(run({ description: approved.replace('## Agenda', 'Doors open at 8:30 in Room 8.\n\n## Agenda') }).ok).toBe(true)
    expect(run({ description: approved.replace('## Agenda', 'Nobody disagrees while a score is under 8.\n\n## Agenda') }).ok).toBe(false)
  })
  it('a /meet link with a query string still counts as the one /meet link', () => {
    expect(run({ description: approved.replace('claritypledge.com/meet)', 'claritypledge.com/meet?utm_source=email)') }).ok).toBe(true)
  })
  it('a namesake in Sources is not a duplicate of a listed person', () => {
    expect(run({ description: approved.replace('3. *[Ken Mogi', '4. *[Mel Brooks on comedy, 2026](https://example.com/y)*\n3. *[Ken Mogi') }).ok).toBe(true)
  })
})
