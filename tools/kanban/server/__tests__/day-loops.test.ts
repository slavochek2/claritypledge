import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { buildView, isAgentWork, parseDecisions, parseLaunches, parseOutcomes, parseReport, type DayReport, type DayIssue } from '../../src/lib/day'
import { applyLoops, ownerFor, parseSentItem, tokensOf, type GitFacts } from '../../scripts/day-loops'

/**
 * P1578 — the /day runner closes the loops: what was sent and what became of it (A), who owns an
 * issue (B), waiting on in-flight work with a staleness alarm (C). The fixtures are the real
 * 2026-10-26 and 2026-10-27 reports and the real launch receipts, scrubbed of names (see
 * fixtures/day-p1578): the point of the spec is that these two real days must come out right.
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
const RECEIPTS_TEXT = readFileSync(new URL('receipts.jsonl', FIX), 'utf-8')
const RECEIPTS = parseLaunches(RECEIPTS_TEXT)
const NOW = new Date('2026-10-27T06:00:00Z')

const NO_GIT: GitFacts = { ok: true, branches: [], specs: [] }
const branch = (name: string, tip: string, subjects: string[] = [], first = tip, unshipped = true) => ({ name, tip_at: tip, first_at: first, unshipped, subjects })
const sentryBranch = branch('fix/sentry-3z-fb-ios-bridge', '2026-10-26T09:00:00Z', ['fix: guard the missing WebKit bridge on iOS Facebook browser'], '2026-10-26T08:00:00Z')
const chatBranch = (tip: string) => branch('feature/p1542-series-recipes', tip, ['feat(p1542): UAT round 6, smart buttons, group-chat opens, history never stacks'], '2026-10-20T08:00:00Z')

/** 10-27's rls card as the runner would have it once the finding carries the cause the check list asks for. */
function r27WithCause(): DayReport {
  const r = clone(R27)
  const rls = r.issues.find((i) => i.fp === 'cp.rls:rls:new-policies') as DayIssue
  rls.cause = 'table:group-chat-opens'
  return r
}
const run = (report: DayReport, git: GitFacts, over: Partial<Parameters<typeof applyLoops>[1]> = {}) =>
  applyLoops(report, { receipts: RECEIPTS, outcomes: [], earlier: [R26], git, now: NOW, ...over })

