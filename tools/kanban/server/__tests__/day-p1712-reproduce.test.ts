// P1712 /reproduce canaries: Day cards an agent cannot close come back every day.
// Each describe names the spec's root-cause item it proves. Every one FAILS before the fix.
// Synthetic fixtures only (fixtures/day-fixture.ts) — never the founder's ~/.claude-day or ~/.claude-analytics.
import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { app } from '../api'
import { writeRead } from '../analyticsStore'
import {
  INSIGHT_LOOK,
  buildPrompt,
  buildView,
  carriedNotes,
  insightIssue,
  isInsightCard,
  parseReport,
  withInsights,
  type DayDecision,
  type DayReport,
  type IssueView,
} from '../../src/lib/day'
import type { Insight, StoredRead } from '../../src/lib/weeklyRead'
import { synthEarlier, synthReport } from './fixtures/day-fixture'

const RUN = '2026-10-04T05-37-45Z' // synthReport: started 2026-10-04
const EARLIER = '2026-10-03T05-05-00Z' // synthEarlier

/** A failure insight exactly as the weekly gate writes one the first week it is raised (analytics-gate.ts gate()). */
const deadClicks = (over: Partial<Insight> = {}): Insight => ({
  key: 'failure:dead_click',
  observation: 'A new kind of failure appeared: Dead clicks.',
  numbers: '102 this week',
  base: 'no earlier weekly read raised this failure',
  comparison: 'first week it is raised',
  confidence: 'medium',
  next_step: 'Open the linked replay or report and decide whether it is a real user problem.',
  seen_count: 0,
  pattern: false,
  link: 'https://eu.mixpanel.com/p/AAA111',
  ...over,
})

const parsed = (r: DayReport): DayReport => {
  const p = parseReport(JSON.parse(JSON.stringify(r)))
  if (p.kind !== 'ok') throw new Error('fixture did not parse')
  return p.report
}
const note = (target: string, text: string, run_id: string, at: string): DayDecision => ({ kind: 'option', target, option_id: 'own', text, is_question: false, run_id, at })
const opt = (target: string, option_id: string, run_id: string, at: string): DayDecision => ({ kind: 'option', target, option_id, run_id, at })

/** Everything on a card the founder can read on the Day page. */
const founderText = (c: Pick<IssueView, 'title' | 'point_a' | 'obstacle' | 'point_b' | 'more_info'>) =>
  [c.title, c.point_a, c.obstacle, c.point_b, c.more_info ?? ''].join('\n')

describe('P1712 routes (items 1, 2, 4)', () => {
  let server: ReturnType<typeof createServer>
  let API: string
  let anDir: string
  let dayDir: string

  const read = (date: string, insights: Insight[]): StoredRead => ({ date, status: 'collected', headline: 'h', insights }) as unknown as StoredRead
  const getRun = async (id = RUN) => (await fetch(`${API}/api/day/runs/${id}`)).json()
  const insightCards = (run: { view: { issues: IssueView[] } }): IssueView[] => run.view.issues.filter(isInsightCard)

  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    API = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  beforeEach(async () => {
    anDir = await mkdtemp(join(tmpdir(), 'p1712-an-'))
    dayDir = await mkdtemp(join(tmpdir(), 'p1712-day-'))
    process.env.KANBAN_ANALYTICS_DIR = anDir
    process.env.KANBAN_DAY_DIR = dayDir
    await mkdir(join(dayDir, 'reports'), { recursive: true })
    await writeFile(join(dayDir, 'reports', `${RUN}.json`), JSON.stringify(synthReport()))
  })
  afterEach(async () => {
    delete process.env.KANBAN_ANALYTICS_DIR
    delete process.env.KANBAN_DAY_DIR
    await rm(anDir, { recursive: true, force: true })
    await rm(dayDir, { recursive: true, force: true })
  })

  // Items 1 + 2: on 2026-11-19 the card showed the 2026-11-12 read as "this week, first week it is raised"
  // and asked whether it was "a real user problem", four days running.
  it('items 1+2: a card from a read 7 days older than the run shows the read date and never "first week" / "this week" / "real user problem"', async () => {
    writeRead(anDir, read('2026-09-27', [deadClicks()]))
    const [card] = insightCards(await getRun())
    expect(card, 'the insight card is on the latest run').toBeDefined()
    const text = founderText(card)
    expect.soft(text, 'the read date is shown').toContain('2026-09-27')
    expect.soft(text, 'an old read is not "first week it is raised"').not.toMatch(/first week it is raised/i)
    expect.soft(text, 'an old read is not "this week"').not.toMatch(/this week/i)
    expect.soft(text, 'the founder is never asked whether it is real').not.toMatch(/real user problem/i)
  })

  // Item 4: a confirm hides a key only until the next read, so a confirmed-and-fixed problem whose count
  // never reaches zero comes straight back. Founder decision 2026-11-19: hidden 30 days, or until the count doubles.
  it('item 4: a confirmed insight does not come back on the next read within 30 days when its count has not doubled', async () => {
    writeRead(anDir, read('2026-09-20', [deadClicks()]))
    writeRead(anDir, read('2026-09-27', [deadClicks({ observation: 'A failure is still happening: Dead clicks.', numbers: '110 this week', seen_count: 1 })]))
    await writeFile(join(anDir, 'ledger.jsonl'), JSON.stringify({ key: 'failure:dead_click', decision: 'confirm', at: '2026-09-21T09:00:00.000Z' }) + '\n')
    expect(insightCards(await getRun()).map((c) => c.insight_key)).toEqual([])
  })

  it('item 4 guard (passes today, must still pass): a confirm older than 30 days does not hide the next read', async () => {
    writeRead(anDir, read('2026-09-27', [deadClicks({ numbers: '110 this week', seen_count: 1 })]))
    await writeFile(join(anDir, 'ledger.jsonl'), JSON.stringify({ key: 'failure:dead_click', decision: 'confirm', at: '2026-08-01T09:00:00.000Z' }) + '\n')
    expect(insightCards(await getRun()).map((c) => c.insight_key)).toEqual(['failure:dead_click'])
  })
})

