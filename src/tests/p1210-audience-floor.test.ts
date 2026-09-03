/** P1210 DW-15 — re-assert against the recorded floor; ask only below it. */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { run, FIXTURES } from '../../scripts/points/audience-floor.mjs'
import { loadFixture } from '../../scripts/points/run-scoring.mjs'

const FIXTURE = path.resolve(__dirname, 'fixtures/p1210/run-b-redacted.md')

describe('P1210 DW-15 — audience floor', () => {
  it('MUST-PASS: a source above the recorded floor returns NO-ASK', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('NO-ASK')
    expect(r.detail).toContain('Do not re-ask')
    console.log('[DW-15 must-pass]', r.detail)
  })

  it('MUST-FAIL: a source below the floor returns ASK, naming which metric failed', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('ASK')
    expect(r.failed.join(' ')).toContain('views')
    expect(r.failed.join(' ')).toContain('comments')
    console.log('[DW-15 must-fail]', r.detail)
  })

  it('one metric failing is enough, and only that metric is named', () => {
    const r = run({ floor: { minViews: 2000, minComments: 50 }, source: { id: 'thin-comments', views: 90000, comments: 4 } })
    expect(r.verdict).toBe('ASK')
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0]).toContain('comments')
  })

  it('the floor is READ FROM THE RUN FILE, not hardcoded here', () => {
    const { floor } = loadFixture(FIXTURE)
    expect(floor).toEqual({ minViews: 2000, minComments: 50 })
    expect(run({ floor, source: { id: 'from-run-file', views: 164239, comments: 595 } }).verdict).toBe('NO-ASK')
  })

  it('an unrecorded metric is NOT a pass — "never measured" and "cleared" are different states', () => {
    const r = run({ floor: { minViews: 2000, minComments: 50 }, source: { id: 'unmeasured', views: null, comments: null } })
    expect(r.verdict).toBe('ASK')
    expect(r.detail).toContain('unrecorded')
  })

  it('an explicit founder override recorded in the run file is honoured', () => {
    const r = run({ floor: { minViews: 2000, minComments: 50 }, source: { id: 'seeded', views: null, comments: null, override: 'founder-seeded, recorded at Gate 2' } })
    expect(r.verdict).toBe('NO-ASK')
  })
})
