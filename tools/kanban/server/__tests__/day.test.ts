import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect, vi } from 'vitest'
import { app } from '../api'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildAgentPrompt,
  buildView,
  compareItems,
  daysOpen,
  parseDecisions,
  validateDecision,
  validateReport,
  type DayDecision,
  type DayItem,
  type DayReport,
} from '../../src/lib/day'

/**
 * P1399 — the Day page. Synthetic fixtures only: no real /day report content enters this
 * suite, its logs or its assertions (P1317 precedent). KANBAN_DAY_DIR points at a temp dir.
 */

const SECRET = 'FIXTURE-SECRET-DAY-91c2'

function report(over: Partial<DayReport> = {}): DayReport {
  return {
    schema: 1,
    pass_id: 'run-b',
    started_at: '2026-10-04T05:37:45Z',
    since: '2026-10-03T23:00:00Z',
    state: 'complete',
    done: [{ label: 'Prod smoke', result: '8 of 8 passed', ok: true }],
    readings: [{ name: 'Money', text: 'cloud 19 of 400 this month' }],
    checks: [
      { id: 'smoke', label: 'Prod smoke', status: 'ok' },
      { id: 'rls', label: 'Access rules drift', status: 'problem' },
      { id: 'floor', label: 'Privilege floor', status: 'unproven', detail: 'exit code line printed blank' },
      { id: 'mixpanel', label: 'Mixpanel', status: 'skipped' },
    ],
    items: [
      {
        fp: 'fp-answer-spec',
        group: 'answer',
        area: 'product',
        title: `A spec waits for your OK ${SECRET}`,
        why: 'It has waited 37 days.',
        first_seen: '2026-08-28',
        options: ['ship', 'park'],
      },
      {
        fp: 'fp-agent-rls',
        group: 'agent',
        area: 'security',
        check: 'rls',
        title: 'New access rules appeared on live',
        why: 'The event on Tuesday uses them.',
        deadline: '2026-10-06',
        deadline_label: 'Event #2',
        evidence: 'four new policies',
        confidence: 'unverified',
      },
      {
        fp: 'fp-agent-old',
        group: 'agent',
        area: 'cost',
        title: 'Credit baseline is stale',
        why: 'The balance cannot be trusted.',
        first_seen: '2026-08-28',
      },
    ],
    detail: [{ title: 'Calendar concerns (2)', body: 'a\nb' }],
    ...over,
  }
}