describe('A: the agent loop closes', () => {
  it('parses a sent item into its fingerprint and option, fingerprints may contain colons', () => {
    const fps = new Set(['cp.rls:rls:new-policies', 'check:disp.8a'])
    expect(parseSentItem('option:cp.rls:rls:new-policies:wait:', fps)).toEqual({ fp: 'cp.rls:rls:new-policies', option_id: 'wait' })
    expect(parseSentItem('option:check:disp.8a:agent:', fps)).toEqual({ fp: 'check:disp.8a', option_id: 'agent' })
    // a fingerprint nobody knows still parses when the answer has no free text
    expect(parseSentItem('option:cp.x:x:unknown-thing:agent:', new Set())).toEqual({ fp: 'cp.x:x:unknown-thing', option_id: 'agent' })
    expect(parseSentItem('reflection:r1:0:', fps)).toBeNull()
  })

  it('every option item sent on 10-26 gets a terminal outcome in the 10-27 annotations', () => {
    const report = clone(R27)
    run(report, NO_GIT)
    const l0 = RECEIPTS.find((l) => l.run_id === R26.pass_id) as NonNullable<(typeof RECEIPTS)[number]>
    const sentOn26 = l0.items.filter((i) => i.startsWith('option:')).map((i) => parseSentItem(i, new Set(R26.issues.map((x) => x.fp)))?.fp)
    expect(sentOn26.length).toBe(27)
    const resolved = new Map((report.loops?.resolved ?? []).map((r) => [r.fp, r.outcome]))
    for (const fp of sentOn26) expect(['fixed', 'still-open', 'never-started'], `no terminal outcome for ${fp}`).toContain(resolved.get(fp as string))
  })

  it('fixed only when the check ran this pass; a still-reported fault is still open', () => {
    const report = clone(R27)
    run(report, NO_GIT)
    const by = new Map((report.loops?.resolved ?? []).map((r) => [r.fp, r.outcome]))
    // the check ran and returned ok: fixed
    expect(by.get('disp.mirror:mirror:repo-stale:repo-01')).toBe('fixed')
    expect(by.get('cp.signups:signups:unconfirmed')).toBe('fixed')
    // the check ran (problem for another reason) and the fault is absent: fixed
    expect(by.get('cp.sentry:sentry:javascript-react-3z')).toBe('fixed')
    // still reported: still open after the agent was sent
    expect(by.get('check:disp.8a')).toBe('still-open')
    expect(by.get('disp.triage:triage:digest-stale')).toBe('still-open')
  })

  it('a check that did not run never counts as fixed', () => {
    const report = clone(R27)
    const sig = report.checks.find((c) => c.id === 'cp.signups') as DayReport['checks'][number]
    sig.status = 'not-run'
    const mir = report.checks.find((c) => c.id === 'disp.mirror') as DayReport['checks'][number]
    mir.status = 'skipped'
    const base = report.checks.find((c) => c.id === 'cp.baseline') as DayReport['checks'][number]
    base.status = 'unproven'
    run(report, NO_GIT)
    const by = new Map((report.loops?.resolved ?? []).map((r) => [r.fp, r.outcome]))
    expect(by.has('cp.signups:signups:unconfirmed')).toBe(false)
    expect(by.has('disp.mirror:mirror:repo-stale:repo-01')).toBe(false)
    expect(by.has('cp.baseline:baseline:flaky-test')).toBe(false)
    // and a fault the check reports again is open whatever its status
    expect(by.get('check:disp.8a')).toBe('still-open')
  })

  it('a check whose connection is down is not fixed, though its card moved to the connection row', () => {
    // the check filed a detailed finding of its own, so only the connection state decides
    const setup = (state: 'ok' | 'failed') => {
      const report = clone(R27)
      const c = report.checks.find((x) => x.id === 'disp.8a') as DayReport['checks'][number]
      c.status = 'problem'
      c.connection = 'beeper'
      report.connections = [...report.connections.filter((x) => x.id !== 'beeper'), { id: 'beeper', label: 'Beeper', state }]
      report.issues = report.issues.filter((i) => i.fp !== 'check:disp.8a' && i.check !== 'disp.8a')
      report.issues.push({ ...(clone(report.issues[0]) as DayIssue), fp: 'disp.8a:beeper:other', check: 'disp.8a', title: 'another Beeper fault' })
      run(report, NO_GIT)
      return new Map((report.loops?.resolved ?? []).map((r) => [r.fp, r.outcome]))
    }
    expect(setup('ok').get('check:disp.8a')).toBe('fixed') // control: healthy connection proves it
    expect(setup('failed').get('check:disp.8a')).not.toBe('fixed')
  })

  it('a check still in problem that filed no detailed finding this pass does not prove the old fault fixed', () => {
    const report = clone(R27)
    const sig = report.checks.find((c) => c.id === 'cp.signups') as DayReport['checks'][number]
    sig.status = 'problem'
    report.issues = report.issues.filter((i) => i.check !== 'cp.signups' && !i.fp.startsWith('cp.signups:'))
    run(report, NO_GIT)
    const by = new Map((report.loops?.resolved ?? []).map((r) => [r.fp, r.outcome]))
    expect(by.get('cp.signups:signups:unconfirmed')).not.toBe('fixed')
  })

  it('a launch that never got past pending is "agent never started", and may be offered again', () => {
    const receipts = parseLaunches(
      `{"kind":"sent","id":"aa","run_id":"${R26.pass_id}","state":"pending","items":["option:check:disp.8a:agent:"],"at":"2026-10-26T06:30:55.000Z"}\n`,
    )
    const report = clone(R27)
    run(report, NO_GIT, { receipts })
    expect(report.loops?.resolved?.find((r) => r.fp === 'check:disp.8a')?.outcome).toBe('never-started')
    expect(report.loops?.cards?.['check:disp.8a']?.sent?.outcome).toBe('never-started')
    const view = buildView(report, [], [])
    const card = view.issues.find((i) => i.fp === 'check:disp.8a')
    expect(card && isAgentWork(card)).toBe(true)
  })

  it('a card re-raised after an agent attempt says so, is not agent work, and ranks above a fresh card', () => {
    const report = clone(R27)
    run(report, NO_GIT)
    const view = buildView(report, [], [])
    const card = view.issues.find((i) => i.fp === 'check:disp.8a')
    expect(card?.loop?.sent).toMatchObject({ outcome: 'still-open', at: '2026-10-26T06:30:55.411Z' })
    expect(card && isAgentWork(card)).toBe(false)
    // every card the agent was sent for on 10-26 and that is still reported carries that history
    const sentFps = ['check:disp.8a', 'disp.triage:triage:digest-stale', 'disp.0d:day:previous-pass-incomplete']
    for (const fp of sentFps) {
      const i = view.issues.find((x) => x.fp === fp)
      expect(i?.loop?.sent?.outcome, fp).toBe('still-open')
      expect(i && isAgentWork(i), fp).toBe(false)
    }
    // ranked above a fresh one of the same tier
    const fresh = view.issues.find((i) => i.fp === 'cp.testdb:testdb:slow')
    expect(fresh && isAgentWork(fresh)).toBe(true)
    const order = view.issues.map((i) => i.fp)
    expect(order.indexOf('check:disp.8a')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('check:disp.8a')).toBeLessThan(order.indexOf('cp.testdb:testdb:slow'))
  })

  it('counts the attempts since the fault was last fixed', () => {
    const receipts = parseLaunches(
      [
        `{"kind":"sent","id":"a1","run_id":"r-a","state":"started","items":["option:check:disp.8a:agent:"],"at":"2026-10-20T06:00:00.000Z"}`,
        `{"kind":"sent","id":"a2","run_id":"r-b","state":"started","items":["option:check:disp.8a:agent:"],"at":"2026-10-22T06:00:00.000Z"}`,
        `{"kind":"sent","id":"a3","run_id":"${R26.pass_id}","state":"started","items":["option:check:disp.8a:agent:"],"at":"2026-10-26T06:00:00.000Z"}`,
      ].join('\n'),
    )
    const report = clone(R27)
    run(report, NO_GIT, { receipts })
    expect(report.loops?.cards?.['check:disp.8a']?.sent?.attempts).toBe(3)
    // a fix recorded in between starts the count again: that fault came back, it is not the same attempt
    const outcomes = parseOutcomes(`{"kind":"outcome","outcome":"fixed","fp":"check:disp.8a","sent_id":"a2","run_id":"r-c","at":"2026-10-23T06:00:00.000Z"}\n`)
    const again = clone(R27)
    run(again, NO_GIT, { receipts, outcomes })
    expect(again.loops?.cards?.['check:disp.8a']?.sent?.attempts).toBe(1)
  })

  it('writes each outcome to the ledger once: a second render appends nothing', () => {
    const report = clone(R27)
    const first = run(report, NO_GIT)
    expect(first.lines.length).toBeGreaterThan(0)
    expect(first.lines.every((l) => l.kind === 'outcome' && l.run_id === R27.pass_id)).toBe(true)
    const text = first.lines.map((l) => JSON.stringify({ ...l, at: '2026-10-27T05:50:00.000Z' })).join('\n')
    const second = run(clone(R27), NO_GIT, { outcomes: parseOutcomes(text) })
    expect(second.lines).toEqual([])
  })

  it('old readers and the decisions parser ignore outcome lines', () => {
    const text = `{"kind":"outcome","outcome":"fixed","fp":"x:y","sent_id":"a","run_id":"r","at":"2026-10-27T05:50:00.000Z"}\n`
    const parsed = parseDecisions(text)
    expect(parsed.lines).toEqual([])
    expect(parsed.badLines).toBe(0)
    expect(parseOutcomes(text)).toHaveLength(1)
  })
})

