import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect, vi } from 'vitest'
import { app } from '../api'
import { createServer, request as httpRequest } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes, readdir, chmod } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import {
  allIssues,
  buildPrompt,
  buildView,
  collect,
  compareIssues,
  daysOpen,
  decisionTargetExists,
  parseDecisions,
  parseReport,
  pendingPreselected,
  runWarnings,
  validateDecisionInput,
  type DayDecision,
  type DayReport,
  type IssueView,
} from '../../src/lib/day'
import { SECRET, synthEarlier, synthReport, synthWeekly } from './fixtures/day-fixture'

/**
 * P1399 — the Day page, schema v2. Synthetic fixtures only (fixtures/day-fixture.ts): no real
 * /day report content enters this suite, its logs or its assertions (P1317 precedent).
 *
 * Each §7 rule has a test that fails on the code it replaces (the v1 board), and the mutation
 * controls in scripts/day-mutation-controls.sh show each one turns red when its rule is broken.
 */

const RUN = '2026-10-04T05-37-45Z'
const ok = (r: DayReport) => {
  const p = parseReport(JSON.parse(JSON.stringify(r)))
  if (p.kind !== 'ok') throw new Error(`fixture did not parse: ${p.kind}`)
  return p.report
}
const line = (d: Partial<DayDecision>): DayDecision => ({ run_id: RUN, at: '2026-10-04T08:00:00Z', kind: 'option', target: 'x', ...d } as DayDecision)
const fps = (xs: { fp: string }[]) => xs.map((x) => x.fp)

describe('day v2: reading a report (rule 3, rule 2)', () => {
  it('accepts the synthetic run and keeps every check', () => {
    const r = ok(synthReport())
    expect(r.checks).toHaveLength(21)
    expect(r.issues).toHaveLength(6)
  })

  it('reads an unknown check status as Not proven (unproven), never as fine', () => {
    const raw = synthReport()
    ;(raw.checks[0] as { status: string }).status = 'exploded'
    const r = ok(raw)
    expect(r.checks[0].status).toBe('unproven')
  })

  it('ignores unknown fields, at the top and in rows', () => {
    const raw = { ...synthReport(), future_field: { x: 1 } } as unknown as DayReport
    ;(raw.checks[0] as unknown as Record<string, unknown>).wobble = true
    const p = parseReport(raw)
    expect(p.kind).toBe('ok')
  })

  it('drops malformed rows and counts them instead of failing the run', () => {
    const raw = synthReport() as unknown as { checks: unknown[]; issues: unknown[]; connections: unknown[] }
    raw.checks.push({ label: 'no id' }, 42)
    raw.issues.push({ fp: 'bad:no-options', title: 'x', topic: 't', point_a: 'a', obstacle: 'o', point_b: 'b', options: [] })
    raw.connections.push({ state: 'ok' })
    const p = parseReport(raw)
    expect(p.kind).toBe('ok')
    if (p.kind === 'ok') {
      expect(p.droppedRows).toBe(4)
      expect(p.report.checks).toHaveLength(21)
      expect(p.report.issues).toHaveLength(6)
    }
  })

  it('drops a second issue with the same fingerprint', () => {
    const raw = synthReport()
    raw.issues.push({ ...raw.issues[0] })
    const p = parseReport(raw)
    expect(p.kind === 'ok' && p.report.issues.length === 6 && p.droppedRows === 1).toBe(true)
  })

  it('a newer (or older) schema is "other-schema" — rendered as plain text, never as clean', () => {
    expect(parseReport({ ...synthReport(), schema: 3 }).kind).toBe('other-schema')
    expect(parseReport({ ...synthReport(), schema: 1 }).kind).toBe('other-schema')
  })

  it('rejects a file with no run identity', () => {
    expect(parseReport(null).kind).toBe('invalid')
    expect(parseReport({ schema: 2, started_at: 'nope', pass_id: '' }).kind).toBe('invalid')
  })

  it('accepts state running; an unknown state reads as incomplete', () => {
    expect(ok(synthReport({ state: 'running' })).state).toBe('running')
    expect(ok({ ...synthReport(), state: 'weird' as never }).state).toBe('incomplete')
  })

  it('a report cannot recommend Park (only the founder parks)', () => {
    const raw = synthReport()
    raw.issues[0].options = [{ id: 'park', label: 'Park', recommended: true }, { id: 'agent', label: 'Give to the agent', agent: true }]
    const r = ok(raw)
    const v = allIssues(r).find((i) => i.fp === raw.issues[0].fp)!
    expect(v.options[v.recommended_index].id).toBe('agent')
    expect(r.issues[0].options.find((o) => o.id === 'park')?.recommended).toBeFalsy()
  })

  it('clamps recommendation_confidence to 0–100 and drops a non-number', () => {
    const raw = synthReport()
    raw.issues[0].recommendation_confidence = 140
    raw.issues[1].recommendation_confidence = 'high' as never
    const r = ok(raw)
    expect(r.issues[0].recommendation_confidence).toBe(100)
    expect(r.issues[1].recommendation_confidence).toBeUndefined()
  })

  it('reads new people; drops a row without a name and a non-http LinkedIn link', () => {
    const raw = synthReport() as unknown as { people: Record<string, unknown>[] }
    raw.people.push({ id: 'p-x' })
    raw.people[1].linkedin_url = 'javascript:alert(1)'
    const p = parseReport(raw)
    expect(p.kind).toBe('ok')
    if (p.kind !== 'ok') return
    expect(p.report.people!.map((x) => x.id)).toEqual(['p-a', 'p-b', 'p-c'])
    expect(p.report.people![1].linkedin_url).toBeUndefined()
    expect(p.report.people![1].confirmed).toBe(false)
    expect(p.droppedRows).toBe(1)
    expect(ok({ ...synthReport(), people: undefined }).people).toBeUndefined() // not collected ≠ nobody
  })

  it('reads notes as plain detail; drops a note without a title and caps the body', () => {
    const raw = { ...synthReport(), notes: [
      { id: 'shipped', title: 'Shipped since the last run', body: 'a\nb' },
      { id: 'bad', body: 'no title' },
      { id: 'long', title: 'Long', body: 'x'.repeat(5000), review: 'weekly' },
    ] }
    const p = parseReport(raw)
    expect(p.kind === 'ok' && p.droppedRows).toBe(1)
    if (p.kind !== 'ok') return
    expect(p.report.notes!.map((n) => n.id)).toEqual(['shipped', 'long'])
    expect(p.report.notes![1].body).toHaveLength(4000)
    expect(p.report.notes![1].review).toBe('weekly')
  })

  it('keeps fix_url only when it is http(s)', () => {
    const raw = synthReport()
    raw.connections[0].fix_url = 'javascript:alert(1)'
    expect(ok(raw).connections[0].fix_url).toBeUndefined()
  })
})

