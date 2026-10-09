// P1442: budget rows and AI prepaid key cards in monitoring.cloud — the parser keeps older reports
// working and never lets a malformed row claim more than it can show.
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { capRatio, compareKeyCards, keyCard, parseReport, type DayCloud, type DayReport } from '../../src/lib/day'
import { synthReport } from './fixtures/day-fixture'

const CARDS = JSON.parse(readFileSync(join(__dirname, 'fixtures/day-cloud-cards.json'), 'utf-8')) as DayCloud

function parsedCloud(cloud: unknown): DayCloud {
  const base = synthReport() as DayReport & { monitoring: { cloud: unknown } }
  const raw = JSON.parse(JSON.stringify({ ...base, monitoring: { ...base.monitoring, cloud } }))
  const r = parseReport(raw)
  if (r.kind !== 'ok') throw new Error(`parse failed: ${r.kind}`)
  const c = r.report.monitoring?.cloud
  if (!c) throw new Error('no cloud')
  return c
}

describe('P1442 cloud budgets + key cards', () => {
  it('OLD SHAPE — a report without budgets or key states still parses, keys unchanged, no budgets field', () => {
    const old = synthReport().monitoring?.cloud
    const c = parsedCloud(old)
    expect(c.budgets).toBeUndefined()
    expect(c.keys).toHaveLength(7)
    expect(c.keys?.find((k) => k.id === 'key-search')).toEqual({ id: 'key-search', label: 'Search', collected: false, budget_eur: 20, why: 'no billing data: unused, or not in the billing export' })
    expect(c.keys?.every((k) => k.state === undefined && k.cap_state === undefined)).toBe(true)
  })

  it('OLD SHAPE — every legacy key still gets exactly one state: spent when measured, else unmeasurable', () => {
    const c = parsedCloud(synthReport().monitoring?.cloud)
    const states = c.keys?.map((k) => keyCard(c, k).state)
    expect(states?.filter((s) => s === 'spent')).toHaveLength(6)
    expect(keyCard(c, c.keys!.find((k) => k.id === 'key-search')!).state).toBe('unmeasurable')
  })

  it('NEW SHAPE — fixture keeps all 11 budget rows and the four states', () => {
    const c = parsedCloud(CARDS)
    expect(c.budgets?.map((b) => b.name)).toEqual(CARDS.budgets!.map((b) => b.name))
    expect(c.budgets?.map((b) => b.kind)).toEqual(['account', 'alarm', 'key-cap', 'key-alert', 'key-cap', 'key-alert', 'key-cap', 'key-alert', 'key-cap', 'key-cap', 'unmatched'])
    expect(new Set(c.keys?.map((k) => k.state))).toEqual(new Set(['spent', 'unused', 'no-spend', 'unmeasurable']))
    const owl = c.keys!.find((k) => k.id === 'key-owl')!
    expect(owl).toMatchObject({ state: 'spent', cap_state: 'CONFIGURED', alert_budget_eur: 1 })
  })

  it('NEW SHAPE — keyCard joins a key to its cap and alert budgets', () => {
    const c = parsedCloud(CARDS)
    const card = (id: string) => keyCard(c, c.keys!.find((k) => k.id === id)!)
    expect(card('key-owl')).toMatchObject({ state: 'spent', cap_eur: 2, cap_state: 'CONFIGURED', alert_eur: 1, has_cap: true })
    expect(card('key-otter')).toMatchObject({ state: 'unmeasurable', cap_eur: 1, has_cap: true, alert_eur: undefined })
    expect(card('key-mole')).toMatchObject({ state: 'no-spend', has_cap: false, alert_eur: undefined })
  })

  it('MALFORMED — bad budget rows are dropped; a bad state is dropped; "spent" without a number is not spent', () => {
    const c = parsedCloud({
      collected: true,
      budgets: [
        { name: 'ok', amount_eur: 3, kind: 'alarm' },
        { name: 'no amount', kind: 'alarm' },
        { name: 'bad kind', amount_eur: 3, kind: 'project' },
        { amount_eur: 3, kind: 'unmatched' },
        { name: 'bad key id', amount_eur: 3, kind: 'key-cap', key_id: 'has spaces/../' },
        'not a row',
      ],
      keys: [
        { id: 'k1', label: 'K1', collected: false, state: 'zero' },
        { id: 'k2', label: 'K2', collected: false, state: 'spent' },
        { id: 'k3', label: 'K3', collected: true, spent_eur: 2, state: 'unused' },
      ],
    })
    expect(c.budgets).toEqual([{ name: 'ok', amount_eur: 3, kind: 'alarm' }])
    expect(c.keys?.[0].state).toBeUndefined()
    expect(keyCard(c, c.keys![0]).state).toBe('unmeasurable')
    expect(keyCard(c, c.keys![1]).state).toBe('unmeasurable')
    // a key with billing rows is spent, whatever label the report gave it ("unused" needs no rows)
    expect(keyCard(c, c.keys![2]).state).toBe('spent')
  })

  it('REVIEW 1 — a key with two cap and two alert budgets keeps every row on its card', () => {
    const c = parsedCloud({
      collected: true,
      budgets: [
        { name: 'A cap', amount_eur: 2, kind: 'key-cap', key_id: 'k1', cap_state: 'CONFIGURED' },
        { name: 'A cap 2', amount_eur: 3, kind: 'key-cap', key_id: 'k1' },
        { name: 'A alert', amount_eur: 1, kind: 'key-alert', key_id: 'k1' },
        { name: 'A alert 2', amount_eur: 1.5, kind: 'key-alert', key_id: 'k1' },
      ],
      keys: [{ id: 'k1', label: 'K1', collected: true, spent_eur: 1, budget_eur: 2 }],
    })
    const card = keyCard(c, c.keys![0])
    expect(card.cap_rows.map((b) => b.name)).toEqual(['A cap', 'A cap 2'])
    expect(card.alert_rows.map((b) => b.name)).toEqual(['A alert', 'A alert 2'])
  })

  it('REVIEW 2 — spend collection failed: keys are unmeasurable with a reason, budgets still parse', () => {
    const c = parsedCloud({ ...CARDS, collected: false })
    expect(c.budgets).toHaveLength(11)
    for (const k of c.keys!) {
      const card = keyCard(c, k)
      expect(card.state).toBe('unmeasurable')
      expect(card.why).toBeTruthy()
    }
  })

  it('REVIEW 3 — one cap for sort, bar and Raise; a cap row that differs from the recorded budget is flagged', () => {
    const c = parsedCloud({
      collected: true,
      budgets: [{ name: 'Cap row', amount_eur: 5, kind: 'key-cap', key_id: 'k1' }],
      keys: [{ id: 'k1', label: 'K1', collected: true, spent_eur: 1, budget_eur: 2 }, { id: 'k2', label: 'K2', collected: true, spent_eur: 1, budget_eur: 2 }],
    })
    const a = keyCard(c, c.keys![0])
    expect(a).toMatchObject({ cap_eur: 5, recorded_budget_eur: 2, cap_mismatch: true })
    expect(keyCard(c, c.keys![1])).toMatchObject({ cap_eur: 2, cap_mismatch: false })
    expect(capRatio(c, c.keys![0])).toBeCloseTo(0.2)
  })

  it('REVIEW 4 — non-finite or negative spend/budget is dropped and makes the key unmeasurable with a reason', () => {
    const c = parsedCloud({
      collected: true,
      keys: [
        { id: 'k1', label: 'K1', collected: true, spent_eur: -3, budget_eur: 2 },
        { id: 'k2', label: 'K2', collected: true, spent_eur: '7', budget_eur: 2 },
        { id: 'k3', label: 'K3', collected: true, spent_eur: 1, budget_eur: -1 },
      ],
    })
    expect(c.keys![0].spent_eur).toBeUndefined()
    expect(c.keys![1].spent_eur).toBeUndefined()
    expect(c.keys![2].budget_eur).toBeUndefined()
    for (const k of c.keys!.slice(0, 2)) {
      expect(keyCard(c, k).state).toBe('unmeasurable')
      expect(k.why).toMatch(/invalid/)
    }
  })

  it('REVIEW 5 — "unused" needs request-count evidence; without it the key is "no spend recorded"', () => {
    const ev = { metric: 'generativelanguage request_count', requests: 0, window: '2026-10' }
    const c = parsedCloud({
      collected: true,
      keys: [
        { id: 'k1', label: 'K1', collected: false, state: 'unused' },
        { id: 'k2', label: 'K2', collected: false, state: 'unused', unused_evidence: { ...ev, requests: 4 } },
        { id: 'k3', label: 'K3', collected: false, state: 'unused', unused_evidence: ev },
      ],
    })
    expect(c.keys!.map((k) => keyCard(c, k).state)).toEqual(['no-spend', 'no-spend', 'unused'])
    expect(c.keys![2].unused_evidence).toEqual(ev)
    const fx = parsedCloud(CARDS)
    expect(keyCard(fx, fx.keys!.find((k) => k.id === 'key-heron')!).state).toBe('unused')
  })

  it('REVIEW 6 — a budget name that looks like a project id or filter is replaced by "unnamed budget"', () => {
    const names = ['projects/123456789', '123456789012', 'billingAccounts/AB-CD', 'Fine name']
    const c = parsedCloud({ collected: true, budgets: names.map((name) => ({ name, amount_eur: 1, kind: 'unmatched' })) })
    expect(c.budgets!.map((b) => b.name)).toEqual(['unnamed budget', 'unnamed budget', 'unnamed budget', 'Fine name'])
  })

  it('ROUND 2a / QA2 — sort is total and deterministic: measured ratio desc, then no-data keys (state, label); no-data keys never outrank any measured key', () => {
    const c = parsedCloud({
      collected: true,
      keys: [
        { id: 'z', label: 'Zed', collected: false, state: 'no-spend' },
        { id: 'a', label: 'Ann', collected: false, state: 'no-spend' },
        { id: 'm', label: 'Max', collected: false },
        { id: 'hot', label: 'Hot', collected: true, spent_eur: 1.9, budget_eur: 2 },
        { id: 'low', label: 'Low', collected: true, spent_eur: 0.2, budget_eur: 2 },
      ],
    })
    const order = (ks: typeof c.keys) => [...ks!].sort(compareKeyCards(c)).map((k) => k.id)
    // QA pass 2: "closest to limit first" — every measured key by its own ratio, then the keys with no measured spend
    expect(order(c.keys)).toEqual(['hot', 'low', 'm', 'a', 'z'])
    expect(order([...c.keys!].reverse())).toEqual(['hot', 'low', 'm', 'a', 'z'])
    for (const x of c.keys!) for (const y of c.keys!) expect(Number.isNaN(compareKeyCards(c)(x, y))).toBe(false)
  })

  it('ROUND 2b — each state has its own default line when the report gives no why', () => {
    const c = parsedCloud({
      collected: true,
      keys: [
        { id: 'u', label: 'U', collected: false, state: 'unused', unused_evidence: { metric: 'request_count', requests: 0, window: '2026-10' } },
        { id: 'n', label: 'N', collected: false, state: 'no-spend' },
        { id: 'x', label: 'X', collected: false },
      ],
    })
    expect(c.keys!.map((k) => keyCard(c, k).why)).toEqual(['0 requests this month', 'no billing rows this month', 'not collected yet'])
  })

  it('ROUND 2c — alert takes the budget row first, like the cap; a differing key field is flagged', () => {
    const c = parsedCloud({
      collected: true,
      budgets: [{ name: 'A alert', amount_eur: 3, kind: 'key-alert', key_id: 'k1' }],
      keys: [{ id: 'k1', label: 'K1', collected: true, spent_eur: 1, budget_eur: 2, alert_budget_eur: 1 }],
    })
    expect(keyCard(c, c.keys![0])).toMatchObject({ alert_eur: 3, recorded_alert_eur: 1, alert_mismatch: true })
  })

  it('ROUND 3 O1 — a billing-account id in a budget name is scrubbed by the board itself', () => {
    const c = parsedCloud({ collected: true, budgets: [{ name: 'budget AB12CD-34EF56-7890AB', amount_eur: 1, kind: 'unmatched' }] })
    expect(c.budgets![0].name).toBe('unnamed budget')
  })

  it('ROUND 3 O2 — a non-EUR row is kept with its currency and no EUR amount; its why survives', () => {
    const c = parsedCloud({ collected: true, budgets: [{ name: 'Dollars', currency: 'USD', kind: 'unmatched', why: 'does not bound this key: currency:USD' }, { name: 'nothing', kind: 'unmatched' }] })
    expect(c.budgets).toEqual([{ name: 'Dollars', currency: 'USD', kind: 'unmatched', why: 'does not bound this key: currency:USD' }])
  })

  it('ROUND 3 O4/C2 — a spent key with no cap, or spend over a €0 cap, sorts above a 95%-spent key', () => {
    const c = parsedCloud({
      collected: true,
      keys: [
        { id: 'hot', label: 'Hot', collected: true, spent_eur: 1.9, budget_eur: 2 },
        { id: 'nocap', label: 'Nocap', collected: true, spent_eur: 0.1 },
        { id: 'zero', label: 'Zero', collected: true, spent_eur: 0.1, budget_eur: 0 },
      ],
    })
    expect([...c.keys!].sort(compareKeyCards(c)).map((k) => k.id)).toEqual(['nocap', 'zero', 'hot'])
    expect(capRatio(c, c.keys![2])).toBeGreaterThan(1)
    expect(keyCard(c, c.keys![2]).cap_eur).toBe(0)
  })

  it('ROUND 3 C3 — "unused" evidence for another month is downgraded to no-spend', () => {
    const ev = (window: string) => ({ metric: 'request_count', requests: 0, window })
    const month = synthReport().started_at.slice(0, 7)
    const c = parsedCloud({
      collected: true,
      keys: [
        { id: 'a', label: 'A', collected: false, state: 'unused', unused_evidence: ev('1999-01') },
        { id: 'b', label: 'B', collected: false, state: 'unused', unused_evidence: ev(month) },
      ],
    })
    expect(c.keys!.map((k) => keyCard(c, k).state)).toEqual(['no-spend', 'unused'])
  })

  it('ROUND 3 C4 — cap_state UNKNOWN never counts as a cap; its note is kept whole', () => {
    const note = 'the budget list showed no caps this run, so caps cannot be checked'
    const c = parsedCloud({ collected: true, budgets: [], keys: [{ id: 'k', label: 'K', collected: true, spent_eur: 1, budget_eur: 2, cap_state: 'UNKNOWN', cap_note: note }] })
    const card = keyCard(c, c.keys![0])
    expect(card.has_cap).toBe(false)
    expect(card.cap_unknown).toBe(true)
    expect(c.keys![0].cap_note).toBe(note)
  })

  it('QA2 — a 20%-spent key sorts above every key without measured spend; uncapped spend stays first', () => {
    const c = parsedCloud({
      collected: true,
      keys: [
        { id: 'u', label: 'U', collected: false, state: 'unmeasurable' },
        { id: 'low', label: 'Low', collected: true, spent_eur: 0.2, budget_eur: 1 },
        { id: 'nocap', label: 'Nocap', collected: true, spent_eur: 0.1 },
        { id: 'zero', label: 'Zero', collected: true, spent_eur: 0, budget_eur: 1 },
      ],
    })
    expect([...c.keys!].sort(compareKeyCards(c)).map((k) => k.id)).toEqual(['nocap', 'low', 'zero', 'u'])
  })
})