describe('B: an issue shows its owner, matched on exact tokens only', () => {
  it('tokenises names and subjects into lowercase alphanumeric words', () => {
    expect(tokensOf('fix/sentry-3z-fb-ios-bridge')).toEqual(['fix', 'sentry', '3z', 'fb', 'ios', 'bridge'])
    expect(tokensOf('feat(p1542): group-chat opens')).toEqual(['feat', 'p1542', 'group', 'chat', 'opens'])
  })

  it('the Sentry 3Z card names the unshipped branch with no P-number; Sentry 40 is not linked to it', () => {
    const both = clone(R27)
    both.issues.push(clone(R26.issues.find((i) => i.fp === 'cp.sentry:sentry:javascript-react-3z') as DayIssue))
    run(both, { ok: true, branches: [sentryBranch], specs: [] })
    const c3z = both.loops?.cards?.['cp.sentry:sentry:javascript-react-3z']
    expect(c3z?.owner).toMatchObject({ kind: 'branch', ref: 'fix/sentry-3z-fb-ios-bridge', state: 'live', unshipped: true })
    expect(both.loops?.cards?.['cp.sentry:sentry:javascript-react-40']?.owner).toBeUndefined()
  })

  it('a branch already merged to main is not an owner', () => {
    const fp = 'cp.sentry:sentry:javascript-react-3z'
    const live = clone(R26)
    run(live, { ok: true, branches: [sentryBranch], specs: [] }, { earlier: [] })
    expect(live.loops?.cards?.[fp]?.owner).toBeDefined() // control: the unmerged branch does own it
    const r = clone(R26)
    run(r, { ok: true, branches: [{ ...sentryBranch, unshipped: false }], specs: [] }, { earlier: [] })
    expect(r.loops?.cards?.[fp]?.owner).toBeUndefined()
  })

  it('a branch with the right short id but no sentry word is not an owner (no bare-number matches)', () => {
    const report = clone(R27)
    run(report, { ok: true, branches: [branch('fix/e2e-40-retries', '2026-10-26T09:00:00Z', ['raise retries to 40'])], specs: [] })
    expect(report.loops?.cards?.['cp.sentry:sentry:javascript-react-40']?.owner).toBeUndefined()
    // control: the card exists, and a branch carrying both words does own it
    const ctl = clone(R27)
    run(ctl, { ok: true, branches: [branch('fix/sentry-40-read-error', '2026-10-26T09:00:00Z')], specs: [] })
    expect(ctl.loops?.cards?.['cp.sentry:sentry:javascript-react-40']?.owner).toBeDefined()
  })

  it('an owned card offers no Send; a stale owner does not take the Send away', () => {
    const live = clone(R26)
    run(live, { ok: true, branches: [sentryBranch], specs: [] }, { earlier: [], now: new Date('2026-10-27T06:00:00Z') })
    const v = buildView(live, [], []).issues.find((i) => i.fp === 'cp.sentry:sentry:javascript-react-3z')
    expect(v?.options.some((o) => o.agent)).toBe(false)
    expect(v && isAgentWork(v)).toBe(false)
    expect(v?.options[v.recommended_index]?.id).not.toBe('park')
    const stale = clone(R26)
    run(stale, { ok: true, branches: [sentryBranch], specs: [] }, { earlier: [], now: new Date('2026-11-10T06:00:00Z') })
    const s = buildView(stale, [], []).issues.find((i) => i.fp === 'cp.sentry:sentry:javascript-react-3z')
    expect(s?.loop?.owner?.state).toBe('stale')
    expect(s?.options.some((o) => o.agent)).toBe(true)
  })

  it('a P-number in the issue text is an owner only when an open spec or a branch carries that exact token', () => {
    const report = clone(R27)
    // cp.branch:stash:present names P1542; cp.health names P1399
    run(report, { ok: true, branches: [chatBranch('2026-10-27T05:00:00Z')], specs: [{ pnum: 'p1399', open: false, text: '' }] })
    expect(report.loops?.cards?.['cp.branch:stash:present']?.owner).toMatchObject({ ref: 'feature/p1542-series-recipes', state: 'live' })
    // P1399 is a closed spec with no branch: a reference, not an owner
    expect(report.loops?.cards?.['cp.health:pipeline:none-overdue']?.owner).toBeUndefined()
  })

  it('a P-number mentioned only in the explanation (e.g. "regressed after P1442") is not an owner', () => {
    const report = clone(R27)
    const i = report.issues.find((x) => x.fp === 'cp.health:pipeline:none-overdue') as DayIssue
    i.obstacle = 'this regressed after P1442 shipped'
    run(report, { ok: true, branches: [], specs: [{ pnum: 'p1442', open: true, text: '' }] })
    expect(report.loops?.cards?.['cp.health:pipeline:none-overdue']?.owner).toBeUndefined()
    // control: the same P-number in the headline does own it
    const ctl = clone(R27)
    const c = ctl.issues.find((x) => x.fp === 'cp.health:pipeline:none-overdue') as DayIssue
    c.title = `${c.title} (P1442)`
    run(ctl, { ok: true, branches: [], specs: [{ pnum: 'p1442', open: true, text: '' }] })
    expect(ctl.loops?.cards?.['cp.health:pipeline:none-overdue']?.owner).toBeDefined()
  })

  it('an open spec owns the issue whose fingerprint its text names, and a closed spec does not', () => {
    const fp = 'cp.quota:quota:clarity-movement-prod:log-ingestion'
    const open = clone(R27)
    run(open, { ok: true, branches: [], specs: [{ pnum: 'p1530', open: true, created: '2026-10-21', last_commit_at: '2026-10-25T10:00:00Z', text: `day-owns: \`${fp}\`` }] })
    expect(open.loops?.cards?.[fp]?.owner).toMatchObject({ kind: 'spec', ref: 'P1530', state: 'live' })
    const closed = clone(R27)
    run(closed, { ok: true, branches: [], specs: [{ pnum: 'p1530', open: false, text: `day-owns: ${fp}` }] })
    expect(closed.loops?.cards?.[fp]?.owner).toBeUndefined()
    // a spec that only QUOTES the fingerprint (an example, how it was found) owns nothing
    const quoted = clone(R27)
    run(quoted, { ok: true, branches: [], specs: [{ pnum: 'p1578', open: true, text: `we saw ${fp} and cp.rls:rls:new-policies` }] })
    expect(quoted.loops?.cards?.[fp]?.owner).toBeUndefined()
  })

  it('a git failure means owner unknown: the report is still produced and nothing is owned', () => {
    const report = clone(R27)
    run(report, { ok: false, branches: [], specs: [] })
    expect(report.loops?.git).toBe('failed')
    expect(Object.values(report.loops?.cards ?? {}).some((c) => c.owner)).toBe(false)
    expect(report.loops?.resolved?.length).toBeGreaterThan(0) // part A does not need git
  })

  it('ownerFor reads only the issue text, never a similar-looking word', () => {
    const i: DayIssue = { fp: 'cp.x:x:new-policies', topic: 't', title: 'T', point_a: '', obstacle: '', point_b: '', options: [{ id: 'park', label: 'Park' }] }
    // "new policies" in a commit subject is not the fault-key phrase's business: names only
    expect(ownerFor(i, { ok: true, branches: [branch('feature/p9-x', '2026-10-26T00:00:00Z', ['add new policies for chat'])], specs: [] }, NOW)).toBeNull()
    expect(ownerFor(i, { ok: true, branches: [branch('feature/new-policies-pass', '2026-10-26T00:00:00Z')], specs: [] }, NOW)).toMatchObject({ ref: 'feature/new-policies-pass' })
  })
})