describe('day v2: did not run never reads as clean (Invariant 1, AC known-bad control)', () => {
  it('every problem / not-run / unproven check with no issue becomes an issue', () => {
    const r = ok(synthReport())
    const issues = allIssues(r)
    for (const id of ['bk-c', 'keylive', 'keyspend', 'sender', 'crmsync', 'dbpriv', 'tests']) {
      const it = issues.find((i) => i.check === id)
      expect(it, id).toBeDefined()
      expect(it!.synthetic).toBe(true)
      expect(it!.options.some((o) => o.agent)).toBe(true)
      expect(it!.options.some((o) => o.id === 'park')).toBe(true)
    }
    expect(issues).toHaveLength(13)
  })

  it('a not-run check is an issue and is never counted as worked', () => {
    const raw = synthReport()
    raw.checks.push({ id: 'ghost', label: 'Ghost check', status: 'not-run' })
    const v = buildView(ok(raw), [])
    expect(v.issues.some((i) => i.check === 'ghost')).toBe(true)
    expect(v.counts.worked).toBe(10)
    expect(v.counts.total).toBe(22)
  })

  it('an unknown status yields an issue too', () => {
    const raw = synthReport()
    raw.checks.push({ id: 'odd', label: 'Odd check', status: 'mystery' as never })
    expect(allIssues(ok(raw)).some((i) => i.check === 'odd')).toBe(true)
  })

  it('a written issue covers its check: no duplicate', () => {
    const issues = allIssues(ok(synthReport()))
    expect(issues.filter((i) => i.check === 'rules')).toHaveLength(1)
    expect(issues.filter((i) => i.check === 'credits')).toHaveLength(1)
  })

  it('a check explained by a broken connection points at it instead of becoming its own issue', () => {
    const v = buildView(ok(synthReport()), [])
    const chats = v.checks.find((c) => c.id === 'chats')!
    expect(chats.covered_by).toBe('beeper')
    expect(v.issues.some((i) => i.check === 'chats')).toBe(false)
  })

  it('…but if that connection is not in the run, the check is an issue', () => {
    const raw = synthReport()
    raw.connections = raw.connections.filter((c) => c.id !== 'beeper')
    expect(allIssues(ok(raw)).some((i) => i.check === 'chats')).toBe(true)
  })

  it('a skipped check is neither worked nor an issue', () => {
    const v = buildView(ok(synthReport()), [])
    expect(v.counts.skipped).toBe(1)
    expect(v.issues.some((i) => i.check === 'video')).toBe(false)
  })
})