describe('day rules (pure)', () => {
  it('rejects a report that arrives with an item already on hold — only the founder holds', () => {
    const r = report()
    ;(r.items[0] as unknown as { group: string }).group = 'hold'
    const v = validateReport(r)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.problems).toContain('item-0-hold-not-allowed')
  })

  it('rejects an answer item with no options, and a wrong schema version', () => {
    const r = report({ schema: 2 })
    delete r.items[0].options
    const v = validateReport(r)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.problems).toEqual(expect.arrayContaining(['schema-version', 'item-0-answer-without-options']))
  })

  it('a known-good report validates', () => {
    expect(validateReport(report()).ok).toBe(true)
  })

  // Known-bad control for invariant 1: the unproven "Privilege floor" check has no item
  // in the fixture, and must still appear under Give to an agent and never count as clean.
  it('a check that did not prove its result becomes a Give-to-an-agent item', () => {
    const view = buildView(report(), new Map(), '2026-10-04T06:00:00Z')
    const synth = view.agent.find((i) => i.check === 'floor')
    expect(synth?.synthetic).toBe(true)
    expect(synth?.title).toContain('could not be proven')
    expect(view.checks).toEqual({ total: 4, clean: 1, problems: 1, notRun: 1, skipped: 1 })
  })

  it('does not duplicate a not-run check the report already covers with an item', () => {
    const r = report()
    r.checks[2].status = 'not-run'
    r.items.push({ fp: 'fp-floor', group: 'agent', area: 'security', check: 'floor', title: 'Floor', why: 'x' })
    const view = buildView(r, new Map(), '2026-10-04')
    expect(view.agent.filter((i) => i.check === 'floor')).toHaveLength(1)
  })

  it('a check that found a problem but has no item gets one — a problem is never only a red row', () => {
    const r = report()
    r.checks.push({ id: 'sentry', label: 'Sentry errors', status: 'problem', detail: '1 new issue' })
    const view = buildView(r, new Map(), '2026-10-04')
    const synth = view.agent.find((i) => i.fp === 'check:sentry')
    expect(synth?.synthetic).toBe(true)
    expect(synth?.title).toContain('found a problem nobody wrote up')
    // the rls problem IS covered by an item, so it is not duplicated
    expect(view.agent.filter((i) => i.check === 'rls')).toHaveLength(1)
  })

  it('"not a problem" resolves an item as a false alarm, distinct from fixed', () => {
    const dec = new Map<string, DayDecision>([['fp-agent-old', { fp: 'fp-agent-old', action: 'dismiss', at: '2026-10-04T00:00:00Z' }]])
    const view = buildView(report(), dec, '2026-10-04')
    expect(view.resolved).toEqual([expect.objectContaining({ fp: 'fp-agent-old', resolution: expect.objectContaining({ action: 'dismiss' }) })])
  })

  it('orders by deadline, then days open, then title', () => {
    const a: DayItem = { fp: 'a1', group: 'agent', area: 'x', title: 'B', why: '', first_seen: '2026-09-01' }
    const b: DayItem = { fp: 'b1', group: 'agent', area: 'x', title: 'A', why: '', deadline: '2026-10-06' }
    const c: DayItem = { fp: 'c1', group: 'agent', area: 'x', title: 'C', why: '', first_seen: '2026-08-01' }
    const d: DayItem = { fp: 'd1', group: 'agent', area: 'x', title: 'A', why: '' }
    expect([a, b, c, d].sort(compareItems).map((i) => i.fp)).toEqual(['b1', 'c1', 'a1', 'd1'])
  })

  it('applies decisions: park and live snooze hold, expired snooze returns, answer and done resolve', () => {
    const dec = new Map<string, DayDecision>([
      ['fp-answer-spec', { fp: 'fp-answer-spec', action: 'park', note: 'parked until needed', at: '2026-10-02T00:00:00Z' }],
      ['fp-agent-old', { fp: 'fp-agent-old', action: 'snooze', until: '2026-10-05', at: '2026-10-04T00:00:00Z' }],
    ])
    let view = buildView(report(), dec, '2026-10-04T06:00:00Z')
    expect(view.hold.map((i) => i.fp).sort()).toEqual(['fp-agent-old', 'fp-answer-spec'])
    expect(view.hold.find((i) => i.fp === 'fp-answer-spec')?.hold?.reason).toBe('parked until needed')
    expect(view.answer).toHaveLength(0)

    view = buildView(report(), dec, '2026-10-05T06:00:00Z') // snooze ended
    expect(view.agent.some((i) => i.fp === 'fp-agent-old')).toBe(true)

    const resolved = new Map<string, DayDecision>([
      ['fp-answer-spec', { fp: 'fp-answer-spec', action: 'answer', answer: 'ship', at: '2026-10-04T00:00:00Z' }],
      ['fp-agent-rls', { fp: 'fp-agent-rls', action: 'done', at: '2026-10-04T00:00:00Z' }],
    ])
    view = buildView(report(), resolved, '2026-10-04')
    expect(view.resolved.map((r) => r.fp).sort()).toEqual(['fp-agent-rls', 'fp-answer-spec'])
    expect(view.answer).toHaveLength(0)
  })

  it('later decision lines win, and bad lines are counted, not echoed', () => {
    const text = [
      JSON.stringify({ fp: 'fp-x', action: 'park', at: '2026-10-01T00:00:00Z' }),
      `not json ${SECRET}`,
      JSON.stringify({ fp: 'fp-x', action: 'unhold', at: '2026-10-02T00:00:00Z' }),
    ].join('\n')
    const { latest, badLines } = parseDecisions(text)
    expect(badLines).toBe(1)
    expect(latest.get('fp-x')?.action).toBe('unhold')
  })

  it('validates decisions strictly', () => {
    expect(validateDecision({ fp: 'fp-x', action: 'snooze' }).ok).toBe(false)
    expect(validateDecision({ fp: 'fp-x', action: 'answer', answer: ' ' }).ok).toBe(false)
    expect(validateDecision({ fp: '../etc', action: 'done' }).ok).toBe(false)
    expect(validateDecision({ fp: 'fp-x', action: 'park', note: 'x'.repeat(501) }).ok).toBe(false)
    expect(validateDecision({ fp: 'fp-x', action: 'park', note: ' why ' })).toEqual({ ok: true, decision: { fp: 'fp-x', action: 'park', note: 'why' } })
  })

  it('days open is measured against the run date, not today', () => {
    expect(daysOpen(report().items[2], '2026-10-04T05:37:45Z')).toBe(37)
    expect(daysOpen(report().items[1], '2026-10-04')).toBeNull()
  })

  it('the hand-off prompt opens with verify-first and lists every agent item in order', () => {
    const view = buildView(report(), new Map(), '2026-10-04')
    const p = buildAgentPrompt(report(), view.agent)
    expect(p.split('\n').slice(0, 5).join(' ')).toMatch(/Verify every item yourself before acting/)
    expect(p.indexOf('New access rules')).toBeLessThan(p.indexOf('Credit baseline'))
    expect(p).toContain('Privilege floor: result could not be proven')
    expect(p).toContain('Not verified by the check itself.')
  })
})

