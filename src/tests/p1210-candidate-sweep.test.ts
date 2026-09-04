/**
 * Candidate fields are filtered by MEASURED METADATA, never by title.
 *
 * Incident this pins (2026-09-04, run `ai-power-remedies-c`): the selector
 * reported a position unfillable and swapped out the founder's approved arguer,
 * on the strength of a title scan. The qualifying source — 785,823 views, 8,700
 * comments, inside the recency window — had already been returned by the search
 * and was dropped unread because its title said "AI Expert" instead of a name.
 */
import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/candidate-sweep.mjs'

describe('candidate-sweep — exclusions must be measured, not eyeballed', () => {
  it('MUST-PASS: every candidate measured; the qualifying source is admitted', () => {
    const r = run(FIXTURES.pass)
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('FIELD-NON-EMPTY')
    expect(r.admitted).toContain('1oS35oWWl28')
    console.log('[candidate-sweep must-pass]', r.detail)
  })

  it('MUST-FAIL: a candidate set aside on its title, never measured, is REFUSED and named', () => {
    const r = run(FIXTURES.fail)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REFUSE')
    expect(r.unmeasured).toEqual(['1oS35oWWl28'])
    expect(r.detail).toContain('ALREADY MARKED EXCLUDED')
    expect(r.detail).toContain('a title is not a metric')
    console.log('[candidate-sweep must-fail]', r.detail)
  })

  it('an empty sweep cannot report a field as exhausted', () => {
    const r = run({ floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127', searched: [], candidates: [] })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toContain('examined nothing')
  })

  it('THE ACTUAL INCIDENT: an id the search returned that never reached the file is REFUSED', () => {
    const r = run(FIXTURES.omitted)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REFUSE')
    expect(r.dropped).toEqual(['1oS35oWWl28'])
    // before this closure the same input returned ok:true / FIELD-EMPTY —
    // "Every candidate was measured" over a hand-trimmed list
    expect(r.detail).toContain('never reached the candidate set')
    console.log('[candidate-sweep omission]', r.detail)
  })

  it('no searched list at all is REFUSE — the sweep cannot vouch for coverage it never saw', () => {
    const r = run({
      floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127',
      candidates: [{ id: 'x', upload_date: '20260101', view_count: 5000, comment_count: 99 }],
    })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toContain('no `searched` list')
  })

  it('a measured field with zero survivors is FIELD-EMPTY, which is a finding — not a REFUSE', () => {
    const r = run({
      floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127', searched: ['x'],
      candidates: [{ id: 'x', title: 't', upload_date: '20230101', view_count: 10, comment_count: 1 }],
    })
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('FIELD-EMPTY')
    expect(r.detail).toContain('Every candidate was measured')
  })

  it('a zero metric is a measurement; only null/absent is unmeasured', () => {
    const r = run({
      floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127', searched: ['z'],
      candidates: [{ id: 'z', upload_date: '20260101', view_count: 0, comment_count: 0 }],
    })
    expect(r.verdict).toBe('FIELD-EMPTY')
    expect(r.unmeasured ?? []).toHaveLength(0)
  })
})

describe('candidate-sweep: a crash is not a verdict (found 2026-09-04, first real use)', () => {
  const body = {
    searched: ['aaa111'],
    candidates: [{ id: 'aaa111', upload_date: '20260304', view_count: 785823, comment_count: 8700 }],
  }

  it('the shape select.md documented — no floors — REFUSES instead of throwing', () => {
    // select.md said `{searched:[...], candidates:[...]}`. That input dereferenced
    // floor.minViews and threw a TypeError. Every fixture supplied `floor`, so
    // verify-all stayed green over an invocation the docs made impossible.
    expect(() => run(body as never)).not.toThrow()
    const r = run(body as never)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/no measurement standard/i)
  })

  it('names BOTH missing halves, so the caller knows what to supply', () => {
    const r = run(body as never)
    expect(r.detail).toContain('floor {minViews, minComments}')
    expect(r.detail).toContain('recencyFloor')
  })

  it('a floor present but non-numeric is refused too, not silently coerced', () => {
    const r = run({ ...body, floor: { minViews: '2000', minComments: 50 }, recencyFloor: '20251127' } as never)
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/floor \{minViews, minComments\}/)
  })

  it('with both floors supplied the same body still classifies normally', () => {
    const r = run({ ...body, floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127' } as never)
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('FIELD-NON-EMPTY')
  })
})