describe('day v2: ordering is one rule (rule 7)', () => {
  const mk = (over: Partial<IssueView>): IssueView =>
    ({ fp: 'f', topic: 't', title: 'T', point_a: '', obstacle: '', point_b: '', options: [{ id: 'a', label: 'a' }], synthetic: false, urgent: false, important: false, came_back: false, recommended_index: 0, ...over }) as IssueView

  it('urgent = deadline within 72h of the run, or the check did not run / is not proven', () => {
    const issues = allIssues(ok(synthReport()))
    expect(issues.find((i) => i.fp === 'rules:live-not-on-main')!.urgent).toBe(true) // 6 Oct, run 4 Oct
    expect(issues.find((i) => i.check === 'keyspend')!.urgent).toBe(true) // unproven
    expect(issues.find((i) => i.check === 'tests')!.urgent).toBe(false) // a problem, no deadline
    expect(issues.find((i) => i.fp === 'spec:letters-waiting')!.urgent).toBe(false)
    const raw = synthReport()
    raw.issues[0].deadline = '2026-10-09'
    expect(allIssues(ok(raw)).find((i) => i.fp === 'rules:live-not-on-main')!.urgent).toBe(false)
  })

  it('important = the check’s own severity, or the issue’s own flag', () => {
    const issues = allIssues(ok(synthReport()))
    expect(issues.find((i) => i.check === 'keylive')!.important).toBe(true) // severity high
    expect(issues.find((i) => i.check === 'sender')!.important).toBe(false)
    expect(issues.find((i) => i.fp === 'spec:letters-waiting')!.important).toBe(true)
  })

  it('sorts urgent+important, urgent, important, rest; then deadline, first seen, title', () => {
    const list = [
      mk({ fp: 'rest', title: 'A' }),
      mk({ fp: 'imp', important: true }),
      mk({ fp: 'urg', urgent: true }),
      mk({ fp: 'both', urgent: true, important: true }),
      mk({ fp: 'urg-late', urgent: true, deadline: '2026-10-06' }),
      mk({ fp: 'urg-soon', urgent: true, deadline: '2026-10-05' }),
      mk({ fp: 'imp-old', important: true, first_seen: '2026-08-01' }),
      mk({ fp: 'rest-b', title: 'B' }),
    ].sort(compareIssues)
    expect(fps(list)).toEqual(['both', 'urg-soon', 'urg-late', 'urg', 'imp-old', 'imp', 'rest', 'rest-b'])
  })

  it('the view is sorted by that rule', () => {
    const v = buildView(ok(synthReport()), [])
    const rank = (i: IssueView) => (i.urgent && i.important ? 0 : i.urgent ? 1 : i.important ? 2 : 3)
    const ranks = v.issues.map(rank)
    expect([...ranks].sort()).toEqual(ranks)
    expect(v.issues[0].fp).toBe('rules:live-not-on-main')
  })
})

