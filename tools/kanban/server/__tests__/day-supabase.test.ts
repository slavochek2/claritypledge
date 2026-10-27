import { describe, it, expect } from 'vitest'
import { buildView, parseReport, type DayReport } from '../../src/lib/day'
import { supabaseGauges } from '../../src/components/day/freePlan'

/** P1578 D: Supabase is a Monitoring source, read from the dashboard reader's output, not a daily card. */

const base = { schema: 2, pass_id: 'p-1', started_at: '2026-10-27T05:00:00Z', state: 'complete', connections: [], checks: [], issues: [] }
const SB = {
  collected: true,
  orgs: [
    {
      id: 'org-a',
      metrics: [
        { label: 'Log_Ingestion', used: '1.65', used_unit: 'GB', limit: '1', limit_unit: 'GB', pct: 165, over: true },
        { label: 'Monthly_Active_Users', used: '4,210', limit: '50,000', pct: 8, over: false },
      ],
      banner: 'Your grace period has started',
      projects: ['claritypledge - test', 'Clarity Movement - Prod'],
    },
  ],
  shared_org: true,
  testdb: { collected: true, state: 'problem', median_ms: 2874, samples_ms: [1639, 2874, 2923], limit_ms: 2000, detail: 'the test database took 2874 ms to answer, over 2000 ms' },
}
const parse = (monitoring: unknown): DayReport => {
  const p = parseReport({ ...base, monitoring })
  if (p.kind !== 'ok') throw new Error('unreadable')
  return p.report
}

describe('monitoring.supabase', () => {
  it('reads per-metric usage, the shared-organisation fact and the test-database latency', () => {
    const sb = parse({ supabase: SB }).monitoring?.supabase
    expect(sb?.collected).toBe(true)
    expect(sb?.orgs[0].metrics[0]).toMatchObject({ label: 'Log_Ingestion', pct: 165, over: true, used_unit: 'GB' })
    expect(sb?.shared_org).toBe(true)
    expect(sb?.testdb).toMatchObject({ state: 'problem', median_ms: 2874, limit_ms: 2000 })
  })

  it('drops malformed metrics and unknown test-database states instead of showing them', () => {
    const sb = parse({ supabase: { ...SB, orgs: [{ id: 'o', metrics: [{ label: 'X', pct: 'lots' }, { label: 'Egress', used: '1', limit: '5', pct: 20, over: false }] }], testdb: { collected: true, state: 'great', median_ms: 5 } } }).monitoring?.supabase
    expect(sb?.orgs[0].metrics.map((m) => m.label)).toEqual(['Egress'])
    // a state nobody defined is not proof of anything
    expect(sb?.testdb?.state).toBe('not-run')
  })

  it('a report without it reads as before (no source, nothing invented)', () => {
    expect(parse({ quotas: [] }).monitoring?.supabase).toBeUndefined()
  })
})

describe('supabaseGauges', () => {
  it('shows each metric as used of limit with the percentage, and the overrun flagged', () => {
    const g = supabaseGauges(parse({ supabase: SB }).monitoring?.supabase, [])
    expect(g.read).toBe(true)
    expect(g.rows[0]).toMatchObject({ label: 'Log Ingestion', text: '1.65 GB of 1 GB', pct: 165, over: true })
    expect(g.rows[1]).toMatchObject({ label: 'Monthly Active Users', text: '4,210 of 50,000', pct: 8, over: false })
    expect(g.sharedLine).toMatch(/test and prod share one/i)
  })

  it('names the owning spec on an over-limit metric instead of raising a card', () => {
    const r = parse({ supabase: SB })
    r.issues.push({ fp: 'cp.quota:quota:org-a:log-ingestion', topic: 'Database', title: 'x', point_a: '', obstacle: '', point_b: '', options: [{ id: 'agent', label: 'a', agent: true }, { id: 'park', label: 'p' }], check: 'cp.quota' })
    r.checks.push({ id: 'cp.quota', label: 'Supabase free-plan usage', status: 'problem' })
    r.loops = { resolved: [], cards: { 'cp.quota:quota:org-a:log-ingestion': { owner: { kind: 'spec', ref: 'P1530', label: 'P1530', state: 'live' }, suppressed: true } } }
    const view = buildView(r, [], [])
    const g = supabaseGauges(r.monitoring?.supabase, view.owned)
    expect(g.rows[0].owner).toBe('P1530')
    expect(g.rows[1].owner).toBeUndefined()
  })

  it('not read today is said as such, never as fine', () => {
    const g = supabaseGauges({ collected: false, orgs: [] }, [])
    expect(g.read).toBe(false)
    expect(g.rows).toEqual([])
    expect(supabaseGauges(undefined, []).read).toBe(false)
  })

  it('the test database is a gauge of its own, and a not-run one says so', () => {
    expect(supabaseGauges(parse({ supabase: SB }).monitoring?.supabase, []).testdb).toMatchObject({ text: '2874 ms (limit 2000 ms)', state: 'problem' })
    const nr = supabaseGauges(parse({ supabase: { ...SB, testdb: { collected: false, state: 'not-run' } } }).monitoring?.supabase, [])
    expect(nr.testdb).toMatchObject({ text: 'not read today', state: 'not-run' })
  })
})
