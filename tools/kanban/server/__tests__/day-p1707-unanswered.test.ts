// P1707 AC6: a note that was delivered to the fixing agent and got no recorded answer is raised on
// the next /day run as its own finding. Every text here is invented (public repo).
import { describe, it, expect } from 'vitest'
import { allIssues, parseReport, sentKey, type DayDecision, type DayReport, type EvaluatedLine, type LaunchReceipt } from '../../src/lib/day'
import { buildReport, parseLedger, parseManifest, parseRegistry, validateReport, type Registries } from '../../scripts/day-render'
import { NOTE_WINDOW_DAYS, unansweredNotes } from '../../scripts/day-notes'
import { synthEarlier } from './fixtures/day-fixture'

const EARLIER = synthEarlier() // pass 2026-10-03T05-05-00Z, carries rules:live-not-on-main "Database rules are live before review"
const RUN = '2026-10-04T05-00-00Z'
const STARTED = '2026-10-04T05:00:00Z'
const FP = 'rules:live-not-on-main'
const TEXT = 'I already reconnected it, why is it still red?'

const noteLine = (over: Partial<DayDecision> = {}): DayDecision => ({ kind: 'option', target: FP, option_id: 'own', text: TEXT, is_question: true, run_id: EARLIER.pass_id, at: '2026-10-03T06:00:00Z', ...over })
const receipt = (over: Partial<LaunchReceipt> = {}): LaunchReceipt => ({ id: 's1', run_id: EARLIER.pass_id, at: '2026-10-03T06:30:00Z', state: 'started', items: [sentKey.option(FP, 'own', TEXT)], ...over })
const evaluated = (fps: string[], at: string): EvaluatedLine => ({ kind: 'evaluated', id: 'ev-1', fps, cause: 'named', verdict: 'fixed', expires: '2026-12-01', at })
const base = { report: { pass_id: RUN, started_at: STARTED }, earlier: [EARLIER] }

describe('P1707 unanswered-note check (pure)', () => {
  it('a delivered note with no later evaluated record is one finding naming the card and the date', () => {
    const out = unansweredNotes({ ...base, decisions: [noteLine()], receipts: [receipt()], evaluated: [] })
    expect(out).toHaveLength(1)
    const f = out[0]
    expect(f.fp).toMatch(/^day\.notes:unanswered:[0-9a-f]{16}$/)
    expect(f.check).toBe('day.notes')
    expect(f.title).toContain('Database rules are live before review')
    expect(f.point_a).toContain('2026-10-03')
    expect(f.point_a).toContain(TEXT)
    expect(f.options[0]).toMatchObject({ agent: true, recommended: true })
    expect(f.options.some((o) => o.id === 'park')).toBe(true)
    expect(f.first_seen).toBe('2026-10-03')
  })

  it('an evaluated record for the card after the delivery answers it', () => {
    expect(unansweredNotes({ ...base, decisions: [noteLine()], receipts: [receipt()], evaluated: [evaluated([FP], '2026-10-03T09:00:00Z')] })).toHaveLength(0)
  })

  it('an evaluated record on the finding itself answers it too (the agent was sent the finding)', () => {
    const fp = unansweredNotes({ ...base, decisions: [noteLine()], receipts: [receipt()], evaluated: [] })[0].fp
    expect(unansweredNotes({ ...base, decisions: [noteLine()], receipts: [receipt()], evaluated: [evaluated([fp], '2026-10-04T04:00:00Z')] })).toHaveLength(0)
  })

  it('an evaluated record from BEFORE the delivery does not answer it', () => {
    expect(unansweredNotes({ ...base, decisions: [noteLine()], receipts: [receipt()], evaluated: [evaluated([FP], '2026-10-02T09:00:00Z')] })).toHaveLength(1)
  })

  it('a note never delivered (no receipt, or only a failed launch) is not this check\'s finding', () => {
    expect(unansweredNotes({ ...base, decisions: [noteLine()], receipts: [], evaluated: [] })).toHaveLength(0)
    expect(unansweredNotes({ ...base, decisions: [noteLine()], receipts: [receipt({ state: 'failed' })], evaluated: [] })).toHaveLength(0)
  })

  it('not before one run has passed: a note sent from this same run is not raised yet', () => {
    expect(unansweredNotes({ ...base, decisions: [noteLine({ run_id: RUN })], receipts: [receipt({ run_id: RUN, at: '2026-10-04T05:30:00Z' })], evaluated: [] })).toHaveLength(0)
  })

  it(`a delivery older than ${NOTE_WINDOW_DAYS} days is no longer raised (bounded history)`, () => {
    const old = new Date(Date.parse(STARTED) - (NOTE_WINDOW_DAYS + 1) * 86_400_000).toISOString()
    expect(unansweredNotes({ ...base, decisions: [noteLine({ at: old })], receipts: [receipt({ at: old })], evaluated: [] })).toHaveLength(0)
  })

  it('a choice that is not a note (an option id) is not a note', () => {
    expect(unansweredNotes({ ...base, decisions: [noteLine({ option_id: 'agent', text: undefined })], receipts: [receipt({ items: [sentKey.option(FP, 'agent')] })], evaluated: [] })).toHaveLength(0)
  })

  it('the same note typed on two runs is one finding', () => {
    const second = noteLine({ run_id: 'x', at: '2026-10-03T07:00:00Z' })
    expect(unansweredNotes({ ...base, decisions: [noteLine(), second], receipts: [receipt()], evaluated: [] })).toHaveLength(1)
  })

  it('a note on a weekly insight is named without analytics text', () => {
    const fp = 'insight:0123456789abcdef'
    const out = unansweredNotes({ ...base, decisions: [noteLine({ target: fp })], receipts: [receipt({ items: [sentKey.option(fp, 'own', TEXT)] })], evaluated: [] })
    expect(out[0].title).toContain('a weekly insight')
  })
})