describe('day v2: decisions (rule 4) and their scope (rule 1)', () => {
  it('validates each kind strictly, with fixed-vocabulary problems', () => {
    const good = [
      { kind: 'option', target: 'rules:live-not-on-main', option_id: 'agent' },
      { kind: 'option', target: 'rules:live-not-on-main', option_id: 'ask', text: 'Which rules?' },
      { kind: 'reflection', target: 'c1', position: -3, story: 'x' },
      { kind: 'reflection', target: 'c1', position: 0 },
      { kind: 'budget', target: 'account', amount: 500, scope: 'monthly' },
      { kind: 'connection', target: 'sentry' },
      { kind: 'option', target: 'rules:live-not-on-main', remove: true },
    ]
    for (const d of good) expect(validateDecisionInput(d).ok, JSON.stringify(d)).toBe(true)
    const bad = [
      { kind: 'hold', target: 'x' },
      { kind: 'option', target: '../etc', option_id: 'agent' },
      { kind: 'option', target: 'x:y' },
      { kind: 'option', target: 'x:y', option_id: 'ask' }, // a question needs its text
      { kind: 'option', target: 'x:y', option_id: 'other', text: 'x'.repeat(2001) },
      { kind: 'reflection', target: 'c1', position: 4 },
      { kind: 'reflection', target: 'c1', position: 1.5 },
      { kind: 'reflection', target: 'c1', position: 1, story: 'x'.repeat(2001) },
      { kind: 'budget', target: 'account', amount: -5, scope: 'monthly' },
      { kind: 'budget', target: 'account', amount: 50 },
    ]
    for (const d of bad) {
      const v = validateDecisionInput(d)
      expect(v.ok, JSON.stringify(d)).toBe(false)
      if (!v.ok) expect(v.problem).toMatch(/^[a-z_-]+$/)
    }
  })

  it('a target must exist in the run, and an option must be one the issue offers', () => {
    const r = ok(synthReport())
    expect(decisionTargetExists(r, { kind: 'option', target: 'rules:live-not-on-main', option_id: 'rollback' })).toBe(true)
    expect(decisionTargetExists(r, { kind: 'option', target: 'rules:live-not-on-main', option_id: 'ship' })).toBe(false)
    expect(decisionTargetExists(r, { kind: 'option', target: 'check:tests', option_id: 'agent' })).toBe(true) // synthetic
    expect(decisionTargetExists(r, { kind: 'option', target: 'nope:x', option_id: 'agent' })).toBe(false)
    expect(decisionTargetExists(r, { kind: 'reflection', target: 'c2', position: 1 })).toBe(true)
    expect(decisionTargetExists(r, { kind: 'reflection', target: 'zz', position: 1 })).toBe(false)
    expect(decisionTargetExists(r, { kind: 'budget', target: 'key-bot', amount: 60, scope: 'monthly' })).toBe(true)
    expect(decisionTargetExists(r, { kind: 'budget', target: 'account', amount: 600, scope: 'monthly' })).toBe(true)
    expect(decisionTargetExists(r, { kind: 'budget', target: 'account', amount: 300, scope: 'monthly' })).toBe(false) // a "raise" below €400
    expect(decisionTargetExists(r, { kind: 'budget', target: 'key-bot', amount: 32, scope: 'monthly' })).toBe(false)
    expect(decisionTargetExists(r, { kind: 'connection', target: 'sentry' })).toBe(true)
    expect(decisionTargetExists(r, { kind: 'connection', target: 'gmail' })).toBe(false) // connected: nothing to fix
  })

  it('latest line per (kind, target) wins; remove undoes; bad lines are counted, not echoed', () => {
    const text = [
      JSON.stringify(line({ target: 'spec:letters-waiting', option_id: 'ship' })),
      `not json ${SECRET}`,
      JSON.stringify(line({ target: 'spec:letters-waiting', option_id: 'after', at: '2026-10-04T08:01:00Z' })),
      JSON.stringify(line({ target: 'sentry:room-ended', option_id: 'agent' })),
      JSON.stringify(line({ target: 'sentry:room-ended', remove: true, at: '2026-10-04T08:02:00Z' })),
    ].join('\n')
    const { lines, badLines } = parseDecisions(text)
    expect(badLines).toBe(1)
    const v = buildView(ok(synthReport()), lines)
    expect(v.issues.find((i) => i.fp === 'spec:letters-waiting')!.decision?.option_id).toBe('after')
    expect(v.issues.find((i) => i.fp === 'sentry:room-ended')!.decision).toBeUndefined()
  })

  it('a Park made on an earlier run keeps the issue out of the flow, under Parked', () => {
    const earlier = line({ run_id: 'old-run', at: '2026-10-02T09:00:00Z', target: 'spec:letters-waiting', option_id: 'park' })
    const v = buildView(ok(synthReport()), [earlier])
    expect(fps(v.issues)).not.toContain('spec:letters-waiting')
    expect(fps(v.parked)).toContain('spec:letters-waiting')
  })

  it('Bring back (remove) returns a parked issue to the flow', () => {
    const lines = [
      line({ run_id: 'old-run', at: '2026-10-02T09:00:00Z', target: 'spec:letters-waiting', option_id: 'park' }),
      line({ target: 'spec:letters-waiting', remove: true }),
    ]
    const v = buildView(ok(synthReport()), lines)
    expect(fps(v.issues)).toContain('spec:letters-waiting')
    expect(v.parked).toHaveLength(0)
  })

  it('RULE 1 — "fixed" lasts until the fault recurs: an earlier non-park answer → back in the flow', () => {
    // Known-bad: the v1 buildView resolved an item on ANY old "done", for every later run.
    const earlier = line({ run_id: 'old-run', at: '2026-10-02T09:00:00Z', target: 'rules:live-not-on-main', option_id: 'agent' })
    const v = buildView(ok(synthReport()), [earlier])
    const it = v.issues.find((i) => i.fp === 'rules:live-not-on-main')
    expect(it).toBeDefined()
    expect(it!.decision).toBeUndefined()
    // No run in between said it was gone, so it never left: "still reported", not "came back".
    expect(it!.came_back).toBe(false)
    expect(it!.answered_before).toMatchObject({ option_id: 'agent', label: 'Give to the agent' })
    expect(v.issues.find((i) => i.fp === 'sentry:room-ended')!.answered_before).toBeUndefined()
  })

  it('RULE 1 — "came back" only when a run in between did not report the fault', () => {
    const earlier = line({ run_id: 'old-run', at: '2026-10-02T09:00:00Z', target: 'rules:live-not-on-main', option_id: 'agent' })
    const history = [
      { pass_id: 'old-run', started_at: '2026-10-02T05:00:00Z', fps: ['rules:live-not-on-main'] },
      { pass_id: 'gap-run', started_at: '2026-10-03T05:00:00Z', fps: [] },
    ]
    const it = buildView(ok(synthReport()), [earlier], history).issues.find((i) => i.fp === 'rules:live-not-on-main')!
    expect(it.came_back).toBe(true)
    expect(it.answered_before).toBeUndefined()
    const still = [{ ...history[0] }, { ...history[1], fps: ['rules:live-not-on-main'] }]
    const it2 = buildView(ok(synthReport()), [earlier], still).issues.find((i) => i.fp === 'rules:live-not-on-main')!
    expect(it2.came_back).toBe(false)
    expect(it2.answered_before).toBeDefined()
  })

  it('a synthesised issue is dated by the first earlier run that reported it', () => {
    const history = [
      { pass_id: 'a', started_at: '2026-09-30T05:00:00Z', fps: ['check:tests'] },
      { pass_id: 'b', started_at: '2026-10-02T05:00:00Z', fps: ['check:tests'] },
    ]
    const v = buildView(ok(synthReport()), [], history)
    expect(v.issues.find((i) => i.fp === 'check:tests')!.first_seen).toBe('2026-09-30')
    expect(buildView(ok(synthReport()), []).issues.find((i) => i.fp === 'check:tests')!.first_seen).toBeUndefined()
  })

  it('a run with an empty checks list is incomplete and yields an urgent issue, never a clean page', () => {
    const r = ok(synthReport({ checks: [] }))
    expect(r.state).toBe('incomplete')
    const v = buildView(r, [])
    const it = v.issues.find((i) => i.fp === 'run:no-checks')
    expect(it?.urgent).toBe(true)
  })

  it('a decision made on a LATER run does not leak into an earlier run (read as it was)', () => {
    const later = line({ run_id: 'newer-run', at: '2026-10-05T09:00:00Z', target: 'rules:live-not-on-main', option_id: 'park' })
    const v = buildView(ok(synthReport()), [later])
    expect(fps(v.issues)).toContain('rules:live-not-on-main')
    expect(v.parked).toHaveLength(0)
  })

  it('connection Fix is recorded but never marks the check as worked (rule 6)', () => {
    const v = buildView(ok(synthReport()), [line({ kind: 'connection', target: 'beeper', step: 'Open Beeper' })])
    expect(v.connections.find((c) => c.id === 'beeper')!.fix_queued).toBe(true)
    expect(v.checks.find((c) => c.id === 'chats')!.status).toBe('problem')
    expect(v.counts.worked).toBe(10)
  })
})