describe('C: waiting becomes automatic, with a staleness alarm', () => {
  const waitFp = 'cp.rls:rls:new-policies'

  it('the access-rules card is collapsed as "waiting on <owner>", with no question, while the owner is live', () => {
    const report = r27WithCause()
    run(report, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] })
    expect(report.loops?.cards?.[waitFp]).toMatchObject({ waiting: true, owner: { ref: 'feature/p1542-series-recipes', state: 'live' } })
    const view = buildView(report, [], [])
    expect(view.issues.some((i) => i.fp === waitFp)).toBe(false)
    const w = view.waiting.find((i) => i.fp === waitFp)
    expect(w?.loop?.owner?.ref).toBe('feature/p1542-series-recipes')
    // the table-grants card shares the cause and the owner: waiting as well
    expect(view.waiting.some((i) => i.fp === 'cp.tablegrants:tablegrants:group-chat-opens')).toBe(true)
    // nothing waiting is ever sent to the agent
    expect(view.waiting.every((i) => !isAgentWork(i))).toBe(true)
  })

  it('records the wait in the ledger once per pass', () => {
    const report = r27WithCause()
    const out = run(report, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] })
    const waits = out.lines.filter((l) => l.outcome === 'waiting')
    expect(waits.map((l) => l.fp).sort()).toEqual([waitFp, 'cp.tablegrants:tablegrants:group-chat-opens'].sort())
    expect(waits.every((l) => l.owner === 'feature/p1542-series-recipes')).toBe(true)
    // a second render of the same pass, with the first render's lines in the ledger, adds no wait
    const again = r27WithCause()
    const recorded = parseOutcomes(out.lines.map((l) => JSON.stringify({ ...l, at: '2026-10-27T06:01:00.000Z' })).join('\n'))
    const second = run(again, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] }, { outcomes: recorded })
    expect(second.lines.filter((l) => l.outcome === 'waiting')).toEqual([])
  })

  it('an owner with no commit in 7 days escalates to a normal card that asks what now', () => {
    const report = r27WithCause()
    run(report, { ok: true, branches: [chatBranch('2026-10-15T08:00:00Z')], specs: [] })
    const card = report.loops?.cards?.[waitFp]
    expect(card?.waiting).toBeFalsy()
    expect(card?.escalated).toMatchObject({ why: 'idle', days: 11 })
    const view = buildView(report, [], [])
    const i = view.issues.find((x) => x.fp === waitFp)
    expect(i).toBeTruthy()
    expect(i?.options.some((o) => o.id === 'wait')).toBe(false)
    expect(i?.options[i.recommended_index]?.id).not.toBe('park')
    expect(view.waiting.some((x) => x.fp === waitFp)).toBe(false)
  })

  it('an owner whose branch is gone (it was there on an earlier run) escalates too', () => {
    const before = r27WithCause()
    run(before, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] })
    const report = r27WithCause()
    run(report, { ok: true, branches: [], specs: [] }, { earlier: [before] })
    expect(report.loops?.cards?.[waitFp]?.escalated).toMatchObject({ why: 'gone' })
    expect(report.loops?.cards?.[waitFp]?.owner?.state).toBe('gone')
  })

  it('a wait card with no owner found stays a normal card, as before', () => {
    const report = clone(R27)
    run(report, NO_GIT)
    const view = buildView(report, [], [])
    const i = view.issues.find((x) => x.fp === waitFp)
    expect(i?.options.some((o) => o.id === 'wait')).toBe(true)
    expect(i?.loop?.waiting).toBeFalsy()
  })

  it('an escalated card stays on the page when the next run hits a git failure', () => {
    const before = r27WithCause()
    run(before, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] })
    const gone = { ...r27WithCause(), started_at: '2026-10-27T07:00:00Z' }
    run(gone, { ok: true, branches: [], specs: [] }, { earlier: [before] })
    expect(gone.loops?.cards?.[waitFp]?.escalated).toBeDefined() // precondition: it escalated
    const report = { ...r27WithCause(), started_at: '2026-10-27T08:00:00Z' }
    run(report, { ok: false, branches: [], specs: [] }, { earlier: [before, gone] })
    expect(buildView(report, [], []).issues.some((x) => x.fp === waitFp)).toBe(true)
    const card = buildView(report, [], []).issues.find((x) => x.fp === waitFp)
    expect(card?.options.some((o) => o.id === 'wait')).toBe(false) // still escalated: no quiet wait offered
  })

  it('an escalation cleared by a later run is not revived by a git failure after it', () => {
    const before = r27WithCause()
    run(before, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] })
    const gone = { ...r27WithCause(), started_at: '2026-10-27T06:30:00Z' }
    run(gone, { ok: true, branches: [], specs: [] }, { earlier: [before] })
    const back = { ...r27WithCause(), started_at: '2026-10-27T07:00:00Z' }
    run(back, { ok: true, branches: [chatBranch('2026-10-27T06:30:00Z')], specs: [] }, { earlier: [before, gone] })
    expect(back.loops?.cards?.[waitFp]?.escalated).toBeUndefined() // precondition: the owner recovered
    const report = { ...r27WithCause(), started_at: '2026-10-27T08:00:00Z' }
    run(report, { ok: false, branches: [], specs: [] }, { earlier: [before, gone, back] })
    expect(report.loops?.cards?.[waitFp]?.escalated).toBeUndefined()
  })

  it('a fault that was fixed and comes back is new: no earlier owner or alarm attaches to it', () => {
    const before = r27WithCause()
    run(before, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] })
    const gone = { ...r27WithCause(), started_at: '2026-10-27T06:30:00Z' }
    run(gone, { ok: true, branches: [], specs: [] }, { earlier: [before] })
    expect(gone.loops?.cards?.[waitFp]?.escalated).toBeDefined() // precondition
    const fixed = { ...r27WithCause(), started_at: '2026-10-27T07:00:00Z' }
    fixed.issues = fixed.issues.filter((x) => x.fp !== waitFp)
    run(fixed, { ok: true, branches: [], specs: [] }, { earlier: [before, gone] })
    for (const git of [{ ok: false, branches: [], specs: [] }, { ok: true, branches: [], specs: [] }] as GitFacts[]) {
      const report = { ...r27WithCause(), started_at: '2026-10-27T08:00:00Z' }
      run(report, git, { earlier: [before, gone, fixed] })
      expect(report.loops?.cards?.[waitFp]?.escalated).toBeUndefined()
      expect(report.loops?.cards?.[waitFp]?.owner).toBeUndefined()
    }
  })

  it('a git failure carries yesterday\'s owner, so a branch gone by the next readable run still escalates', () => {
    const d1 = r27WithCause()
    run(d1, { ok: true, branches: [chatBranch('2026-10-26T08:00:00Z')], specs: [] })
    const d2 = { ...r27WithCause(), started_at: '2026-10-28T05:00:00Z' }
    run(d2, { ok: false, branches: [], specs: [] }, { earlier: [d1] })
    expect(d2.loops?.cards?.[waitFp]?.owner?.ref).toBe('feature/p1542-series-recipes')
    const d3 = { ...r27WithCause(), started_at: '2026-10-29T05:00:00Z' }
    run(d3, { ok: true, branches: [], specs: [] }, { earlier: [d1, d2] })
    expect(d3.loops?.cards?.[waitFp]?.escalated).toMatchObject({ why: 'gone' })
  })

  it('a git failure finds no owner, so the wait card stays a normal card on the page', () => {
    const report = r27WithCause()
    run(report, { ok: false, branches: [], specs: [] })
    expect(report.loops?.cards?.[waitFp]?.owner).toBeUndefined()
    expect(buildView(report, [], []).issues.some((x) => x.fp === waitFp)).toBe(true)
  })
})

