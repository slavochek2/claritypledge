import { describe, it, expect } from 'vitest'
import { groupResets, projectQuota, resetGroupLabel, resetLabel, type QuotaLine } from '../../src/components/day/quota'

/** P1399 Phase D review: the Subscriptions chart's reset markers and projections. Synthetic numbers. */

const H = 3_600_000
const T0 = Date.parse('2026-10-08T10:00:00Z')
const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
const line = (id: string, label: string, resetsAt: number): QuotaLine => ({
  id,
  label,
  resetsAt,
  points: [
    { t: resetsAt - 6 * 24 * H, v: 90 },
    { t: resetsAt - 3 * 24 * H, v: 60 },
    { t: resetsAt - 1 * 24 * H, v: 40 },
  ],
})

describe('subscriptions chart: reset markers', () => {
  it('RESETS — two resets within 2 hours share one marker; further apart they stay two', () => {
    const claude = line('claude', 'Claude', T0)
    expect(groupResets([claude, line('codex', 'Codex', T0 + 90 * 60_000)]).map((g) => g.map((l) => l.id))).toEqual([['claude', 'codex']])
    expect(groupResets([claude, line('codex', 'Codex', T0 + 2 * H)]).map((g) => g.map((l) => l.id))).toEqual([['claude', 'codex']]) // exactly 2h still merges
    expect(groupResets([claude, line('codex', 'Codex', T0 + 2 * H + 60_000)]).map((g) => g.map((l) => l.id))).toEqual([['claude'], ['codex']])
    // a long axis does not widen the rule (it was 10% of the axis, about 17 hours)
    expect(groupResets([claude, line('codex', 'Codex', T0 + 12 * H)]).map((g) => g.map((l) => l.id))).toEqual([['claude'], ['codex']])
  })

  it('RESETS — the merged label names each time when they differ; one time and one name when they do not', () => {
    const a = line('claude', 'Claude', T0)
    const b = line('codex', 'Codex', T0 + 90 * 60_000)
    const day = resetLabel(T0)
    expect(resetGroupLabel([a, b])).toBe(`Claude ${hhmm(a.resetsAt)} and Codex ${hhmm(b.resetsAt)} reset ${day}`)
    expect(resetGroupLabel([a, line('codex', 'Codex', T0)])).toBe(`Claude and Codex reset ${day}`)
    expect(resetGroupLabel([a])).toBe(`Claude resets ${day}`)
  })

  it('PROJECTION — each line is clipped at its own reset, not the merged marker', () => {
    const a = line('claude', 'Claude', T0)
    const b = line('codex', 'Codex', T0 + 90 * 60_000)
    const end = (q: QuotaLine) => {
      const pts = projectQuota(q)!.pts
      return pts[pts.length - 1].t
    }
    expect(end(a)).toBe(a.resetsAt)
    expect(end(b)).toBe(b.resetsAt)
  })
})