describe('day v2: Start fixing collects, paging writes nothing (rule 5)', () => {
  it('counts flow issues not parked + reflection + budgets + connection fixes', () => {
    const r = ok(synthReport())
    let c = collect(buildView(r, []))
    expect(c.count).toBe(13)
    const lines = [
      line({ target: 'sentry:room-ended', option_id: 'park' }),
      line({ kind: 'reflection', target: 'c1', position: 2, story: 'true' }),
      line({ kind: 'budget', target: 'key-bot', amount: 60, scope: 'monthly' }),
      line({ kind: 'connection', target: 'sentry', step: 'Sign in' }),
    ]
    c = collect(buildView(r, lines))
    expect(c.count).toBe(12 + 1 + 1 + 1)
    expect(c.issues.some((x) => x.issue.fp === 'sentry:room-ended')).toBe(false)
  })

  it('pendingPreselected returns the recommended option for each flow issue with no decision', () => {
    const r = ok(synthReport())
    const v = buildView(r, [line({ target: 'spec:letters-waiting', option_id: 'after' })])
    const p = pendingPreselected(v)
    expect(p).toHaveLength(12)
    expect(p.find((d) => d.target === 'spec:letters-waiting')).toBeUndefined()
    expect(p.find((d) => d.target === 'rules:live-not-on-main')!.option_id).toBe('agent')
    expect(p.every((d) => d.kind === 'option' && d.option_id !== 'park')).toBe(true)
  })
})

describe('day v2: the prompt', () => {
  it('opens with verify-first, puts the founder’s questions first, and contains every collected decision', () => {
    const r = ok(synthReport())
    const lines = [
      line({ target: 'rules:live-not-on-main', option_id: 'ask', text: 'Which two rules exactly?', is_question: true }),
      line({ target: 'spec:letters-waiting', option_id: 'after' }),
      line({ target: 'credits:baseline', option_id: 'other', text: 'I read it: 410' }),
      line({ target: 'sentry:room-ended', option_id: 'park' }),
      line({ kind: 'reflection', target: 'c3', position: -2, story: 'Timing matters here' }),
      line({ kind: 'budget', target: 'account', amount: 500, scope: 'monthly' }),
      line({ kind: 'connection', target: 'sentry', step: 'Sign in to Sentry again' }),
    ]
    const p = buildPrompt(r, buildView(r, lines))
    const first = p.split('\n').find((l) => l.trim())!
    expect(first).toMatch(/check each item is still real/i)
    const q = p.indexOf('Which two rules exactly?')
    expect(q).toBeGreaterThan(0)
    for (const s of ['Ship after Tuesday', 'I read it: 410', 'Timing matters here', '€500', 'Sign in to Sentry again', 'Prod key liveness']) {
      expect(p, s).toContain(s)
      expect(p.indexOf(s), `${s} after the questions`).toBeGreaterThan(q)
    }
    expect(p).not.toContain('Room has ended') // parked
    expect(p).toMatch(/not verified/i) // the unverified finding is flagged
  })
})

