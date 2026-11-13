// P1673: weekly insights are ordinary finding cards. Synthetic fixtures only (fixtures/day-fixture.ts).
import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { app } from '../api'
import { KANBAN_CONFIG } from '../../config'
import { writeRead } from '../analyticsStore'
import {
  INSIGHT_FP,
  buildView,
  collect,
  decisionTargetExists,
  insightIssue,
  isInsightCard,
  parseReport,
  pendingPreselected,
  stillYours,
  validateDecisionInput,
  withInsights,
  type DayReport,
  type IssueView,
} from '../../src/lib/day'
import { cardState } from '../../src/lib/day'
import type { Insight, StoredRead } from '../../src/lib/weeklyRead'
import { synthEarlier, synthReport } from './fixtures/day-fixture'

const ORIGIN = `http://localhost:${KANBAN_CONFIG.ports.frontend}`
const RUN = '2026-10-04T05-37-45Z'

const insight = (key: string, over: Partial<Insight> = {}): Insight => ({
  key,
  observation: `Obs ${key}`,
  numbers: '102 dead clicks',
  base: 'base 40 sessions',
  comparison: 'vs 12 last week',
  confidence: 'medium',
  next_step: 'Open the linked replay or report and decide whether it is a real user problem',
  seen_count: 0,
  pattern: false,
  link: 'https://eu.mixpanel.com/p/AAA111',
  ...over,
})
// a key like the weekly gate writes: spaces and colons, which a fingerprint may not carry
const SHIFT = 'shift:who:Real visitors:up'

const parsed = (r: DayReport): DayReport => {
  const p = parseReport(JSON.parse(JSON.stringify(r)))
  if (p.kind !== 'ok') throw new Error('fixture did not parse')
  return p.report
}
const viewOf = (insights: Insight[]) => buildView(withInsights(parsed(synthReport()), insights), [])

describe('P1673 insight cards in the view', () => {
  it('is one normal card: Point A / Obstacle / Point B, More info, two choices, a tag key', () => {
    const c = insightIssue(insight(SHIFT))
    expect(c.fp.startsWith(INSIGHT_FP)).toBe(true)
    expect(c.fp).toMatch(/^[A-Za-z0-9._:-]{1,100}$/) // the decision route's fingerprint rule
    expect(c.title).toBe(`Obs ${SHIFT}`)
    expect(c.point_a).toBe('102 dead clicks, first week it is raised')
    expect(c.obstacle).toContain('Not yet known whether this is a real user problem')
    expect(c.obstacle).toContain('medium')
    expect(c.point_b).toBe('Open the linked replay or report and decide whether it is a real user problem')
    expect(c.more_info).toContain('Base: base 40 sessions')
    expect(c.more_info).toContain('Comparison: vs 12 last week')
    expect(c.more_info).toContain('Confidence: medium')
    expect(c.options.map((o) => [o.id, o.label])).toEqual([
      ['confirm', 'Real problem'],
      ['dismiss', 'Not a problem'],
    ])
    expect(c.options.some((o) => o.agent || o.recommended)).toBe(false)
    expect(c.insight_key).toBe(SHIFT)
    expect(c.insight_link).toBe('https://eu.mixpanel.com/p/AAA111')
  })

  it('point B is the insight own next step, whatever its type; the repeat pattern is in More info', () => {
    const c = insightIssue(insight('failure:k', { next_step: 'Look at the failing step', seen_count: 3, pattern: true }))
    expect(c.point_b).toBe('Look at the failing step')
    expect(c.more_info).toContain('Pattern: seen 3 times before')
    expect(c.point_a).toContain('raised 3 times before')
    expect(insightIssue(insight('failure:k2')).more_info).not.toContain('Pattern')
  })

  it('no link, no link field: Where to look is omitted', () => {
    expect(insightIssue(insight('k', { link: undefined })).insight_link).toBeUndefined()
  })

  it('insight cards lead the list, whatever the other cards rank', () => {
    const v = viewOf([insight('a'), insight('b')])
    const first = v.issues.slice(0, 2)
    expect(first.every(isInsightCard)).toBe(true)
    expect(v.issues.slice(2).some(isInsightCard)).toBe(false)
    expect(v.issues.length).toBe(viewOf([]).issues.length + 2)
  })

  it('nothing is preselected and nothing is agent work: no recommended answer, no Accept', () => {
    const v = viewOf([insight('a')])
    const i = v.issues[0]
    expect(i.recommended_index).toBe(-1)
    expect(i.options[i.recommended_index]).toBeUndefined()
    expect(cardState(i)).toMatchObject({ kind: 'open', recommended: '' })
  })

  it('an unanswered insight is never sent and never "still yours"', () => {
    const base = viewOf([])
    const withI = viewOf([insight('a'), insight('b')])
    expect(collect(withI).count).toBe(collect(base).count)
    expect(stillYours(withI).length).toBe(stillYours(base).length)
  })

  it('an insight is never sent to the agent, answered or not: its text comes from analytics data', () => {
    const fp = insightIssue(insight('a')).fp
    const r = withInsights(parsed(synthReport()), [insight('a')])
    const v = buildView(r, [{ run_id: r.pass_id, at: '2026-10-04T08:00:00Z', kind: 'option', target: fp, option_id: 'own', text: 'Which page?' }])
    expect(collect(v).count).toBe(collect(viewOf([])).count)
    expect(collect(v).issues.some((x) => x.issue.fp === fp)).toBe(false)
    expect(cardState(v.issues.find((i: IssueView) => i.fp === fp) as IssueView).kind).toBe('answered')
  })

  it('insights keep the order the weekly read raised them in, not alphabetical', () => {
    const v = viewOf([insight('zeta'), insight('alpha'), insight('mid')])
    expect(v.issues.slice(0, 3).map((i) => i.insight_key)).toEqual(['zeta', 'alpha', 'mid'])
  })

  it('nothing else that counts the day treats an insight as work: no preselected write', () => {
    expect(pendingPreselected(viewOf([insight('a')])).length).toBe(pendingPreselected(viewOf([])).length)
  })

  it('two insights with the same key are one card', () => {
    const r = withInsights(parsed(synthReport()), [insight('a'), insight('a')])
    expect(r.issues.filter((i) => i.fp.startsWith(INSIGHT_FP))).toHaveLength(1)
  })

  it('two insights of one read get two different fingerprints, stable across reads', () => {
    const a = insightIssue(insight('shift:who:Real visitors:up')).fp
    const b = insightIssue(insight('shift:who:Real visitors:down')).fp
    expect(a).not.toBe(b)
    expect(insightIssue(insight('shift:who:Real visitors:up')).fp).toBe(a)
    expect(a).toMatch(/^insight:[0-9a-f]{16}$/)
  })

  it('a report with no undecided insight is unchanged', () => {
    const r = parsed(synthReport())
    expect(withInsights(r, [])).toBe(r)
  })

  it('a free-text answer on an insight is a decision on its fingerprint, and the card stays', () => {
    const fp = insightIssue(insight('a')).fp
    const r = withInsights(parsed(synthReport()), [insight('a')])
    const v = buildView(r, [{ run_id: r.pass_id, at: '2026-10-04T08:00:00Z', kind: 'option', target: fp, option_id: 'own', text: 'Which page?' }])
    const card = v.issues.find((i: IssueView) => i.fp === fp)
    expect(card?.decision?.text).toBe('Which page?')
    expect(cardState(card as IssueView).kind).toBe('answered')
  })
})