describe('D: an owned quota fault is not raised as a card', () => {
  const fp = 'cp.quota:quota:clarity-movement-prod:log-ingestion'
  const spec = (over: object = {}) => ({ pnum: 'p1530', open: true, created: '2026-10-21', last_commit_at: '2026-10-25T10:00:00Z', text: `day-owns: ${fp}`, ...over })

  it('raises no cp.quota card while an open spec owns it, and says so in the view', () => {
    const report = clone(R27)
    run(report, { ok: true, branches: [], specs: [spec()] })
    const view = buildView(report, [], [])
    expect(view.issues.some((i) => i.fp === fp)).toBe(false)
    expect(view.owned.find((i) => i.fp === fp)?.loop?.owner?.ref).toBe('P1530')
    // the check itself stays as reported: it is still a problem, never hidden from Status
    expect(view.checks.find((c) => c.id === 'cp.quota')?.status).toBe('problem')
  })

  it('raises the card when no open spec owns it, or the spec has gone quiet for over 7 days', () => {
    const none = clone(R27)
    run(none, NO_GIT)
    expect(buildView(none, [], []).issues.some((i) => i.fp === fp)).toBe(true)
    const quiet = clone(R27)
    run(quiet, { ok: true, branches: [], specs: [spec({ last_commit_at: '2026-10-01T10:00:00Z' })] })
    const v = buildView(quiet, [], []).issues.find((i) => i.fp === fp)
    expect(v?.loop?.owner?.state).toBe('stale')
  })
})