describe('day v2: small rules', () => {
  it('days open is measured against the run date', () => {
    expect(daysOpen('2026-08-28', '2026-10-04T05:37:45Z')).toBe(37)
    expect(daysOpen(undefined, '2026-10-04')).toBeNull()
    expect(daysOpen('2026-10-09', '2026-10-04')).toBeNull()
  })

  it('warns when the newest run is older than 24h, or did not finish', () => {
    expect(runWarnings({ state: 'complete', started_at: '2026-10-04T05:37:45Z' }, '2026-10-04T12:00:00Z', true)).toEqual([])
    expect(runWarnings({ state: 'complete', started_at: '2026-10-02T05:37:45Z' }, '2026-10-04T12:00:00Z', true)).toEqual(['stale'])
    expect(runWarnings({ state: 'running', started_at: '2026-10-04T05:37:45Z' }, '2026-10-04T12:00:00Z', true)).toEqual(['unfinished'])
    expect(runWarnings({ state: 'incomplete', started_at: '2026-10-04T05:37:45Z' }, '2026-10-04T12:00:00Z', false)).toEqual(['unfinished'])
    // an earlier run is old by definition; staleness is about the newest only
    expect(runWarnings({ state: 'complete', started_at: '2026-10-01T05:37:45Z' }, '2026-10-04T12:00:00Z', false)).toEqual([])
  })

  it('a weekly-review run carries its review and its items join the issues', () => {
    const r = ok(synthWeekly())
    expect(r.reviews).toEqual(['weekly'])
    expect(allIssues(r).find((i) => i.fp === 'weekly:reach-target')!.review).toBe('weekly')
    expect(r.reflection!.statements.some((s) => s.review === 'weekly')).toBe(true)
  })
})

