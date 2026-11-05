import { describe, it, expect } from 'vitest'
import { quotaHistory, type DayReport } from '../../src/lib/day'
import { projectQuota } from '../../src/components/day/quota'

/** P1629: a reading belongs to the current window when it carries the same resets_at. */

const RESET = '2026-11-11T03:00:00Z'
const run = (started: string, remaining: number, resets = RESET) =>
  ({
    pass_id: `${started}-1`,
    started_at: started,
    monitoring: { quotas: [{ id: 'claude', label: 'Claude', collected: true, remaining_pct: remaining, resets_at: resets }] },
  }) as unknown as DayReport

describe('P1629 subscription projection', () => {
  const today = run('2026-11-05T06:12:06Z', 82)

  it('a reading 41 minutes before resets_at - 7 days, with the same resets_at, draws a projection', () => {
    const h = quotaHistory(today, [run('2026-11-04T02:19:41Z', 100)]).claude
    expect(h.map((p) => p.remaining_pct)).toEqual([100, 82])
    const points = h.map((p) => ({ t: Date.parse(p.at), v: p.remaining_pct }))
    expect(projectQuota({ id: 'claude', label: 'Claude', resetsAt: Date.parse(RESET), points })).not.toBeNull()
  })

  it('a reading from the previous reset window stays excluded', () => {
    const h = quotaHistory(today, [run('2026-11-04T02:19:41Z', 5, '2026-11-04T03:00:00Z')]).claude
    expect(h.map((p) => p.remaining_pct)).toEqual([82])
  })

  it('a same-resets reading dated after this run stays excluded', () => {
    const h = quotaHistory(today, [run('2026-11-05T09:00:00Z', 50)]).claude
    expect(h.map((p) => p.remaining_pct)).toEqual([82])
  })

  it('one window reported a second apart still counts; a reset an hour apart does not', () => {
    const near = quotaHistory(today, [run('2026-11-04T02:19:41Z', 100, '2026-11-11T03:00:01Z')]).claude
    expect(near.map((p) => p.remaining_pct)).toEqual([100, 82])
    const far = quotaHistory(today, [run('2026-11-04T02:19:41Z', 100, '2026-11-11T04:00:00Z')]).claude
    expect(far.map((p) => p.remaining_pct)).toEqual([82])
  })
})
