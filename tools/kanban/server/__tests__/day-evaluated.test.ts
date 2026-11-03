import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildPrompt, buildView, type EvaluatedWhy, parseDecisions, parseEvaluated, parseLaunches, parseReport, type DayIssue, type DayReport, type EvaluatedLine } from '../../src/lib/day'
import { applyLoops, type GitFacts } from '../../scripts/day-loops'
import { renderCard, renderDetail } from '../../scripts/day-render'
import { run as cli } from '../../scripts/day-evaluated'
import { loopNotices } from '../../src/components/day/loops'
import { evaluatedCli } from '../day'
import { parseLines } from '../dayStore'

/**
 * P1605 — an evaluated cause stays evaluated. Everything goes through the real applyLoops and
 * buildView on the real 2026-10-26/27 reports (fixtures/day-p1578), so a hidden card is hidden by
 * the same code path the board uses.
 */

const FIX = new URL('./fixtures/day-p1578/', import.meta.url)
const load = (name: string) => {
  const p = parseReport(JSON.parse(readFileSync(new URL(name, FIX), 'utf-8')))
  if (p.kind !== 'ok') throw new Error(`fixture ${name} unreadable`)
  return p.report
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const R26 = load('report-1026.json')
const R27 = load('report-1027.json')
const NOW = new Date('2026-10-27T06:00:00Z')
const NO_GIT: GitFacts = { ok: true, branches: [], specs: [] }

const A = 'cp.testdb:testdb:slow' // check cp.testdb: problem
const B = 'cp.rls:rls:new-policies' // check cp.rls: problem
const C = 'disp.triage:triage:digest-stale'

const rec = (over: Partial<EvaluatedLine> = {}): EvaluatedLine => ({
  kind: 'evaluated',
  id: 'ev-1',
  fps: [A],
  cause: 'one-off benchmark',
  verdict: 'accepted',
  expires: '2026-11-10',
  at: '2026-10-26T12:00:00.000Z',
  ...over,
})

function render(records: EvaluatedLine[] | undefined, mutate: (r: DayReport) => void = () => {}, over: Partial<Parameters<typeof applyLoops>[1]> = {}) {
  const report = clone(R27)
  mutate(report)
  const out = applyLoops(report, { receipts: [], outcomes: [], earlier: [R26], git: NO_GIT, now: NOW, ...(records ? { evaluated: records } : {}), ...over })
  const view = buildView(report, [])
  return { report, view, lines: out.lines }
}
const shown = (v: ReturnType<typeof render>['view'], fp: string) => v.issues.find((i) => i.fp === fp)
const hiddenIn = (v: ReturnType<typeof render>['view'], fp: string) => v.evaluated.find((i) => i.fp === fp)
const check = (r: DayReport, id: string) => r.checks.find((c) => c.id === id) as DayReport['checks'][number]
const issue = (r: DayReport, fp: string) => r.issues.find((i) => i.fp === fp) as DayIssue

describe('P1605 matching and hiding', () => {
  it('control: the fault is a card when no record exists', () => {
    const { view } = render([])
    expect(shown(view, A)).toBeDefined()
    expect(view.evaluated).toEqual([])
  })

  it('an accepted record: no card, and it is counted by verdict in the board line and the render summary', () => {
    const { view, report } = render([rec()])
    expect(shown(view, A)).toBeUndefined()
    expect(hiddenIn(view, A)?.loop?.evaluated).toMatchObject({ hidden: true, verdict: 'accepted', cause: 'one-off benchmark' })
    const card = renderCard(report, view, { kanbanUrl: 'http://x' })
    expect(card).toContain('1 already evaluated: 1 accepted')
  })

  it('the count keeps the breakdown: 2 accepted, 1 false', () => {
    const { report, view } = render([rec(), rec({ id: 'ev-2', fps: [B] }), rec({ id: 'ev-3', fps: [C], verdict: 'false' })])
    expect(renderCard(report, view, { kanbanUrl: 'http://x' })).toContain('3 already evaluated: 2 accepted, 1 false')
  })

  it('a worse reading shows the card with the earlier verdict', () => {
    const withReading = (n: number) => (r: DayReport) => {
      issue(r, A).reading = n
    }
    const worse = render([rec({ threshold: 10 })], withReading(11))
    expect(shown(worse.view, A)?.loop?.evaluated).toMatchObject({ hidden: false, why_shown: 'worse', verdict: 'accepted' })
    const atLimit = render([rec({ threshold: 10 })], withReading(10))
    expect(hiddenIn(atLimit.view, A)).toBeDefined() // control: at the threshold is still within it
  })

  it('a threshold with no reading fails open', () => {
    const { view } = render([rec({ threshold: 10 })])
    expect(shown(view, A)?.loop?.evaluated).toMatchObject({ hidden: false, why_shown: 'unmeasurable' })
  })

  it('an expired record shows the card; on the expiry day it is still hidden', () => {
    const expired = render([rec({ expires: '2026-10-26' })])
    expect(shown(expired.view, A)?.loop?.evaluated).toMatchObject({ hidden: false, why_shown: 'expired' })
    const onDay = render([rec({ expires: '2026-10-27' })])
    expect(hiddenIn(onDay.view, A)).toBeDefined()
  })

  it('a fault marked fixed that is reported again shows', () => {
    const { view } = render([rec({ verdict: 'fixed' })])
    expect(shown(view, A)?.loop?.evaluated).toMatchObject({ hidden: false, why_shown: 'fixed-returned' })
  })

  it.each([['not-run'], ['unproven'], ['skipped']] as const)('a check that is %s shows as today despite a record, with no annotation', (status) => {
    const { view, report } = render([rec()], (r) => {
      check(r, 'cp.testdb').status = status
    })
    expect(shown(view, A)).toBeDefined()
    expect(report.loops?.cards?.[A]?.evaluated).toBeUndefined()
  })

  it('a problem check whose connection is broken shows as today despite a record', () => {
    const broken = (state: string) => (r: DayReport) => {
      check(r, 'cp.testdb').connection = 'c1'
      r.connections = [{ id: 'c1', label: 'C1', state } as DayReport['connections'][number]]
    }
    const down = render([rec()], broken('failed'))
    expect(shown(down.view, A)).toBeDefined()
    expect(down.report.loops?.cards?.[A]?.evaluated).toBeUndefined()
    expect(hiddenIn(render([rec()], broken('ok')).view, A)).toBeDefined() // control: healthy connection
  })

  it('a synthetic check: card is never recordable or hidden', () => {
    const { view } = render([rec({ fps: ['check:disp.8a'] })])
    expect(shown(view, 'check:disp.8a')).toBeDefined()
  })

  it('control with no record: the report and the view equal the same run without the feature input', () => {
    const off = render(undefined)
    const on = render([])
    const unrelated = render([rec({ fps: ['cp.other:x:y'] })])
    expect(on.report).toEqual(off.report)
    expect(on.view).toEqual(off.view)
    expect(unrelated.report).toEqual(off.report)
    expect(unrelated.view).toEqual(off.view)
    expect(on.lines).toEqual(off.lines)
  })

  it('one record covers two fault keys; the renamed fault in the second fp is hidden', () => {
    const { view } = render([rec({ fps: ['cp.testdb:testdb:old-name', A] })])
    expect(hiddenIn(view, A)).toBeDefined()
    const two = render([rec({ fps: [A, B] })])
    expect(hiddenIn(two.view, A)).toBeDefined()
    expect(hiddenIn(two.view, B)).toBeDefined()
  })

  it('the newest record wins', () => {
    const { view } = render([rec({ id: 'old', verdict: 'accepted', at: '2026-10-25T00:00:00.000Z' }), rec({ id: 'new', verdict: 'fixed', at: '2026-10-26T00:00:00.000Z' })])
    expect(shown(view, A)?.loop?.evaluated).toMatchObject({ id: 'new', verdict: 'fixed' })
  })

  it('a record dated after the run is ignored', () => {
    const { view } = render([rec({ at: '2026-10-28T00:00:00.000Z' })])
    expect(shown(view, A)).toBeDefined()
    expect(view.evaluated).toEqual([])
  })

  it('an answer on this run keeps its precedence over a record', () => {
    const report = clone(R27)
    applyLoops(report, { receipts: [], outcomes: [], earlier: [R26], git: NO_GIT, now: NOW, evaluated: [rec()] })
    const view = buildView(report, [{ kind: 'option', target: A, option_id: 'own', text: 'look', run_id: report.pass_id, at: '2026-10-27T05:30:00.000Z' }])
    expect(shown(view, A)).toBeDefined()
    expect(view.evaluated.find((i) => i.fp === A)).toBeUndefined()
  })
})

describe('P1605 and the P1578 outcome logic', () => {
  const RECEIPTS = parseLaunches(
    `{"kind":"sent","id":"s1","run_id":"${R26.pass_id}","state":"started","items":["option:${A}:agent:"],"at":"2026-10-26T06:30:00.000Z"}\n`,
  )
  it('a hidden fault with an earlier send is not counted as fixed', () => {
    const { report, view } = render([rec()], () => {}, { receipts: RECEIPTS })
    expect(hiddenIn(view, A)).toBeDefined()
    const o = report.loops?.resolved.find((r) => r.fp === A)?.outcome
    expect(o).toBe('still-open')
    expect(o).not.toBe('fixed')
  })
  it('the outcome lines equal those of the run with no record', () => {
    const on = render([rec()], () => {}, { receipts: RECEIPTS })
    const off = render([], () => {}, { receipts: RECEIPTS })
    expect(on.report.loops?.resolved).toEqual(off.report.loops?.resolved)
    expect(on.lines).toEqual(off.lines)
  })
})

describe('P1605 the prompt', () => {
  it('a hidden fault never reaches collect or the prompt; the closing text names the CLI', () => {
    const { report, view } = render([rec()])
    const hidden = hiddenIn(view, A)!
    const ctl = render([])
    const withCard = buildPrompt(ctl.report, ctl.view, new Set(), undefined, { ledger: [], cli: 'STORY', evaluatedCli: 'EVCLI' })
    expect(withCard).toContain(hidden.title) // control: shown, it is in the prompt
    const p = buildPrompt(report, view, new Set(), undefined, { ledger: [], cli: 'STORY', evaluatedCli: 'EVCLI' })
    expect(p).not.toContain(hidden.title)
    expect(p).not.toContain(A)
    expect(p).toContain('EVCLI --fp <fingerprint>')
    expect(p).toContain('--verdict fixed|false|accepted --expires YYYY-MM-DD')
    expect(p).toContain('KDD entry only for an item whose decision is worth keeping')
  })
})

describe('P1605 the ledger', () => {
  it('parseEvaluated is strict: malformed lines are skipped', () => {
    const good = JSON.stringify(rec())
    const bad = [
      { ...rec(), cause: '' },
      { ...rec(), verdict: 'ignored' },
      { ...rec(), expires: 'tomorrow' },
      { ...rec(), fps: [] },
      { ...rec(), fps: ['check:x'] },
      { ...rec(), fps: ['has space'] },
      { ...rec(), threshold: 'high' },
      { ...rec(), at: 'yesterday' },
    ].map((x) => JSON.stringify(x))
    expect(parseEvaluated([good, ...bad, '{not json'].join('\n'))).toHaveLength(1)
  })
  it('an evaluated line is not a decision and not a bad line', () => {
    const p = parseDecisions(JSON.stringify(rec()) + '\n')
    expect(p.badLines).toBe(0)
    expect(p.lines).toEqual([])
  })
})

describe('P1605 CLI', () => {
  const mk = () => {
    const d = mkdtempSync(join(tmpdir(), 'day-ev-'))
    mkdirSync(join(d, 'reports'))
    return d
  }
  const NOWD = () => new Date('2026-11-03T10:00:00Z')
  const go = async (dir: string, args: string[]) => {
    let out = ''
    let err = ''
    const code = await cli(['--dir', dir, ...args], { out: (s) => (out += s), err: (s) => (err += s) }, {}, NOWD)
    return { code, out, err }
  }
  const ok = ['--fp', A, '--cause', 'one-off benchmark', '--verdict', 'accepted', '--expires', '2026-12-01']
  const without = (flag: string) => {
    const i = ok.indexOf(flag)
    return [...ok.slice(0, i), ...ok.slice(i + 2)]
  }
  const file = (d: string) => join(d, 'decisions.jsonl')

  it('a success is read back through parseEvaluated and does not raise badLines', async () => {
    const d = mk()
    const r = await go(d, [...ok, '--fp', B, '--threshold', '5', '--note', 'n'])
    expect(r.code).toBe(0)
    const text = readFileSync(file(d), 'utf-8')
    const got = parseEvaluated(text)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ fps: [A, B], verdict: 'accepted', expires: '2026-12-01', threshold: 5, cause: 'one-off benchmark', note: 'n' })
    expect(parseLines(text).badLines).toBe(0)
    expect((await go(d, ['--list'])).out).toContain(A)
  })

  it.each([
    ['empty cause', (a: string[]) => [...a.slice(0, a.indexOf('--cause') + 1), '  ', ...a.slice(a.indexOf('--cause') + 2)]],
    ['missing cause', () => without('--cause')],
    ['missing expiry', () => without('--expires')],
    ['expiry today', (a: string[]) => [...a.slice(0, -1), '2026-11-03']],
    ['expiry in the past', (a: string[]) => [...a.slice(0, -1), '2026-10-01']],
    ['expiry over 90 days ahead', (a: string[]) => [...a.slice(0, -1), '2027-02-02']],
    ['bad verdict', (a: string[]) => a.map((x) => (x === 'accepted' ? 'whatever' : x))],
    ['bad fingerprint', (a: string[]) => a.map((x) => (x === A ? 'has space' : x))],
    ['check: fingerprint', (a: string[]) => a.map((x) => (x === A ? 'check:disp.8a' : x))],
    ['no fp', () => without('--fp')],
  ])('refuses: %s (exit non-zero, one stderr line, nothing written)', async (_n, f) => {
    const d = mk()
    const r = await go(d, f(ok))
    expect(r.code).not.toBe(0)
    expect(r.err.trim().split('\n')).toHaveLength(1)
    expect(() => readFileSync(file(d), 'utf-8')).toThrow()
  })

  it('exactly 90 days ahead is allowed', async () => {
    expect((await go(mk(), [...ok.slice(0, -1), '2027-02-01'])).code).toBe(0)
  })

  it('a missing day dir fails instead of being created', async () => {
    const r = await cli(['--dir', join(tmpdir(), 'no-such-day-dir-p1605'), ...ok], { out: () => {}, err: () => {} }, {}, NOWD)
    expect(r).not.toBe(0)
  })
})