describe('past reports keep rendering', () => {
  it('a report with no loops block builds the same view as before', () => {
    const view = buildView(clone(R26), [], [])
    expect(view.waiting).toEqual([])
    expect(view.owned).toEqual([])
    expect(view.issues.length).toBeGreaterThanOrEqual(R26.issues.length)
  })

  it('a malformed loops block is dropped, never trusted', () => {
    const raw = JSON.parse(readFileSync(new URL('report-1027.json', FIX), 'utf-8'))
    raw.loops = { resolved: [{ fp: 5 }, { fp: 'a:b', outcome: 'exploded', sent_id: 'x', sent_at: 'y' }], cards: { 'a:b': { waiting: 'yes', owner: { ref: 3 } }, 'c:d': { sent: { outcome: 'still-open', at: '2026-10-26T06:30:55.411Z', run_id: 'r', sent_id: 's' } } } }
    const p = parseReport(raw)
    expect(p.kind).toBe('ok')
    if (p.kind !== 'ok') return
    expect(p.report.loops?.resolved).toEqual([])
    expect(Object.keys(p.report.loops?.cards ?? {})).toEqual(['c:d'])
  })
})

describe('the renderer wires the loops in', () => {
  it('a real-process style run writes loops into the report and hands back the outcome lines', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { run } = await import('../../scripts/day-render')
    const root = mkdtempSync(join(tmpdir(), 'day-loops-'))
    try {
      const day = join(root, 'day')
      mkdirSync(join(day, 'reports'), { recursive: true })
      writeFileSync(join(day, 'reports', 'old.json'), JSON.stringify(R26))
      writeFileSync(join(day, 'decisions.jsonl'), RECEIPTS_TEXT)
      const ledger = join(root, 'ledger')
      // one check that ran clean: the send made on 10-26 for its fault must come back as fixed
      writeFileSync(ledger, `pass_id=${R27.pass_id}\nstarted_at=${R27.started_at}\nstate=open\nCHECK\tcp.signups\tok\tcp.w2c\t-\tcmd\tno unconfirmed signups\n`)
      let lines: unknown[] = []
      const code = run(['--ledger', ledger, '--day-dir', day, '--phase', 'start', '--print', 'none', '--repo', 'none'], { out: () => {}, err: () => {}, outcomes: (l) => (lines = l) })
      expect(code).toBe(0)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.every((l) => (l as { kind?: string }).kind === 'outcome')).toBe(true)
      expect(lines.some((l) => (l as { fp?: string; outcome?: string }).fp === 'cp.signups:signups:unconfirmed' && (l as { outcome?: string }).outcome === 'fixed')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
