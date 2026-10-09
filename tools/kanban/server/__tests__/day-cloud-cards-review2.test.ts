// P1442 review round 4 (Codex, 2026-10-09): each finding reproduced with its own input before any fix.
import { describe, expect, it } from 'vitest'
import { capFactsKnown, keyCard, parseReport, type DayCloud, type DayReport } from '../../src/lib/day'
import { synthReport } from './fixtures/day-fixture'

function report(cloud: Record<string, unknown>, started_at = '2026-10-09T06:56:20Z'): DayReport {
  const base = synthReport() as DayReport & { monitoring: Record<string, unknown> }
  const p = parseReport(JSON.parse(JSON.stringify({ ...base, started_at, monitoring: { ...base.monitoring, cloud } })))
  if (p.kind !== 'ok') throw new Error(`fixture report rejected: ${JSON.stringify(p).slice(0, 200)}`)
  return p.report
}
const cloudOf = (r: DayReport): DayCloud => {
  const c = r.monitoring?.cloud
  if (!c) throw new Error('no cloud')
  return c
}
const key = { id: 'key-demo', label: 'Demo', collected: true }

describe('P1442 review round 4', () => {
  it('C1 — a budget named by a bare project id never reaches the board', () => {
    const c = cloudOf(report({ collected: true, budgets: [{ name: 'aikey-hermes-agent-17269', kind: 'alarm', amount_eur: 3 }] }))
    expect(c.budgets?.[0].name).toBe('unnamed budget')
  })

  it('C1 control — an ordinary display name with a hyphenated word and a number is kept', () => {
    const c = cloudOf(report({ collected: true, budgets: [{ name: 'ai-key hermes-agent cap 100', kind: 'key-cap', amount_eur: 100 }] }))
    expect(c.budgets?.[0].name).toBe('ai-key hermes-agent cap 100')
  })

  it('C2 — a budget why never carries a billing-account or project id', () => {
    const c = cloudOf(report({
      collected: true,
      budgets: [
        { name: 'Alarm', kind: 'unmatched', amount_eur: 3, why: 'billingAccounts/ABCDEF-123456-ABCDEF' },
        { name: 'Other', kind: 'unmatched', amount_eur: 3, why: 'does not bound this key: projects/aikey-hermes-agent-17269' },
      ],
    }))
    for (const b of c.budgets ?? []) {
      expect(b.why ?? '').not.toMatch(/ABCDEF-123456-ABCDEF|aikey-hermes-agent-17269/)
    }
  })

  it('C2 — a key why never carries a project id', () => {
    const c = cloudOf(report({ collected: true, keys: [{ ...key, state: 'no-spend', why: 'no rows for aikey-hermes-agent-17269' }] }))
    expect(c.keys?.[0].why ?? '').not.toMatch(/aikey-hermes-agent-17269/)
  })

  it('C4 — only a request-count reading can make a key "unused"', () => {
    const c = cloudOf(report({ collected: true, keys: [{ ...key, collected: false, state: 'unused', unused_evidence: { metric: 'billing_cost', requests: 0, window: '2026-10' } }] }))
    expect(c.keys?.[0].state).toBe('no-spend')
  })

  it('C4 control — a request-count reading for the report month still says "unused"', () => {
    const c = cloudOf(report({ collected: true, keys: [{ ...key, collected: false, state: 'unused', unused_evidence: { metric: 'request_count', requests: 0, window: '2026-10' } }] }))
    expect(c.keys?.[0].state).toBe('unused')
  })

  it('C6 — a listed-but-empty budget list never says "No cap" for a key whose cap is shown as an amount', () => {
    const c = cloudOf(report({ collected: true, budgets: [], keys: [{ ...key, spent_eur: 1, budget_eur: 3 }] }))
    // an empty (blind) list cannot say "No cap" beside the "€1 of €3" the card shows
    expect(keyCard(c, c.keys![0]).cap_eur).toBe(3)
    expect(capFactsKnown(c)).toBe(false)
  })

  it('C6 control — a list with rows and no cap row for the key still says "No cap"', () => {
    const c = cloudOf(report({ collected: true, budgets: [{ name: '400 eur', kind: 'account', amount_eur: 400 }], keys: [{ ...key, spent_eur: 1 }] }))
    expect(capFactsKnown(c)).toBe(true)
    expect(keyCard(c, c.keys![0]).has_cap).toBe(false)
  })

  it('C7 — a foreign-currency cap row never falls back to the recorded EUR amount', () => {
    const c = cloudOf(report({
      collected: true,
      budgets: [{ name: 'Demo cap', kind: 'key-cap', currency: 'USD', key_id: 'key-demo' }],
      keys: [{ ...key, spent_eur: 1, budget_eur: 3 }],
    }))
    expect(keyCard(c, c.keys![0]).cap_eur).toBeUndefined()
  })

  it('C8 — a malformed week series is dropped by the parser, not handed to the chart', () => {
    const c = cloudOf(report({ collected: false, week: {}, month: 'x', keys: [key] }))
    expect(c.week === undefined || Array.isArray(c.week)).toBe(true)
    expect(c.month === undefined || Array.isArray(c.month)).toBe(true)
  })

  it('C9 — a negative budget amount is dropped', () => {
    const c = cloudOf(report({ collected: true, budgets: [{ name: 'Demo cap', kind: 'key-cap', amount_eur: -3, key_id: 'key-demo' }] }))
    expect(c.budgets ?? []).toHaveLength(0)
  })
})