describe('day v2 API (synthetic day dir)', () => {
  let server: ReturnType<typeof createServer>
  let API: string
  let PORT: number
  let dir: string
  let logs: string[]
  const spies: ReturnType<typeof vi.spyOn>[] = []

  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    PORT = (server.address() as AddressInfo).port
    API = `http://localhost:${PORT}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'day-'))
    process.env.KANBAN_DAY_DIR = dir
    logs = []
    for (const m of ['log', 'warn', 'error', 'info'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))
    }
  })
  afterEach(async () => {
    spies.splice(0).forEach((s) => s.mockRestore())
    delete process.env.KANBAN_DAY_DIR
    await rm(dir, { recursive: true, force: true })
  })

  async function seed(runs: Record<string, unknown>) {
    await mkdir(join(dir, 'reports'), { recursive: true })
    for (const [id, body] of Object.entries(runs)) {
      await writeFile(join(dir, 'reports', `${id}.json`), typeof body === 'string' ? body : JSON.stringify(body))
    }
  }
  const post = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
    fetch(`${API}/api/day/decisions`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const decisionsFile = async () => {
    try { return await readFile(join(dir, 'decisions.jsonl'), 'utf-8') } catch { return '' }
  }

  it('is off without KANBAN_DAY_DIR, and config says so', async () => {
    delete process.env.KANBAN_DAY_DIR
    expect(await (await fetch(`${API}/api/day`)).json()).toEqual({ enabled: false })
    expect((await (await fetch(`${API}/api/config`)).json()).dayEnabled).toBe(false)
    expect((await post({ run_id: RUN, decisions: [] })).status).toBe(404)
    expect((await fetch(`${API}/api/day/prompt`)).status).toBe(404)
  })

  it('missing day dir → absent; empty reports → no runs', async () => {
    process.env.KANBAN_DAY_DIR = join(dir, 'missing')
    expect(await (await fetch(`${API}/api/day`)).json()).toMatchObject({ enabled: true, state: 'absent', runs: [] })
    process.env.KANBAN_DAY_DIR = dir
    expect(await (await fetch(`${API}/api/day`)).json()).toMatchObject({ enabled: true, state: 'present', runs: [] })
  })

  it('lists runs newest first by started_at, and serves a run with its view', async () => {
    await seed({ [RUN]: synthReport(), '2026-10-03T05-05-00Z': synthEarlier() })
    const list = await (await fetch(`${API}/api/day`)).json()
    expect(list.runs.map((r: { id: string }) => r.id)).toEqual([RUN, '2026-10-03T05-05-00Z'])
    expect(list.latestId).toBe(RUN)
    const run = await (await fetch(`${API}/api/day/runs/${RUN}`)).json()
    expect(run.kind).toBe('ok')
    expect(run.isLatest).toBe(true)
    expect(run.view.issues).toHaveLength(13)
    expect((await fetch(`${API}/api/day/runs/..%2Fsecret`)).status).toBe(400)
    expect((await fetch(`${API}/api/day/runs/nope`)).status).toBe(404)
  })

  it('RULE 2 — the newest run in state running is the latest, even though yesterday’s is complete', async () => {
    await seed({ '2026-10-03T05-05-00Z': synthEarlier(), [RUN]: synthReport({ state: 'running', finished_at: undefined }) })
    const list = await (await fetch(`${API}/api/day`)).json()
    expect(list.latestId).toBe(RUN)
    expect(list.runs[0].state).toBe('running')
  })

  it('RULE 2 — an unreadable newest file says so; it never silently yields to yesterday’s', async () => {
    await seed({ '2026-10-03T05-05-00Z': synthEarlier(), '2026-10-04T09-00-00Z': `{ broken ${SECRET}` })
    const newer = new Date('2026-10-04T09:00:00Z')
    await utimes(join(dir, 'reports', '2026-10-04T09-00-00Z.json'), newer, newer)
    await utimes(join(dir, 'reports', '2026-10-03T05-05-00Z.json'), new Date('2026-10-03T06:00:00Z'), new Date('2026-10-03T06:00:00Z'))
    const list = await (await fetch(`${API}/api/day`)).json()
    expect(list.latestId).toBe('2026-10-04T09-00-00Z')
    expect(list.runs[0]).toMatchObject({ id: '2026-10-04T09-00-00Z', readable: false })
    const run = await (await fetch(`${API}/api/day/runs/2026-10-04T09-00-00Z`)).json()
    expect(run.kind).toBe('unreadable')
    // and no decision can land on the readable-but-older run
    const res = await post({ run_id: '2026-10-03T05-05-00Z', decisions: [{ kind: 'option', target: 'rules:live-not-on-main', option_id: 'agent' }] })
    expect(res.status).toBe(409)
  })

  it('RULE 2 — a newest file that exists but cannot be read (permissions) still sorts first', async () => {
    await seed({ '2026-10-03T05-05-00Z': synthEarlier(), '2026-10-04T09-00-00Z': synthReport({ pass_id: 'locked' }) })
    const locked = join(dir, 'reports', '2026-10-04T09-00-00Z.json')
    await utimes(locked, new Date('2026-10-04T09:00:00Z'), new Date('2026-10-04T09:00:00Z'))
    await utimes(join(dir, 'reports', '2026-10-03T05-05-00Z.json'), new Date('2026-10-03T06:00:00Z'), new Date('2026-10-03T06:00:00Z'))
    await chmod(locked, 0o000)
    try {
      const list = await (await fetch(`${API}/api/day`)).json()
      expect(list.latestId).toBe('2026-10-04T09-00-00Z')
      expect(list.runs[0]).toMatchObject({ readable: false })
    } finally {
      await chmod(locked, 0o600)
    }
  })

  it('RULE 3 — a newer schema is served as plain text', async () => {
    await seed({ [RUN]: { ...synthReport(), schema: 3 } })
    const run = await (await fetch(`${API}/api/day/runs/${RUN}`)).json()
    expect(run.kind).toBe('other-schema')
    expect(typeof run.text).toBe('string')
    expect(run.text).toContain('pass_id')
  })

  it('RULE 3 — malformed rows are reported as a count', async () => {
    const raw = synthReport() as unknown as { checks: unknown[] }
    raw.checks.push({ nope: 1 })
    await seed({ [RUN]: raw })
    const run = await (await fetch(`${API}/api/day/runs/${RUN}`)).json()
    expect(run.droppedRows).toBe(1)
  })

  it('appends one line per decision, server-stamped with run and time; reloading keeps it', async () => {
    await seed({ [RUN]: synthReport() })
    const res = await post({ run_id: RUN, decisions: [{ kind: 'option', target: 'spec:letters-waiting', option_id: 'after' }] })
    expect(res.status).toBe(200)
    const text = await decisionsFile()
    expect(text.trim().split('\n')).toHaveLength(1)
    const d = JSON.parse(text)
    expect(d).toMatchObject({ kind: 'option', target: 'spec:letters-waiting', option_id: 'after', run_id: RUN })
    expect(typeof d.at).toBe('string')
    const run = await (await fetch(`${API}/api/day/runs/${RUN}`)).json()
    expect(run.view.issues.find((i: IssueView) => i.fp === 'spec:letters-waiting').decision.option_id).toBe('after')
  })

  it('accepts a run named by its file id or by a pass_id with colons, and stamps the pass_id', async () => {
    await seed({ [RUN]: synthReport({ pass_id: '2026-10-04T05:37:45Z-97246' }) })
    expect((await post({ run_id: RUN, decisions: [{ kind: 'option', target: 'spec:letters-waiting', option_id: 'after' }] })).status).toBe(200)
    expect((await post({ run_id: '2026-10-04T05:37:45Z-97246', decisions: [{ kind: 'option', target: 'spec:letters-waiting', option_id: 'ship' }] })).status).toBe(200)
    const lines = (await decisionsFile()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => l.run_id)).toEqual(['2026-10-04T05:37:45Z-97246', '2026-10-04T05:37:45Z-97246'])
    const run = await (await fetch(`${API}/api/day/runs/${RUN}`)).json()
    expect(run.view.issues.find((i: IssueView) => i.fp === 'spec:letters-waiting').decision.option_id).toBe('ship')
  })

  it('a connection Fix line carries the step from the run, not from the request', async () => {
    await seed({ [RUN]: synthReport() })
    await post({ run_id: RUN, decisions: [{ kind: 'connection', target: 'sentry', step: 'rm -rf /' }] })
    const d = JSON.parse(await decisionsFile())
    expect(d.step).toBe(synthReport().connections[0].fix_step)
  })

  it('a batch is all-or-nothing', async () => {
    await seed({ [RUN]: synthReport() })
    const res = await post({ run_id: RUN, decisions: [
      { kind: 'option', target: 'spec:letters-waiting', option_id: 'after' },
      { kind: 'option', target: 'nope:x', option_id: 'agent' },
    ] })
    expect(res.status).toBe(409)
    expect(await decisionsFile()).toBe('')
  })

  it('RULE 4 — a decision for a run that is not the latest, or a target not in that run, is refused (409)', async () => {
    await seed({ [RUN]: synthReport(), '2026-10-03T05-05-00Z': synthEarlier() })
    expect((await post({ run_id: '2026-10-03T05-05-00Z', decisions: [{ kind: 'option', target: 'rules:live-not-on-main', option_id: 'agent' }] })).status).toBe(409)
    expect((await post({ run_id: RUN, decisions: [{ kind: 'option', target: 'gone:x', option_id: 'agent' }] })).status).toBe(409)
    expect((await post({ run_id: RUN, decisions: [{ kind: 'reflection', target: 'zz', position: 1 }] })).status).toBe(409)
    expect((await post({ run_id: 'unknown-run', decisions: [{ kind: 'connection', target: 'sentry' }] })).status).toBe(409)
    expect(await decisionsFile()).toBe('')
  })

  it('refuses a bad body (400) and a non-JSON content type (415)', async () => {
    await seed({ [RUN]: synthReport() })
    expect((await post({ run_id: RUN, decisions: [{ kind: 'hold', target: 'x' }] })).status).toBe(400)
    expect((await post({ run_id: RUN })).status).toBe(400)
    expect((await post(JSON.stringify({ run_id: RUN, decisions: [] }), { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect(await decisionsFile()).toBe('')
  })

  it('RULE 5 — reading runs, paging through them and reading the prompt writes nothing', async () => {
    await seed({ [RUN]: synthReport(), '2026-10-03T05-05-00Z': synthEarlier() })
    for (let i = 0; i < 3; i++) {
      await fetch(`${API}/api/day`)
      await fetch(`${API}/api/day/runs/${RUN}`)
      await fetch(`${API}/api/day/runs/2026-10-03T05-05-00Z`)
      await fetch(`${API}/api/day/prompt`)
    }
    expect(await readdir(dir)).toEqual(['reports'])
  })

  it('the prompt endpoint builds from the latest run plus the decisions file', async () => {
    await seed({ [RUN]: synthReport() })
    await post({ run_id: RUN, decisions: [{ kind: 'option', target: 'rules:live-not-on-main', option_id: 'ask', text: 'Which two?' }] })
    const body = await (await fetch(`${API}/api/day/prompt`)).json()
    expect(body.run_id).toBe(RUN)
    expect(body.count).toBe(13)
    expect(body.prompt).toContain('Which two?')
  })

  it('privacy: report and decision content never reaches the logs', async () => {
    await seed({ [RUN]: synthReport(), bad: `{ ${SECRET}` })
    await writeFile(join(dir, 'decisions.jsonl'), `garbage ${SECRET}\n`)
    await fetch(`${API}/api/day`)
    await fetch(`${API}/api/day/runs/${RUN}`)
    await fetch(`${API}/api/day/runs/bad`)
    await fetch(`${API}/api/day/prompt`)
    await post({ run_id: RUN, decisions: [{ kind: 'option', target: 'spec:letters-waiting', option_id: 'other', text: `note ${SECRET}` }] })
    await post({ run_id: RUN, decisions: [{ kind: 'option', target: `x:${SECRET.toLowerCase()}`, option_id: 'agent' }] })
    expect(logs.join('\n')).not.toContain(SECRET)
    expect(logs.join('\n').toLowerCase()).not.toContain(SECRET.toLowerCase())
  })

  it('refuses a non-loopback Host (DNS rebinding)', async () => {
    await seed({ [RUN]: synthReport() })
    const status = await new Promise<number>((res) => {
      const req = httpRequest({ host: '127.0.0.1', port: PORT, path: '/api/day', headers: { Host: 'evil.example' } }, (r) => res(r.statusCode ?? 0))
      req.end()
    })
    expect(status).toBe(403)
  })
})

describe('day v2: rule 10 — the board bundle imports no product code', () => {
  it('no file under tools/kanban/src imports Supabase or anything outside tools/kanban', async () => {
    const root = resolve(__dirname, '../../src')
    const offenders: string[] = []
    async function walk(d: string) {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) { await walk(p); continue }
        if (!/\.(tsx?|css)$/.test(e.name)) continue
        const text = await readFile(p, 'utf-8')
        for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
          const spec = m[1]
          if (/supabase|@\/|auth/i.test(spec)) offenders.push(`${p}: ${spec}`)
          if (spec.startsWith('.') && !resolve(d, spec).startsWith(resolve(__dirname, '../..'))) offenders.push(`${p}: ${spec}`)
        }
      }
    }
    await walk(root)
    expect(offenders).toEqual([])
  })
})