describe('P1673 decision route rules', () => {
  const r = withInsights(parsed(synthReport()), [insight('a')])
  const fp = insightIssue(insight('a')).fp
  it('a free-text answer on an insight is accepted; confirm and dismiss are not decision lines', () => {
    const own = validateDecisionInput({ kind: 'option', target: fp, option_id: 'own', text: 'Which page?' })
    expect(own.ok && decisionTargetExists(r, own.decision)).toBe(true)
    expect(decisionTargetExists(r, { kind: 'option', target: fp, option_id: 'confirm' })).toBe(false)
    expect(decisionTargetExists(r, { kind: 'option', target: fp, option_id: 'dismiss' })).toBe(false)
  })
  it('an insight that is not in the run is not something to decide on', () => {
    expect(decisionTargetExists(r, { kind: 'option', target: `${INSIGHT_FP}deadbeef`, option_id: 'own', text: 'x' })).toBe(false)
  })
})

describe('P1673 routes', () => {
  let server: ReturnType<typeof createServer>
  let API: string
  let dir: string
  let dayDir: string

  const READ_DATE = '2026-11-02'
  const read = (insights: Insight[], status: 'collected' | 'not-collected' = 'collected'): StoredRead =>
    ({ date: READ_DATE, status, headline: 'h', insights }) as unknown as StoredRead
  const seedRuns = async (runs: Record<string, unknown>) => {
    await mkdir(join(dayDir, 'reports'), { recursive: true })
    for (const [id, body] of Object.entries(runs)) await writeFile(join(dayDir, 'reports', `${id}.json`), JSON.stringify(body))
  }
  const getRun = async (id = RUN) => (await fetch(`${API}/api/day/runs/${id}`)).json()
  const decideWeekly = (body: unknown) =>
    fetch(`${API}/api/day/analytics/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) })
  const postDecisions = (decisions: unknown[]) =>
    fetch(`${API}/api/day/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id: RUN, decisions }) })
  const ledger = () => readFile(join(dir, 'ledger.jsonl'), 'utf-8').catch(() => '')
  const decisionsFile = () => readFile(join(dayDir, 'decisions.jsonl'), 'utf-8').catch(() => '')
  const insightCards = (run: { view: { issues: IssueView[] } }) => run.view.issues.filter(isInsightCard)

  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    API = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'p1673-an-'))
    dayDir = await mkdtemp(join(tmpdir(), 'p1673-day-'))
    process.env.KANBAN_ANALYTICS_DIR = dir
    process.env.KANBAN_DAY_DIR = dayDir
  })
  afterEach(async () => {
    delete process.env.KANBAN_ANALYTICS_DIR
    delete process.env.KANBAN_DAY_DIR
    await rm(dir, { recursive: true, force: true })
    await rm(dayDir, { recursive: true, force: true })
  })

  it('the latest run carries each undecided insight as a card; the report file itself does not', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight(SHIFT), insight('failure:k')]))
    const run = await getRun()
    expect(insightCards(run)).toHaveLength(2)
    expect(run.report.issues.some((i: IssueView) => isInsightCard(i))).toBe(false)
    expect(run.insightsError).toBe(false)
  })

  it('an earlier run shows none', async () => {
    await seedRuns({ [RUN]: synthReport(), '2026-10-03T05-05-00Z': synthEarlier() })
    writeRead(dir, read([insight('a')]))
    const run = await getRun('2026-10-03T05-05-00Z')
    expect(run.isLatest).toBe(false)
    expect(insightCards(run)).toHaveLength(0)
  })

  it('the real-problem choice records a confirm and the card leaves; not-a-problem records a dismiss', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight(SHIFT), insight('failure:k')]))
    const [a, b] = insightCards(await getRun())
    expect((await decideWeekly({ key: a.insight_key, decision: 'confirm' })).status).toBe(200)
    expect((await decideWeekly({ key: b.insight_key, decision: 'dismiss' })).status).toBe(200)
    const lines = (await ledger()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => [l.key, l.decision])).toEqual([
      [a.insight_key, 'confirm'],
      [b.insight_key, 'dismiss'],
    ])
    expect(insightCards(await getRun())).toHaveLength(0)
    // neither choice is a decision line in the run
    expect(await decisionsFile()).toBe('')
  })

  it('an unreadable ledger on a decision is a server error, not a stale card, and writes nothing', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight('a')]))
    await mkdir(join(dir, 'ledger.jsonl')) // exists, cannot be read as a file
    expect((await decideWeekly({ key: 'a', decision: 'confirm' })).status).toBe(500)
  })

  it('a second decision on the same insight is refused and writes nothing: no double count, no flip', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight('a')]))
    expect((await decideWeekly({ key: 'a', decision: 'confirm' })).status).toBe(200)
    expect((await decideWeekly({ key: 'a', decision: 'confirm' })).status).toBe(409)
    expect((await decideWeekly({ key: 'a', decision: 'dismiss' })).status).toBe(409)
    expect((await ledger()).trim().split('\n')).toHaveLength(1)
  })

  it('a dismissed insight does not come back; a confirmed one of an older read does', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight('a'), insight('b')]))
    await writeFile(
      join(dir, 'ledger.jsonl'),
      [JSON.stringify({ key: 'a', decision: 'dismiss', at: '2026-10-01T00:00:00Z' }), JSON.stringify({ key: 'b', decision: 'confirm', at: '2026-10-01T00:00:00Z' })].join('\n') + '\n',
    )
    expect(insightCards(await getRun()).map((c) => c.insight_key)).toEqual(['b'])
  })

  it('the decision route refuses confirm/dismiss on an insight card and writes nothing', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight('a')]))
    const [card] = insightCards(await getRun())
    for (const option_id of ['confirm', 'dismiss']) {
      expect((await postDecisions([{ kind: 'option', target: card.fp, option_id }])).status).toBe(409)
    }
    expect(await decisionsFile()).toBe('')
  })

  it('a free-text answer is saved, survives a reload, and leaves the card in the list; it writes nothing to the ledger', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight('a')]))
    const [card] = insightCards(await getRun())
    const res = await postDecisions([{ kind: 'option', target: card.fp, option_id: 'own', text: 'Which page was it?' }])
    expect(res.status).toBe(200)
    const [after] = insightCards(await getRun())
    expect(after.fp).toBe(card.fp)
    expect(after.decision).toMatchObject({ option_id: 'own', text: 'Which page was it?' })
    expect(await ledger()).toBe('')
  })

  it('an insight the read does not carry is not something to decide on', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([]))
    expect((await postDecisions([{ kind: 'option', target: `${INSIGHT_FP}deadbeef`, option_id: 'own', text: 'x' }])).status).toBe(409)
  })

  it('no undecided insight, a not-collected read, or no read at all: no extra card, no error', async () => {
    await seedRuns({ [RUN]: synthReport() })
    expect(insightCards(await getRun())).toHaveLength(0) // no read
    writeRead(dir, read([insight('a')], 'not-collected'))
    const nc = await getRun()
    expect(insightCards(nc)).toHaveLength(0)
    expect(nc.insightsError).toBe(false)
  })

  it('an unreadable ledger is a failed load, never "nothing to decide" and never a dismissed card again', async () => {
    await seedRuns({ [RUN]: synthReport() })
    writeRead(dir, read([insight('a')]))
    await mkdir(join(dir, 'ledger.jsonl')) // exists, cannot be read as a file
    const run = await getRun()
    expect(run.insightsError).toBe(true)
    expect(insightCards(run)).toHaveLength(0)
  })
})
