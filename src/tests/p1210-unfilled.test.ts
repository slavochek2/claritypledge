/** P1210 DW-5 — derive the unfilled count from the cast entries, never from the field. */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { run, FIXTURES } from '../../scripts/points/unfilled.mjs'
import { loadFixture } from '../../scripts/points/run-scoring.mjs'

const FIXTURE = path.resolve(__dirname, 'fixtures/p1210/run-b-redacted.md')

describe('P1210 DW-5 — unfilled positions', () => {
  it('on the real run-B fixture the two DISAGREE and the assert fires', () => {
    const data = loadFixture(FIXTURE)
    expect(data.unfilledField).toBe(0)
    expect(data.cast.filter(c => c.status === 'UNFILLED')).toHaveLength(1)
    const r = run({ file: FIXTURE })
    expect(r.verdict).toBe('DISAGREE')
    expect(r.derived).toBe(1)
    expect(r.declared).toBe(0)
    expect(r.detail).toContain('position 3')
    console.log('[DW-5 run B]', r.detail)
  })

  it('MUST-PASS: an agreeing fixture does NOT fire the assert', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('AGREE')
    expect(r.ok).toBe(true)
    console.log('[DW-5 must-pass]', r.detail)
  })

  it('MUST-FAIL: the disagreeing fixture fires', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('DISAGREE')
    console.log('[DW-5 must-fail]', r.detail)
  })

  it('the count comes from the cast entries, so a lying field cannot silence it', () => {
    const lying = { run: { cast: [{ position: 3, code: null, status: 'UNFILLED' }], unfilledField: 99 } }
    expect(run(lying).verdict).toBe('DISAGREE')
  })
})
