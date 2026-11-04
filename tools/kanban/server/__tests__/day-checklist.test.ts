import { describe, it, expect } from 'vitest'
import { buildView, parseReport, sentKey, type DayCheck, type DayConnection, type DayDecision, type DayIssue, type DayReport } from '../../src/lib/day'
import { buildChecklist, summaryParts } from '../../src/components/day/checklist'

/** P1609: where each check's problem went. Every text here is invented (public repo). */

const RUN = '2026-11-04T05-00-00Z'
const ok = (r: DayReport) => {
  const p = parseReport(JSON.parse(JSON.stringify(r)))
  if (p.kind !== 'ok') throw new Error(`fixture did not parse: ${p.kind}`)
  return p.report
}
const agentOpts = () => [
  { id: 'agent', label: 'Give to the agent', agent: true, recommended: true },
  { id: 'park', label: 'Park: stop asking until I bring it back' },
]
const mineOpts = () => [
  { id: 'revoke', label: 'Revoke it', recommended: true },
  { id: 'keep', label: 'Keep it' },
  { id: 'park', label: 'Park: stop asking until I bring it back' },
]
const issue = (fp: string, check: string | undefined, over: Partial<DayIssue> = {}): DayIssue => ({
  fp,
  topic: 'T',
  title: `Title ${fp}`,
  point_a: 'a',
  obstacle: 'o',
  point_b: 'b',
  options: agentOpts(),
  first_seen: '2026-11-04',
  ...(check ? { check } : {}),
  ...over,
})
const chk = (id: string, status: DayCheck['status'], connection?: string): DayCheck => ({ id, label: id, status, ...(connection ? { connection } : {}) })
const conn = (id: string, state: DayConnection['state']): DayConnection => ({ id, label: id, state })

function report(checks: DayCheck[], issues: DayIssue[], connections: DayConnection[] = []) {
  return ok({ schema: 2, pass_id: RUN, started_at: '2026-11-04T05:00:00Z', state: 'complete', connections, checks, issues } as DayReport)
}
const decision = (fp: string, option_id: string): DayDecision => ({ kind: 'option', target: fp, option_id, run_id: RUN, at: '2026-11-04T06:00:00Z' })
const rowOf = (cl: ReturnType<typeof buildChecklist>, id: string) => cl.rows.find((r) => r.check.id === id)!

describe('P1609 checklist: one destination per check', () => {
  const checks = [chk('mine', 'problem'), chk('bot', 'problem'), chk('done', 'problem'), chk('sent', 'problem'), chk('held', 'problem'), chk('later', 'problem'), chk('fine', 'problem'), chk('crash', 'not-run'), chk('lost', 'problem'), chk('good', 'ok'), chk('off', 'skipped')]
  const issues = [
    issue('mine:1', 'mine', { options: mineOpts() }),
    issue('bot:1', 'bot'),
    issue('done:1', 'done', { options: mineOpts() }),
    issue('sent:1', 'sent', { options: mineOpts() }),
    issue('held:1', 'held'),
    issue('later:1', 'later', { options: mineOpts() }),
    issue('fine:1', 'fine'),
    issue('crash:1', 'crash', { options: mineOpts() }),
  ]
  const lines = [decision('done:1', 'keep'), decision('sent:1', 'revoke'), { ...decision('later:1', 'park'), run_id: '2026-11-03T05-00-00Z', at: '2026-11-03T06:00:00Z' }]
  const view = buildView(report(checks, issues), lines)
  // waiting and accepted are decided by the runner's loops; place them where buildView would
  const move = (fp: string, to: 'waiting' | 'evaluated') => {
    const i = view.issues.find((x) => x.fp === fp)!
    view.issues.splice(view.issues.indexOf(i), 1)
    view[to].push(i)
  }
  // the view builder gives every card-less problem check a synthetic card; drop it to stage the defect
  view.issues = view.issues.filter((x) => x.check !== 'lost')
  move('held:1', 'waiting')
  move('fine:1', 'evaluated')
  const sent = { [sentKey.option('sent:1', 'revoke')]: '2026-11-04T07:00:00Z' }
  const cl = buildChecklist(view, sent)

  it('names the destination of every non-passing check', () => {
    const kinds = Object.fromEntries(cl.rows.map((r) => [r.check.id, r.dest.kind]))
    expect(kinds).toEqual({ mine: 'card', bot: 'agent', done: 'answered', sent: 'agent', held: 'waiting', later: 'parked', fine: 'accepted', crash: 'card', lost: 'none', good: 'ok', off: 'skipped' })
  })

  it('links only to places on screen, with the card to open', () => {
    expect(rowOf(cl, 'mine').dest.fp).toBe('mine:1')
    expect(rowOf(cl, 'done').dest.fp).toBe('done:1')
    expect(rowOf(cl, 'bot').dest.fp).toBe('bot:1')
    expect(rowOf(cl, 'held').dest.fp).toBeUndefined()
  })

  it('failing control: a check with no card is shown as a defect, never a blank row', () => {
    expect(rowOf(cl, 'lost').dest).toEqual({ kind: 'none', more: 0 })
    expect(cl.counts.none).toBe(1)
    expect(summaryParts(cl.counts).map((p) => p.text)).toContain('1 with no card')
  })

  it('a check whose card exists can never come out as "none"', () => {
    for (const r of cl.rows) if (issues.some((i) => i.check === r.check.id)) expect(r.dest.kind).not.toBe('none')
  })

  it('problems first (by who must act), then passes, then skipped', () => {
    expect(cl.rows.map((r) => r.check.id)).toEqual(['mine', 'crash', 'lost', 'bot', 'sent', 'held', 'later', 'fine', 'done', 'good', 'off'])
  })

  it('summary counts equal the rows they describe', () => {
    const c = cl.counts
    expect(c.total).toBe(checks.length)
    expect(c.card + c.none + c.fix + c.agent + c.waiting + c.parked + c.accepted + c.answered + c.ok + c.skipped).toBe(c.total)
    expect(summaryParts(c).map((p) => p.text)).toEqual(['2 for you', '2 with the agent', '1 clean', '1 answered', '1 waiting', '1 parked', '1 accepted', '1 skipped', '1 with no card'])
  })
})