describe('day API (synthetic day dir)', () => {
  let server: ReturnType<typeof createServer>
  let API: string
  let dir: string
  let logs: string[]
  const spies: ReturnType<typeof vi.spyOn>[] = []

  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    API = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'day-'))
    process.env.KANBAN_DAY_DIR = dir
    logs = []
    for (const m of ['log', 'warn', 'error'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))
    }
  })
  afterEach(async () => {
    spies.splice(0).forEach((s) => s.mockRestore())
    delete process.env.KANBAN_DAY_DIR
    await rm(dir, { recursive: true, force: true })
    // Invariant: nothing derived from report content reaches the logs.
    expect(logs.join('\n')).not.toContain(SECRET)
  })

  async function seed(runs: Record<string, unknown>) {
    await mkdir(join(dir, 'reports'), { recursive: true })
    for (const [id, body] of Object.entries(runs)) {
      await writeFile(join(dir, 'reports', `${id}.json`), typeof body === 'string' ? body : JSON.stringify(body))
    }
  }

  it('is off without KANBAN_DAY_DIR, and config says so', async () => {
    delete process.env.KANBAN_DAY_DIR
    expect(await (await fetch(`${API}/api/day`)).json()).toEqual({ enabled: false })
    expect((await (await fetch(`${API}/api/config`)).json()).dayEnabled).toBe(false)
    expect((await fetch(`${API}/api/day/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(404)
  })

  it('an absent dir is "absent", an empty one has no runs — neither looks like a normal day', async () => {
    process.env.KANBAN_DAY_DIR = join(dir, 'missing')
    expect(await (await fetch(`${API}/api/day`)).json()).toEqual({ enabled: true, state: 'absent', runs: [] })
    process.env.KANBAN_DAY_DIR = dir
    expect(await (await fetch(`${API}/api/day`)).json()).toEqual({ enabled: true, state: 'present', runs: [] })
  })

  it('lists runs newest first and flags an invalid run instead of dropping it', async () => {
    await seed({
      'run-a': report({ pass_id: 'run-a', started_at: '2026-10-02T05:00:00Z' }),
      'run-b': report(),
      'run-bad': `{"schema":1,"title":"${SECRET}"`,
    })
    const body = await (await fetch(`${API}/api/day`)).json()
    expect(body.runs.map((r: { id: string }) => r.id)).toEqual(['run-b', 'run-a', 'run-bad'])
    expect(body.runs[0]).toMatchObject({ valid: true, answer: 1, agent: 3, checksClean: 1, checksTotal: 4 })
    expect(body.runs[2]).toMatchObject({ valid: false, state: 'invalid' })
  })

  it('serves a run with the view; refuses path-like ids', async () => {
    await seed({ 'run-b': report() })
    const body = await (await fetch(`${API}/api/day/runs/run-b`)).json()
    expect(body.isLatest).toBe(true)
    expect(body.view.agent.length).toBe(3)
    expect((await fetch(`${API}/api/day/runs/..%2Fsecret`)).status).toBe(400)
    expect((await fetch(`${API}/api/day/runs/nope`)).status).toBe(404)
  })

  it('records a decision as one appended line and the run reflects it; earlier runs ignore decisions', async () => {
    await seed({ 'run-a': report({ pass_id: 'run-a', started_at: '2026-10-02T05:00:00Z' }), 'run-b': report() })
    const post = await fetch(`${API}/api/day/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fp: 'fp-answer-spec', action: 'park', note: `reason ${SECRET}` }),
    })
    expect(post.status).toBe(200)
    const lines = (await readFile(join(dir, 'decisions.jsonl'), 'utf-8')).trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ fp: 'fp-answer-spec', action: 'park' })

    const latest = await (await fetch(`${API}/api/day/runs/run-b`)).json()
    expect(latest.view.hold.map((i: { fp: string }) => i.fp)).toEqual(['fp-answer-spec'])
    const earlier = await (await fetch(`${API}/api/day/runs/run-a`)).json()
    expect(earlier.isLatest).toBe(false)
    expect(earlier.view.hold).toHaveLength(0)
  })

  it('accepts a decision on a synthesised not-run item, refuses one on an unknown item', async () => {
    await seed({ 'run-b': report() })
    const ok = await fetch(`${API}/api/day/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fp: 'unrun:floor', action: 'snooze', until: '2026-10-05' }),
    })
    expect(ok.status).toBe(200)
    const bad = await fetch(`${API}/api/day/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fp: 'fp-not-in-run', action: 'done' }),
    })
    expect(bad.status).toBe(409)
  })

  it('refuses a non-loopback Host (DNS rebinding)', async () => {
    await seed({ 'run-b': report() })
    const port = (server.address() as AddressInfo).port
    const res = await new Promise<number>((resolve) => {
      // fetch() forbids overriding Host, so use a raw request.
      import('http').then(({ request }) => {
        const req = request({ host: '127.0.0.1', port, path: '/api/day', headers: { Host: 'evil.example' } }, (r) => resolve(r.statusCode ?? 0))
        req.end()
      })
    })
    expect(res).toBe(403)
  })
})
