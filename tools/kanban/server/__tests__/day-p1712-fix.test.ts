// P1712 /fix: the cases the reproduce canaries (day-p1712-reproduce.test.ts) do not cover — the
// count-doubling half of the confirm rule, every undelivered note on one card, the day-evaluated
// refusal, and the card's date wording on a same-day read. Synthetic fixtures only.
import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { confirmHides, insightCount, recordInsightDecision, undecidedInsights, writeRead } from '../analyticsStore'
import { run as evaluatedCli } from '../../scripts/day-evaluated'
import { run as insightCli } from '../../scripts/day-insight'
import {
  INSIGHT_LOOK,
  PARK,
  buildPrompt,
  buildView,
  carriedNotes,
  collect,
  collectedKeys,
  insightIssue,
  parseReport,
  sentKey,
  withInsights,
  type DayDecision,
  type DayReport,
  type LaunchReceipt,
} from '../../src/lib/day'
import type { Insight, StoredRead } from '../../src/lib/weeklyRead'
import { synthReport } from './fixtures/day-fixture'

const RUN = '2026-10-04T05-37-45Z' // synthReport: started 2026-10-04

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
  ...over,
})
const readWith = (date: string, count: number, over: Partial<Insight> = {}): StoredRead =>
  ({ date, status: 'collected', headline: 'h', failures: [{ key: 'dead_click', label: 'Dead clicks', count }], insights: [deadClicks({ numbers: `${count} this week`, ...over })] }) as unknown as StoredRead
const parsed = (r: DayReport): DayReport => {
  const p = parseReport(JSON.parse(JSON.stringify(r)))
  if (p.kind !== 'ok') throw new Error('fixture did not parse')
  return p.report
}
const note = (target: string, text: string, run_id: string, at: string): DayDecision => ({ kind: 'option', target, option_id: 'own', text, is_question: false, run_id, at })
const opt = (target: string, option_id: string, run_id: string, at: string): DayDecision => ({ kind: 'option', target, option_id, run_id, at })