describe('P1605 review fixes', () => {
  const STORIES = { ledger: [], cli: 'STORY', evaluatedCli: 'EVCLI' }

  it('the prompt prints the exact fingerprint of every handed-off item, grouped members included', () => {
    const grouped = render([], (r) => {
      issue(r, A).cause = 'shared-cause'
      issue(r, B).cause = 'shared-cause'
    })
    const p = buildPrompt(grouped.report, grouped.view, new Set(), undefined, STORIES)
    expect(p).toContain(`--fp ${A}`)
    expect(p).toContain(`--fp ${B}`)
    const plain = buildPrompt(grouped.report, grouped.view, new Set(), undefined, { ledger: [], cli: 'STORY' })
    expect(plain).not.toContain('--fp ')
  })

  it('the generated command is bound to the server day dir, shell-quoted', () => {
    expect(evaluatedCli('/a b/o\'k')).toMatch(/day-evaluated\.ts --dir '\/a b\/o'\\''k'$/)
  })

  const mk = () => {
    const d = mkdtempSync(join(tmpdir(), 'day-ev-'))
    mkdirSync(join(d, 'reports'))
    return d
  }
  const go = (dir: string, args: string[]) => {
    let err = ''
    return cli(['--dir', dir, ...args], { out: () => {}, err: (x) => (err += x) }, {}, () => new Date('2026-11-03T10:00:00Z')).then((code) => ({ code, err }))
  }
  const base = ['--cause', 'c', '--verdict', 'accepted', '--expires', '2026-12-01']

  it('the CLI refuses 51 fingerprints and writes nothing', async () => {
    const d = mk()
    const fps = Array.from({ length: 51 }, (_, i) => ['--fp', `cp.x:x:f${i}`]).flat()
    const r = await go(d, [...fps, ...base])
    expect(r.code).toBe(1)
    expect(() => readFileSync(join(d, 'decisions.jsonl'), 'utf-8')).toThrow()
    expect((await go(mk(), [...fps.slice(0, 100), ...base])).code).toBe(0) // control: 50 pass
  })

  it('an impossible date is refused by the CLI and skipped by parseEvaluated', async () => {
    const d = mk()
    expect((await go(d, ['--fp', A, '--cause', 'c', '--verdict', 'accepted', '--expires', '2026-11-31'])).code).toBe(1)
    expect(parseEvaluated(JSON.stringify(rec({ expires: '2026-11-31' })))).toEqual([])
    expect(parseEvaluated(JSON.stringify(rec({ expires: '2026-11-30' })))).toHaveLength(1)
  })

  it('a record on a card whose owner stopped moving does not hide it', () => {
    const idle = { ok: true, branches: [{ name: 'feature/p1542-series-recipes', tip_at: '2026-10-15T08:00:00Z', first_at: '2026-10-10T08:00:00Z', unshipped: true, subjects: ['feat(p1542): UAT round 6, smart buttons, group-chat opens, history never stacks'] }], specs: [] } as GitFacts
    const mutate = (r: DayReport) => {
      issue(r, B).cause = 'table:group-chat-opens'
    }
    const { view, report } = render([rec({ fps: [B] })], mutate, { git: idle })
    expect(report.loops?.cards?.[B]?.escalated).toBeDefined() // precondition
    expect(shown(view, B)?.loop?.evaluated).toMatchObject({ hidden: false, why_shown: 'owner-moved' })
    expect(hiddenIn(view, B)).toBeUndefined()
  })

  it('parse round trip keeps hide and why_shown', () => {
    const hide = render([rec()])
    const rt = parseReport(JSON.parse(JSON.stringify(hide.report)))
    if (rt.kind !== 'ok') throw new Error('unreadable')
    expect(hiddenIn(buildView(rt.report, []), A)).toBeDefined()
    const exp = render([rec({ expires: '2026-10-26' })])
    const rt2 = parseReport(JSON.parse(JSON.stringify(exp.report)))
    if (rt2.kind !== 'ok') throw new Error('unreadable')
    expect(shown(buildView(rt2.report, []), A)?.loop?.evaluated).toMatchObject({ hidden: false, why_shown: 'expired' })
  })

  it('expiry compares the UTC day of a +02:00 started_at', () => {
    // 2026-10-28T00:30+02:00 is 2026-10-27 UTC: still the expiry day, so still hidden
    const at = (r: DayReport) => {
      r.started_at = '2026-10-28T00:30:00+02:00'
    }
    expect(hiddenIn(render([rec({ expires: '2026-10-27' })], at).view, A)).toBeDefined()
    expect(shown(render([rec({ expires: '2026-10-26' })], at).view, A)?.loop?.evaluated?.why_shown).toBe('expired')
  })

  it('record recency compares instants, not strings', () => {
    // 2026-10-26T23:00-02:00 = 2026-10-27T01:00Z is newer than 2026-10-27T00:00:00Z though it sorts lower
    const { view } = render([rec({ id: 'a', verdict: 'accepted', at: '2026-10-27T00:00:00.000Z' }), rec({ id: 'b', verdict: 'fixed', at: '2026-10-26T23:00:00.000-02:00' })])
    expect(shown(view, A)?.loop?.evaluated).toMatchObject({ id: 'b', verdict: 'fixed' })
  })

  it.each(['expired', 'worse', 'unmeasurable', 'fixed-returned', 'owner-moved'] as EvaluatedWhy[])('loopNotices words the evaluated notice for why_shown %s', (why) => {
    const n = loopNotices({ evaluated: { id: 'ev-1', cause: 'the cause', verdict: 'accepted', expires: '2026-11-10', at: '2026-10-26T12:00:00.000Z', hidden: false, why_shown: why } })
    expect(n).toHaveLength(1)
    expect(n[0].kind).toBe('evaluated')
    expect(n[0].text).toMatch(/^Earlier verdict: accepted, the cause \(2026-10-26\), shown because \S/)
    expect(n[0].text).not.toContain('undefined')
    // each reason has its own words
    expect(new Set(['expired', 'worse', 'unmeasurable', 'fixed-returned', 'owner-moved'].map((w) => loopNotices({ evaluated: { id: 'e', cause: 'c', verdict: 'fixed', expires: '2026-11-10', at: '2026-10-26T12:00:00.000Z', hidden: false, why_shown: w as EvaluatedWhy } })[0].text)).size).toBe(5)
  })
  it('loopNotices says nothing for a hidden record', () => {
    expect(loopNotices({ evaluated: { id: 'e', cause: 'c', verdict: 'fixed', expires: '2026-11-10', at: '2026-10-26T12:00:00.000Z', hidden: true } })).toEqual([])
  })
})

describe('P1605 a record that no longer holds beats a live owner', () => {
  const owned: GitFacts = { ok: true, branches: [], specs: [{ pnum: 'p9001', open: true, text: `day-owns: ${A}\n` }] }
  const withWait = (reading?: number) => (r: DayReport) => {
    const i = issue(r, A)
    i.options = [...i.options, { id: 'wait', label: 'Wait' }]
    if (reading !== undefined) i.reading = reading
  }
  it('control: with no record the owned wait card still waits, and writes its waiting line', () => {
    const { view, lines } = render([], withWait(), { git: owned })
    expect(view.waiting.some((i) => i.fp === A)).toBe(true)
    expect(lines.some((l) => l.outcome === 'waiting' && l.fp === A)).toBe(true)
  })
  it('a worse reading shows the card despite the live owner, and writes no waiting line', () => {
    const { view, lines } = render([rec({ threshold: 10 })], withWait(100), { git: owned })
    expect(shown(view, A)?.loop?.evaluated).toMatchObject({ hidden: false, why_shown: 'worse' })
    expect(view.waiting.some((i) => i.fp === A)).toBe(false)
    expect(lines.some((l) => l.outcome === 'waiting' && l.fp === A)).toBe(false)
  })
  it('an expired record shows the card despite the live owner', () => {
    const { view } = render([rec({ expires: '2026-10-26' })], withWait(), { git: owned })
    expect(shown(view, A)?.loop?.evaluated).toMatchObject({ why_shown: 'expired' })
  })
  it('the detailed output carries the count and the earlier verdict', () => {
    const hid = render([rec()])
    expect(renderDetail(hid.report, hid.view, { kanbanUrl: 'http://x' })).toContain('1 already evaluated: 1 accepted')
    const back = render([rec({ expires: '2026-10-26' })])
    expect(renderDetail(back.report, back.view, { kanbanUrl: 'http://x' })).toContain('Earlier verdict: accepted, one-off benchmark')
  })
})