describe('P1707 unanswered-note check in the /day report', () => {
  const T = '\t'
  const registries = (): Registries => ({
    lists: [{ steps: parseManifest(['s.a', 'cmd', 'hard', 'A step'].join(T), 'G').steps, checks: parseRegistry(['c.a', 's.a', 'A', 'G', 'normal'].join(T)).checks }],
    missing: 0,
    noRegistry: [],
    bad: 0,
  })
  const ledger = () =>
    parseLedger([`pass_id=${RUN}`, 'session_id=s', `started_at=${STARTED}`, 'state=open', 'blocks=0', 'manifest=/x/day-cp-steps.tsv', ['STEP', 's.a', 'ok', '0', STARTED, ''].join(T), ['CHECK', 'c.a', 'ok', 's.a', STARTED, 'cmd', ''].join(T), ''].join('\n'))
  const render = (decisions: DayDecision[], receipts: LaunchReceipt[]) =>
    buildReport({
      ledger: ledger(),
      registries: registries(),
      findingFiles: new Map(),
      dataFiles: new Map(),
      earlier: [EARLIER],
      phase: 'end',
      now: STARTED,
      loops: { receipts, outcomes: [], earlier: [EARLIER], git: { ok: true, branches: [], specs: [] }, now: new Date(STARTED), evaluated: [], decisions },
    })
  const ok = (r: DayReport) => {
    const p = parseReport(JSON.parse(JSON.stringify(r)))
    if (p.kind !== 'ok') throw new Error('did not parse')
    return p.report
  }

  it('raises the finding as a card, with a day.notes problem check, and the report validates', () => {
    const r = render([noteLine()], [receipt()])
    expect(validateReport(r)).toEqual([])
    const cards = allIssues(ok(r)).filter((i) => i.fp.startsWith('day.notes:unanswered:'))
    expect(cards).toHaveLength(1)
    expect(r.checks.find((c) => c.id === 'day.notes')).toMatchObject({ status: 'problem' })
  })

  it('control: nothing unanswered, no card and no extra check', () => {
    const r = render([noteLine()], [])
    expect(allIssues(ok(r)).some((i) => i.fp.startsWith('day.notes:'))).toBe(false)
    expect(r.checks.some((c) => c.id === 'day.notes')).toBe(false)
  })
})