describe('P1712 item 4: a confirm hides its insight for 30 days, or until its count doubles', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p1712-fix-an-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const ledger = () => readFileSync(join(dir, 'ledger.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l))
  const keys = () => undecidedInsights(dir).insights.map((i) => i.key)

  it('a confirm records the count of the read it was made on; a dismiss records none', async () => {
    writeRead(dir, readWith('2026-09-20', 50))
    expect(await recordInsightDecision(dir, 'failure:dead_click', 'confirm', new Date('2026-09-21T09:00:00Z'))).toBe('recorded')
    expect(ledger()).toEqual([{ key: 'failure:dead_click', decision: 'confirm', at: '2026-09-21T09:00:00.000Z', count: 50 }])
  })

  it('the next read within 30 days: hidden at 99 (under double), back at exactly double (100)', async () => {
    writeRead(dir, readWith('2026-09-20', 50))
    await recordInsightDecision(dir, 'failure:dead_click', 'confirm', new Date('2026-09-21T09:00:00Z'))
    writeRead(dir, readWith('2026-09-27', 99, { seen_count: 1 }))
    expect(keys(), '99 is under double 50: still hidden').toEqual([])
    writeRead(dir, readWith('2026-09-27', 100, { seen_count: 1 }))
    expect(keys(), 'exactly double: shown again').toEqual(['failure:dead_click'])
    // shown again, it can be decided again: still one decision per raising, never a second on the same one
    expect(await recordInsightDecision(dir, 'failure:dead_click', 'confirm', new Date('2026-09-28T09:00:00Z'))).toBe('recorded')
    expect(await recordInsightDecision(dir, 'failure:dead_click', 'confirm', new Date('2026-09-28T09:01:00Z'))).toBe('not-undecided')
    expect(ledger().map((e) => e.count)).toEqual([50, 100])
  })

  it('the 30 days are measured to the read, not to today: day 29 hidden, day 30 shown', () => {
    const e = { key: 'failure:dead_click', decision: 'confirm' as const, at: '2026-09-01T00:00:00Z', count: 50 }
    expect(confirmHides(e, readWith('2026-09-30', 60))).toBe(true)
    expect(confirmHides(e, readWith('2026-10-01', 60))).toBe(false)
  })

  it('a confirm without a recorded count (written before P1712) only expires', () => {
    const e = { key: 'failure:dead_click', decision: 'confirm' as const, at: '2026-09-21T09:00:00Z' }
    expect(confirmHides(e, readWith('2026-09-27', 100_000))).toBe(true)
  })

  it('a dismiss is not a confirm: confirmHides never answers for it (dismiss stays permanent in undecidedInsights)', () => {
    expect(confirmHides({ key: 'failure:dead_click', decision: 'dismiss', at: '2026-09-21T09:00:00Z' }, readWith('2026-09-27', 1))).toBe(false)
  })

  it('the count comes from the read structure: a failure count, a shift row current value, none for a first', () => {
    const r = {
      date: '2026-09-27',
      status: 'collected',
      headline: 'h',
      insights: [],
      failures: [{ key: 'dead_click', label: 'Dead clicks', count: 7 }],
      sections: { who: { rows: [{ label: 'Real visitors: all', current: 140, previous: 80 }], reconciled: true } },
    } as unknown as StoredRead
    expect(insightCount(r, 'failure:dead_click')).toBe(7)
    expect(insightCount(r, 'shift:who:Real visitors: all:up')).toBe(140)
    expect(insightCount(r, 'first:someone')).toBeUndefined()
    expect(insightCount(r, 'failure:other')).toBeUndefined()
  })
})

describe('P1712 item 5: every note on a card that no launch sent is carried, each once', () => {
  const r = () => withInsights(parsed(synthReport()), [deadClicks()])
  const fp = insightIssue(deadClicks()).fp
  // the 2026-11-16..19 shape: one note on each of three earlier runs, then "Look into it" today
  const three = [
    note(fp, 'First: why is this back?', 'r16', '2026-10-01T06:00:00Z'),
    note(fp, 'Second: still here', 'r17', '2026-10-02T06:00:00Z'),
    note(fp, 'Third: please look at the replays', 'r18', '2026-10-03T06:00:00Z'),
  ]

  it('three notes on three days, then a pick: all three reach the prompt, in one insight block with one verdict command', () => {
    const lines = [...three, opt(fp, INSIGHT_LOOK, RUN, '2026-10-04T08:00:00Z')]
    const carried = carriedNotes(lines, r(), [], [r()])
    expect(carried.map((n) => n.text)).toEqual(['First: why is this back?', 'Second: still here', 'Third: please look at the replays'])
    const v = buildView(r(), lines)
    const c = collect(v, new Set(), undefined, carried)
    for (const n of three) expect(collectedKeys(c)).toContain(sentKey.option(fp, 'own', n.text as string))
    const p = buildPrompt(r(), v, new Set(), undefined, { ledger: [], cli: 's', evaluatedCli: 'ev-cli', insightCli: 'insight-cli', carried })
    for (const n of three) expect(p).toContain(n.text as string)
    expect(p.match(new RegExp(`--fp ${fp}(?![0-9a-f])`, 'g'))?.length).toBe(1)
  })

  it('three notes and no pick: still one block, one verdict command, all three notes', () => {
    const carried = carriedNotes(three, r(), [], [r()])
    const p = buildPrompt(r(), buildView(r(), three), new Set(), undefined, { ledger: [], cli: 's', insightCli: 'insight-cli', carried })
    for (const n of three) expect(p).toContain(n.text as string)
    expect(p.match(new RegExp(`--fp ${fp}(?![0-9a-f])`, 'g'))?.length).toBe(1)
  })

  it('once a launch carried a note it is not carried again; the others still are', () => {
    const launch: LaunchReceipt = { id: 's1', run_id: 'r17', at: '2026-10-02T07:00:00Z', state: 'started', items: [sentKey.option(fp, 'own', 'First: why is this back?')] }
    expect(carriedNotes([...three, opt(fp, INSIGHT_LOOK, RUN, '2026-10-04T08:00:00Z')], r(), [launch], [r()]).map((n) => n.text)).toEqual([
      'Second: still here',
      'Third: please look at the replays',
    ])
  })

  it('an edit on the same run is one note (its last text), never two', () => {
    const lines = [note(fp, 'Fourth time', 'r18', '2026-10-03T06:00:00Z'), note(fp, 'Fourth time this card is back', 'r18', '2026-10-03T06:00:30Z')]
    expect(carriedNotes(lines, r(), [], [r()]).map((n) => n.text)).toEqual(['Fourth time this card is back'])
  })

  it('a Park after the notes withdraws them (the founder said stop asking); notes after the Park still go', () => {
    const parked = [...three, opt(fp, PARK, 'r18', '2026-10-03T07:00:00Z')]
    expect(carriedNotes(parked, r(), [], [r()])).toEqual([])
    expect(carriedNotes([...parked, note(fp, 'Back again', 'r19', '2026-10-03T20:00:00Z')], r(), [], [r()]).map((n) => n.text)).toEqual(['Back again'])
  })

  it('clearing a pick on a later run does not withdraw an earlier run\'s note', () => {
    const lines = [note(fp, 'Look at it', 'r17', '2026-10-02T06:00:00Z'), opt(fp, INSIGHT_LOOK, 'r18', '2026-10-03T06:00:00Z'), { ...opt(fp, INSIGHT_LOOK, 'r18', '2026-10-03T06:01:00Z'), option_id: undefined, remove: true }]
    expect(carriedNotes(lines, r(), [], [r()]).map((n) => n.text)).toEqual(['Look at it'])
  })
})

describe('P1712 item 3: day-evaluated refuses an insight fingerprint', () => {
  it('exit 1, writes nothing, and names day-insight.ts', async () => {
    const d = mkdtempSync(join(tmpdir(), 'p1712-ev-'))
    try {
      mkdirSync(join(d, 'reports'))
      const fp = insightIssue(deadClicks()).fp
      let err = ''
      const code = await evaluatedCli(['--dir', d, '--fp', fp, '--cause', 'dead clicks on the logo', '--verdict', 'fixed', '--expires', '2026-11-20'], { out: () => {}, err: (s) => (err += s) }, {}, () => new Date('2026-11-01T00:00:00Z'))
      expect(code).toBe(1)
      expect(err).toContain('day-insight.ts')
      expect(err).toContain(`--fp ${fp}`)
      expect(() => readFileSync(join(d, 'decisions.jsonl'), 'utf-8')).toThrow()
      // must-allow: an ordinary fault is still recorded
      writeFileSync(join(d, 'decisions.jsonl'), '')
      expect(await evaluatedCli(['--dir', d, '--fp', 'cp.ops:x', '--cause', 'c', '--verdict', 'fixed', '--expires', '2026-11-20'], { out: () => {}, err: () => {} }, {}, () => new Date('2026-11-01T00:00:00Z'))).toBe(0)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })
})

describe('P1712 AC2: the one verdict command the prompt names removes the card', () => {
  it('day-insight.ts --fp <the prompt fp> --decision confirm: the card is gone from the next view of the run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'p1712-ac2-'))
    try {
      writeRead(dir, readWith('2026-10-01', 102))
      const cards = () => {
        const w = undecidedInsights(dir)
        return withInsights(parsed(synthReport()), w.insights, [], w.date).issues.filter((i) => i.insight_key)
      }
      const [card] = cards()
      expect(card).toBeDefined()
      const r = withInsights(parsed(synthReport()), undecidedInsights(dir).insights)
      const p = buildPrompt(r, buildView(r, [opt(card.fp, INSIGHT_LOOK, RUN, '2026-10-04T08:00:00Z')]), new Set(), undefined, { ledger: [], cli: 's', evaluatedCli: 'ev', insightCli: 'insight-cli' })
      expect(p).toContain(`insight-cli --fp ${card.fp} --decision confirm|dismiss`)
      expect(await insightCli(['--dir', dir, '--fp', card.fp, '--decision', 'confirm'], { out: () => {}, err: () => {} }, () => new Date('2026-10-04T09:00:00Z'))).toBe(0)
      expect(cards()).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('P1712 items 1+2: the card wording against the read date', () => {
  it('a read from the run day: its date, no age, and still no "this week" or "real user problem"', () => {
    const c = insightIssue(deadClicks(), { date: '2026-10-04', asOf: '2026-10-04T05:37:45Z' })
    expect(c.point_a).toBe('102 that week, not raised by any earlier read (weekly read of 2026-10-04)')
    expect(c.source).toBe('Weekly product read of 2026-10-04')
    expect([c.point_a, c.obstacle, c.point_b, c.more_info].join('\n')).not.toMatch(/this week|first week it is raised|real user problem/i)
  })

  it('a read one day old says "1 day old"; a repeat keeps its count of earlier raisings', () => {
    expect(insightIssue(deadClicks({ seen_count: 2, pattern: true }), { date: '2026-10-03', asOf: '2026-10-04T05:37:45Z' }).point_a).toBe('102 that week, raised 2 times before (weekly read of 2026-10-03, 1 day old)')
  })

  it('withInsights dates the cards against the run start', () => {
    const r = withInsights(parsed(synthReport()), [deadClicks()], [], '2026-09-27')
    const card = r.issues.find((i) => i.insight_key === 'failure:dead_click')
    expect(card?.point_a).toContain('(weekly read of 2026-09-27, 7 days old)')
  })
})