// Item 3: the evaluated-fingerprint list included insight fps, but day-evaluated.ts records verdicts only
// for the report's own issues; insight cards are added by the server (withInsights), so a day-evaluated
// verdict on an insight fp never hides the card. The prompt must name exactly ONE verdict command per insight.
describe('P1712 item 3: one verdict command per insight in the fixing prompt', () => {
  it('an insight sent with "Look into it" appears once as a --fp target (day-insight), never under "Fingerprints to record"', () => {
    const fp = insightIssue(deadClicks()).fp
    const r = withInsights(parsed(synthReport()), [deadClicks()])
    const v = buildView(r, [opt(fp, INSIGHT_LOOK, RUN, '2026-10-04T08:00:00Z')])
    const p = buildPrompt(r, v, new Set(), undefined, { ledger: [], cli: 's', evaluatedCli: 'ev-cli', insightCli: 'insight-cli' })
    expect(p, 'the insight verdict command is named').toContain(`insight-cli --fp ${fp}`)
    const recordList = p.includes('Fingerprints to record') ? p.slice(p.indexOf('Fingerprints to record')) : ''
    expect.soft(recordList, 'the day-evaluated list does not offer the insight fp').not.toContain(fp)
    expect.soft(p.match(new RegExp(`--fp ${fp}(?![0-9a-f])`, 'g'))?.length ?? 0, 'exactly one verdict command names the insight').toBe(1)
  })
})

// Item 5: carriedNotes keeps only the latest choice per card. A note written on an earlier run and never
// delivered, then replaced by a different pick, is neither sent nor flagged (the 2026-11-16..19 shape:
// notes on the Dead clicks card, then "Look into it" on 11-19).
describe('P1712 item 5: a note replaced by a later pick before it was sent still reaches Start fixing', () => {
  const earlier = () => parsed(synthEarlier())
  const NOTE = 'Fourth time this card is back, please look at the replays'

  it('insight card: an undelivered note from an earlier run, then "Look into it" today: the note is in the prompt', () => {
    const fp = insightIssue(deadClicks()).fp
    const r = withInsights(parsed(synthReport()), [deadClicks()])
    const lines = [note(fp, NOTE, EARLIER, '2026-10-03T06:00:00Z'), opt(fp, INSIGHT_LOOK, RUN, '2026-10-04T08:00:00Z')]
    const carried = carriedNotes(lines, r, [], [earlier(), parsed(synthReport())])
    const p = buildPrompt(r, buildView(r, lines), new Set(), undefined, { ledger: [], cli: 's', insightCli: 'insight-cli', carried })
    expect(p).toContain(NOTE)
  })

  it('ordinary card: an undelivered note from an earlier run, then a different option today: the note is in the prompt', () => {
    const r = parsed(synthReport())
    const lines = [note('credits:baseline', NOTE, EARLIER, '2026-10-03T06:00:00Z'), opt('credits:baseline', 'read', RUN, '2026-10-04T08:00:00Z')]
    const carried = carriedNotes(lines, r, [], [earlier(), r])
    const p = buildPrompt(r, buildView(r, lines), new Set(), undefined, { ledger: [], cli: 's', carried })
    expect(p).toContain(NOTE)
  })
})