describe('P1609 checklist: several cards, one check', () => {
  it('shows the card that most needs someone, with +N more', () => {
    const r = report([chk('multi', 'problem')], [issue('multi:a', 'multi'), issue('multi:b', 'multi', { options: mineOpts() }), issue('multi:c', 'multi')])
    const row = rowOf(buildChecklist(buildView(r, [])), 'multi')
    expect(row.dest).toEqual({ kind: 'card', fp: 'multi:b', more: 2 })
  })

  it('one answered card among open ones does not hide the open one', () => {
    const r = report([chk('multi', 'problem')], [issue('multi:a', 'multi', { options: mineOpts() }), issue('multi:b', 'multi', { options: mineOpts() })])
    const row = rowOf(buildChecklist(buildView(r, [decision('multi:a', 'keep')])), 'multi')
    expect(row.dest).toMatchObject({ kind: 'card', fp: 'multi:b', more: 1 })
  })
})

describe('P1609 checklist: connections', () => {
  it('a check under a broken connection reads Reconnect first, and the connection is counted', () => {
    const r = report([chk('mail', 'not-run', 'imap'), chk('ok1', 'ok')], [], [conn('imap', 'not-connected')])
    const cl = buildChecklist(buildView(r, []))
    expect(rowOf(cl, 'mail')).toMatchObject({ dest: { kind: 'fix' }, connection: 'imap' })
    expect(cl.connections.map((c) => c.id)).toEqual(['imap'])
    expect(summaryParts(cl.counts).map((p) => p.text)).toContain('1 to reconnect')
    expect(cl.counts.none).toBe(0)
  })

  it('a card on a check behind a broken connection wins over the connection', () => {
    const r = report([chk('mail', 'problem', 'imap')], [issue('mail:1', 'mail')], [conn('imap', 'not-connected')])
    expect(rowOf(buildChecklist(buildView(r, [])), 'mail').dest.kind).toBe('agent')
  })
})

describe('P1609 checklist: a run with zero problems', () => {
  it('counts only clean (and skipped) with no extra phrases', () => {
    const cl = buildChecklist(buildView(report([chk('a', 'ok'), chk('b', 'ok'), chk('c', 'skipped')], []), []))
    expect(summaryParts(cl.counts).map((p) => p.text)).toEqual(['0 for you', '0 with the agent', '2 clean', '1 skipped'])
    expect(cl.counts.total).toBe(3)
  })
})

describe('P1609 checklist: the view builder never produces "No card" by itself', () => {
  it('any problem or unproven check, with or without a written card, gets a destination', () => {
    const r = report([chk('written', 'problem'), chk('bare', 'problem'), chk('crash', 'not-run'), chk('weird', 'unproven')], [issue('written:1', 'written')])
    const cl = buildChecklist(buildView(r, []))
    expect(cl.counts.none).toBe(0)
    for (const row of cl.rows) expect(row.dest.kind).not.toBe('none')
  })
})

describe('P1609 review: covered_by naming a healthy connection', () => {
  it('stays visible as a defect, never hidden behind a reconnect', () => {
    const view = { checks: [{ id: 'k', label: 'k', status: 'problem', covered_by: 'healthy' }], connections: [{ id: 'healthy', label: 'h', state: 'ok' }], issues: [], parked: [], waiting: [], owned: [], evaluated: [] } as unknown as Parameters<typeof buildChecklist>[0]
    const cl = buildChecklist(view)
    expect(cl.rows[0].dest.kind).toBe('none')
    expect(summaryParts(cl.counts).map((p) => p.text)).toContain('1 with no card')
  })
})

describe('P1609 review: an issue owned by an open spec', () => {
  it('says so, and never points at the Waiting section it is not in', () => {
    const view = { checks: [{ id: 'k', label: 'k', status: 'problem' }], connections: [], issues: [], parked: [], waiting: [], owned: [{ fp: 'f', check: 'k' }], evaluated: [] } as unknown as Parameters<typeof buildChecklist>[0]
    const cl = buildChecklist(view)
    expect(cl.rows[0].dest.kind).toBe('owned')
    expect(summaryParts(cl.counts).map((p) => p.text)).toContain('1 in an open spec')
  })
})
