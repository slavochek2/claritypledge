import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { allIssues, buildView, collect, compareIssues, connectionBroken, isAgentWork, parseReport, stillYours, type DayCheck, type DayDecision, type DayIssue, type DayReport, type IssueView } from '../../src/lib/day'
import { PROD_OPTIONS_NOTE, buildChecks, buildIssues, buildReport, checkOutcomes, parseLedger, parseManifest, parseRegistry, renderCard, run as runRender, type Registries } from '../../scripts/day-render'
import { run as contextRun, storyLine } from '../../scripts/day-reflection-context'
import { run as checkRun } from '../../scripts/day-reflection-check'
import { connectionStatus } from '../../src/components/day/statusWords'

/**
 * P1489: the Day page's card logic. Every text here is invented (public repo): no real run, finding,
 * decision or story enters this suite.
 */

const RUN = '2026-10-04T05-00-00Z'
const STARTED = '2026-10-04T05:00:00Z'
const ok = (r: DayReport) => {
  const p = parseReport(JSON.parse(JSON.stringify(r)))
  if (p.kind !== 'ok') throw new Error(`fixture did not parse: ${p.kind}`)
  return p.report
}
const agentOpts = () => [
  { id: 'agent', label: 'Give to the agent', agent: true, recommended: true },
  { id: 'park', label: 'Park: stop asking until I bring it back' },
]
const founderOpts = () => [
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
  first_seen: '2026-10-04',
  ...(check ? { check } : {}),
  ...over,
})
const chk = (id: string, status: DayCheck['status'], severity?: 'high' | 'normal'): DayCheck => ({ id, label: id, status, ...(severity ? { severity } : {}) })

/** The shape of the run that surfaced this spec, with invented content: one founder card on a
 * normal-severity check, four low-severity notes on a registry-high check, two high findings. */
function shapeReport(): DayReport {
  return ok({
    schema: 2,
    pass_id: RUN,
    started_at: STARTED,
    state: 'complete',
    connections: [],
    checks: [chk('money', 'problem', 'normal'), chk('errors', 'problem', 'high'), chk('access', 'problem', 'high'), chk('grants', 'problem', 'high'), chk('fine', 'ok', 'normal'), chk('later', 'skipped', 'normal')],
    issues: [
      // finding severity low on a registry-high check: no `important` in the report
      issue('errors:e1', 'errors', { title: 'A note one' }),
      issue('errors:e2', 'errors', { title: 'A note two' }),
      issue('errors:e3', 'errors', { title: 'A note three' }),
      issue('errors:e4', 'errors', { title: 'A note four' }),
      issue('access:new', 'access', { important: true, title: 'B access drift', first_seen: '2026-09-30' }),
      issue('grants:open', 'grants', { important: true, title: 'C grant drift' }),
      // finding high on a normal check: capped by the ceiling; the only founder card
      issue('money:over', 'money', { important: true, title: 'Z money over budget', options: founderOpts() }),
    ],
  } as DayReport)
}

describe('P1489 §1: importance — the finding decides, the check is the ceiling (founder 2026-10-14)', () => {
  it('a low finding on a registry-high check is not Important (the zero-user note)', () => {
    const v = allIssues(shapeReport())
    for (const fp of ['errors:e1', 'errors:e2', 'errors:e3', 'errors:e4']) expect(v.find((i) => i.fp === fp)!.important, fp).toBe(false)
  })
  it('a high finding on a registry-high check is Important', () => {
    const v = allIssues(shapeReport())
    expect(v.find((i) => i.fp === 'access:new')!.important).toBe(true)
  })
  it('the ceiling: a high finding on a check registered normal is NOT Important', () => {
    expect(allIssues(shapeReport()).find((i) => i.fp === 'money:over')!.important).toBe(false)
  })
  it('a check with no registered severity sets no ceiling: the finding decides', () => {
    const r = shapeReport()
    r.issues.push(issue('free:x', undefined, { important: true }))
    expect(allIssues(r).find((i) => i.fp === 'free:x')!.important).toBe(true)
  })
  it('control: a synthesised card for a registry-high check that did not report is still Important', () => {
    const r = shapeReport()
    r.checks.push(chk('silent', 'not-run', 'high'))
    const s = allIssues(r).find((i) => i.check === 'silent')!
    expect(s.synthetic).toBe(true)
    expect(s.important).toBe(true)
  })
})

describe('P1489 §1: within a tier, the founder’s cards come first', () => {
  const mk = (over: Partial<IssueView>): IssueView =>
    ({ fp: 'f', topic: 't', title: 'T', point_a: '', obstacle: '', point_b: '', options: agentOpts(), synthetic: false, urgent: false, important: false, came_back: false, recommended_index: 0, ...over }) as IssueView
  it('a founder card ranks above an agent card that would win on first seen and title', () => {
    const list = [mk({ fp: 'agent', title: 'A', first_seen: '2026-01-01' }), mk({ fp: 'founder', title: 'Z', first_seen: '2026-10-01', options: founderOpts() })].sort(compareIssues)
    expect(list.map((i) => i.fp)).toEqual(['founder', 'agent'])
  })
  it('the tier still comes first: an Important agent card beats a not-Important founder card', () => {
    const list = [mk({ fp: 'founder', options: founderOpts() }), mk({ fp: 'agent', important: true })].sort(compareIssues)
    expect(list.map((i) => i.fp)).toEqual(['agent', 'founder'])
  })
  it('on the run’s shape the founder card is in the terminal card’s top 6 and no note is Important', () => {
    const r = shapeReport()
    const v = buildView(r, [])
    const top = v.issues.slice(0, 6)
    expect(top.map((i) => i.fp)).toContain('money:over')
    const card = renderCard(r, v, { kanbanUrl: 'http://localhost:9050' })
    const lines = card.split('\n').filter((l) => /^ {2}\d\./.test(l))
    expect(lines).toHaveLength(6)
    expect(lines.some((l) => l.includes('Z money over budget'))).toBe(true)
    for (const l of lines.filter((x) => x.includes('A note'))) expect(l).not.toContain('Important')
  })
  it('known-bad control: under the old rule (registry high OR finding) the founder card fell to #7', () => {
    const r = shapeReport()
    const old = allIssues(r).map((i) => ({ ...i, important: r.issues.find((x) => x.fp === i.fp)?.important === true || r.checks.find((c) => c.id === i.check)?.severity === 'high' }))
    const rank = (i: IssueView) => (i.urgent && i.important ? 0 : i.urgent ? 1 : i.important ? 2 : 3)
    const byOld = (a: IssueView, b: IssueView) => rank(a) - rank(b) || (a.first_seen ?? '').localeCompare(b.first_seen ?? '') || a.title.localeCompare(b.title)
    expect(old.sort(byOld).findIndex((i) => i.fp === 'money:over')).toBe(6)
  })
})

describe('P1489 §2: a prod change is a founder decision (needs_yes)', () => {
  const T = '\t'
  it('the check list reads a 7th column `yes` as needs_yes; anything else is no marker', () => {
    const { checks } = parseRegistry([['cp.a', 's', 'A', 'G', 'high', '', 'yes'].join(T), ['cp.b', 's', 'B', 'G', 'high', ''].join(T), ['cp.c', 's', 'C', 'G', 'normal', '', 'maybe'].join(T)].join('\n'))
    expect(checks.map((c) => c.needs_yes)).toEqual([true, undefined, undefined])
  })
  const fp = 'cd'.repeat(8)
  const build = (sidecar: object, needs = true) =>
    buildIssues({
      finds: [{ check: 'cp.prod', severity: 'high', key: fp, title: 'Prod is behind', keyed: true }],
      files: new Map([[fp, { body: 'what the check returned', sidecar: JSON.stringify({ check: 'cp.prod', fault_key: 'prod:behind', title: 'Prod is behind', ...sidecar }) }]]),
      checks: [chk('cp.prod', 'problem', 'high')],
      steps: [],
      earlier: [],
      startedAt: STARTED,
      needsYes: new Set(needs ? ['cp.prod'] : []),
    }).issues[0]
  const viewOf = (i: DayIssue) =>
    buildView(ok({ schema: 2, pass_id: RUN, started_at: STARTED, state: 'complete', connections: [], checks: [chk('cp.prod', 'problem', 'high')], issues: [i] } as DayReport), [])

  it('with no options from the producer: the prod-change options, never "Give to the agent", and a visible note', () => {
    const i = build({})
    expect(i.needs_yes).toBe(true)
    expect(i.options.map((o) => o.label)).toEqual(['Apply it to prod now', 'Wait for the in-flight fix', 'Park: stop asking until I bring it back'])
    expect(i.options.some((o) => o.agent)).toBe(false)
    expect(i.options.find((o) => o.id === 'park')!.recommended).toBeFalsy()
    expect(i.options.find((o) => o.recommended)!.id).toBe('wait') // review: the safe choice is preselected, never the prod change
    expect(i.more_info).toBe(PROD_OPTIONS_NOTE)
    const v = viewOf(i)
    expect(isAgentWork(v.issues[0])).toBe(false)
    expect(stillYours(v).map((x) => x.fp)).toEqual(['cp.prod:prod:behind'])
    expect(collect(v).issues).toHaveLength(0) // unanswered: Start fixing does not send it
  })
  it('Invariant: even when the producer recommends an agent option, the card is not agent work and is not sent unanswered', () => {
    const i = build({ options: [{ id: 'agent', label: 'Give to the agent', agent: true }], recommend: 'agent' })
    expect(i.options[0]).toMatchObject({ id: 'agent', agent: true, recommended: true })
    const v = viewOf(i)
    expect(isAgentWork(v.issues[0])).toBe(false)
    expect(collect(v).issues).toHaveLength(0)
    // once the founder answers, it goes out with his answer
    const answered = buildView(v.issues.length ? ok({ schema: 2, pass_id: RUN, started_at: STARTED, state: 'complete', connections: [], checks: [chk('cp.prod', 'problem', 'high')], issues: [i] } as DayReport) : ({} as DayReport), [
      { run_id: RUN, at: '2026-10-04T06:00:00Z', kind: 'option', target: 'cp.prod:prod:behind', option_id: 'agent' } as DayDecision,
    ])
    expect(collect(answered).issues.map((x) => x.option_id)).toEqual(['agent'])
  })
  it('control: the same finding on a check without the marker stays routine agent work', () => {
    const i = build({}, false)
    expect(i.needs_yes).toBeUndefined()
    expect(isAgentWork(viewOf(i).issues[0])).toBe(true)
  })
  it('codex review: a problem nobody wrote up on a needs_yes check is not agent work either; a check that did not run still is', () => {
    const r = ok({
      schema: 2,
      pass_id: RUN,
      started_at: STARTED,
      state: 'complete',
      connections: [],
      checks: [{ ...chk('cp.prod', 'problem', 'high'), needs_yes: true }, { ...chk('cp.prod2', 'not-run', 'high'), needs_yes: true }],
      issues: [],
    } as DayReport)
    expect(r.checks[0].needs_yes).toBe(true)
    const v = buildView(r, [])
    const by = (fp: string) => v.issues.find((i) => i.fp === fp)!
    expect(isAgentWork(by('check:cp.prod'))).toBe(false)
    expect(collect(v).issues.map((x) => x.issue.fp)).not.toContain('check:cp.prod')
    expect(isAgentWork(by('check:cp.prod2'))).toBe(true) // making a check run is not a prod change
  })
  it('the check list marker reaches the report’s checks (so a synthesised card can see it)', () => {
    const T = '\t'
    const regs: Registries = { lists: [{ steps: parseManifest(['s.a', 'cmd', 'hard', 'A'].join(T), 'G').steps, checks: parseRegistry(['cp.prod', 's.a', 'P', 'G', 'high', '', 'yes'].join(T)).checks }], missing: 0, noRegistry: [], bad: 0 }
    const led = parseLedger([`pass_id=${RUN}`, 'session_id=s', `started_at=${STARTED}`, 'state=open', 'blocks=0', 'manifest=/x/day-cp-steps.tsv', ['STEP', 's.a', 'ok', '0', STARTED, ''].join(T), ['CHECK', 'cp.prod', 'problem', 's.a', STARTED, 'cmd', 'drift'].join(T), ''].join('\n'))
    const r = buildReport({ ledger: led, registries: regs, findingFiles: new Map(), dataFiles: new Map(), earlier: [], phase: 'end', now: STARTED })
    expect(r.checks.find((c) => c.id === 'cp.prod')!.needs_yes).toBe(true)
    expect(isAgentWork(buildView(ok(r), []).issues.find((i) => i.fp === 'check:cp.prod')!)).toBe(false)
  })
  it('needs_yes survives the report round trip; the card counts under "needs you" on the terminal card', () => {
    const i = build({})
    const r = ok({ schema: 2, pass_id: RUN, started_at: STARTED, state: 'complete', connections: [], checks: [chk('cp.prod', 'problem', 'high')], issues: [i] } as DayReport)
    expect(r.issues[0].needs_yes).toBe(true)
    expect(renderCard(r, buildView(r, []), { kanbanUrl: 'http://x' }).split('\n')[1]).toMatch(/^1 issue · 1 needs you ·/)
  })
})

describe('P1489 §3: cards sharing a cause sit together and name each other, never merged', () => {
  it('adjacent at the best-ranked member’s place; own fingerprints; a decision on one leaves the other open', () => {
    const r = shapeReport()
    r.issues.find((i) => i.fp === 'access:new')!.cause = 'table:t1'
    r.issues.find((i) => i.fp === 'grants:open')!.cause = 'table:t1'
    r.issues.push(issue('later:y', undefined, { important: true, title: 'A between them' }))
    const v = buildView(ok(r), [])
    const at = (fp: string) => v.issues.findIndex((i) => i.fp === fp)
    expect(at('grants:open')).toBe(at('access:new') + 1)
    expect(v.issues[at('access:new')].same_cause).toEqual(['grants:open'])
    expect(v.issues[at('grants:open')].same_cause).toEqual(['access:new'])
    const card = renderCard(ok(r), v, { kanbanUrl: 'http://x' })
    expect(card).toMatch(new RegExp(`${at('grants:open') + 1}\\. .*C grant drift \\(same cause as ${at('access:new') + 1}\\)`))
    const d = buildView(ok(r), [{ run_id: RUN, at: '2026-10-04T06:00:00Z', kind: 'option', target: 'access:new', option_id: 'agent' } as DayDecision])
    expect(d.issues.find((i) => i.fp === 'access:new')!.decision).toBeDefined()
    expect(d.issues.find((i) => i.fp === 'grants:open')!.decision).toBeUndefined()
  })
  it('the renderer carries a sidecar `cause` onto the card, and ignores one that is not a slug', () => {
    const mk = (cause: string) => {
      const fp = 'ef'.repeat(8)
      return buildIssues({
        finds: [{ check: 'cp.a', severity: 'high', key: fp, title: 'T', keyed: true }],
        files: new Map([[fp, { body: 'b', sidecar: JSON.stringify({ check: 'cp.a', fault_key: 'a:x', title: 'T', cause }) }]]),
        checks: [chk('cp.a', 'problem', 'high')],
        steps: [],
        earlier: [],
        startedAt: STARTED,
      }).issues[0]
    }
    expect(mk('table:t1').cause).toBe('table:t1')
    expect(mk('Not A Slug').cause).toBeUndefined()
  })
  it('control: without a shared cause nothing moves and nothing is named', () => {
    const v = buildView(shapeReport(), [])
    expect(v.issues.every((i) => i.same_cause === undefined)).toBe(true)
  })
  it('a malformed cause is ignored on reading (tolerant reading)', () => {
    const r = shapeReport() as unknown as { issues: Record<string, unknown>[] }
    r.issues[0].cause = 'Not A Slug!'
    expect(parseReport(JSON.parse(JSON.stringify(r))).kind).toBe('ok')
    expect(ok(r as unknown as DayReport).issues[0].cause).toBeUndefined()
  })
})

describe('P1489 §4: the counts say what happened', () => {
  it('the run’s shape: clean, found problems, skipped; "failed to run" only when there is one', () => {
    const v = buildView(shapeReport(), [])
    expect(checkOutcomes(v.counts)).toBe('6 checks: 1 clean · 4 found problems · 1 skipped')
    expect(checkOutcomes({ total: 31, worked: 23, problem: 7, unproven: 0, skipped: 1, to_issues: 7 })).toBe('31 checks: 23 clean · 7 found problems · 1 skipped')
  })
  it('a not-run check reads "1 failed to run", and a problem never adds to it', () => {
    const r = shapeReport()
    r.checks.push(chk('silent', 'not-run', 'normal'))
    expect(checkOutcomes(buildView(r, []).counts)).toBe('7 checks: 1 clean · 4 found problems · 1 skipped · 1 failed to run')
    r.checks.push(chk('another', 'problem', 'normal'))
    expect(checkOutcomes(buildView(r, []).counts)).toBe('8 checks: 1 clean · 5 found problems · 1 skipped · 1 failed to run')
  })
})

describe('P1489 §5: the mid-pass phase never invents "didn\'t run"', () => {
  const T = '\t'
  const STEPS = [['s.early', 'cmd', 'hard', 'Early step'].join(T), ['s.late', 'cmd', 'hard', 'Late step'].join(T), ['s.bare', 'cmd', 'hard', 'A step with no checks'].join(T), ['s.quiet', 'cmd', 'hard', 'Ran, reported nothing'].join(T)].join('\n')
  const CHECKS = [['c.early', 's.early', 'Early', 'G', 'normal'].join(T), ['c.late', 's.late', 'Late', 'G', 'high'].join(T), ['c.quiet', 's.quiet', 'Quiet', 'G', 'normal'].join(T)].join('\n')
  const registries = (): Registries => ({ lists: [{ steps: parseManifest(STEPS, 'G').steps, checks: parseRegistry(CHECKS).checks }], missing: 0, noRegistry: [], bad: 0 })
  const ledger = () =>
    parseLedger(
      [
        `pass_id=${RUN}`,
        'session_id=s',
        `started_at=${STARTED}`,
        'state=open',
        'blocks=0',
        'manifest=/x/day-cp-steps.tsv',
        ['STEP', 's.early', 'ok', '0', STARTED, ''].join(T),
        ['CHECK', 'c.early', 'problem', 's.early', STARTED, 'cmd', 'found one'].join(T),
        ['STEP', 's.quiet', 'ok', '0', STARTED, ''].join(T),
        '',
      ].join('\n')
    )
  const cardsAt = (phase: 'mid' | 'end') => {
    const r = buildReport({ ledger: ledger(), registries: registries(), findingFiles: new Map(), dataFiles: new Map(), earlier: [], phase, now: STARTED })
    return allIssues(ok(r))
  }
  it('mid: zero cards for steps not reached and their checks; the ran-but-silent check still has its card', () => {
    const fps = cardsAt('mid').map((i) => i.fp)
    expect(fps.some((f) => f.includes('s.late') || f.includes('c.late') || f.includes('s.bare'))).toBe(false)
    expect(fps).toContain('check:c.quiet') // unproven: the step ran
    expect(fps).toContain('check:c.early') // a real problem
  })
  it('control: the same ledger at end still says the unreached ones did not run', () => {
    const fps = cardsAt('end').map((i) => i.fp)
    expect(fps).toContain('check:c.late')
    expect(fps).toContain('check:s.bare')
  })
  it('the runbook call (--phase issues) builds mid-pass: no card for an unreached step', () => {
    const root = mkdtempSync(join(tmpdir(), 'day-p1489-cli-'))
    try {
      mkdirSync(join(root, 'cp'))
      writeFileSync(join(root, 'cp', 'day-cp-steps.tsv'), STEPS)
      writeFileSync(join(root, 'cp', 'day-cp-checks.tsv'), CHECKS)
      const lines = [
        `pass_id=${RUN}`,
        'session_id=s',
        `started_at=${STARTED}`,
        'state=open',
        'blocks=0',
        `manifest=${join(root, 'cp', 'day-cp-steps.tsv')}`,
        ['STEP', 's.early', 'ok', '0', STARTED, ''].join(T),
        ['CHECK', 'c.early', 'problem', 's.early', STARTED, 'cmd', 'found one'].join(T),
        '',
      ]
      writeFileSync(join(root, 'ledger'), lines.join('\n'))
      mkdirSync(join(root, 'day', 'reports'), { recursive: true })
      let out = ''
      const code = runRender(['--phase', 'issues', '--ledger', join(root, 'ledger'), '--day-dir', join(root, 'day'), '--now', STARTED], { out: (s) => (out += s), err: () => undefined })
      expect(code).toBe(0)
      const fps = (JSON.parse(out) as { fp: string }[]).map((c) => c.fp)
      expect(fps).toEqual(['check:c.early'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('--pending-from: only unrecorded steps AT OR AFTER it (in its own list) are not reached; an earlier miss keeps its card', () => {
    const two = (): Registries => ({
      lists: [
        { steps: parseManifest(STEPS, 'G').steps, checks: parseRegistry(CHECKS).checks },
        { steps: parseManifest(['o.other', 'cmd', 'hard', 'Another list'].join(T), 'H').steps, checks: [] },
      ],
      missing: 0,
      noRegistry: [],
      bad: 0,
    })
    const r = buildReport({ ledger: ledger(), registries: two(), findingFiles: new Map(), dataFiles: new Map(), earlier: [], phase: 'mid', pendingFrom: 's.bare', now: STARTED })
    const fps = allIssues(ok(r)).map((i) => i.fp)
    expect(fps).toContain('check:c.late') // s.late is BEFORE s.bare and never ran: a real miss
    expect(fps).not.toContain('check:s.bare') // at the boundary: not reached yet
    expect(fps).toContain('check:o.other') // another list's step is not covered by the boundary
    expect(fps).toContain('check:c.quiet') // ran, reported nothing: still unproven
  })
  it('--pending-from is refused when it names no step, and outside --phase issues', () => {
    const root = mkdtempSync(join(tmpdir(), 'day-p1489-pf-'))
    try {
      mkdirSync(join(root, 'cp'))
      writeFileSync(join(root, 'cp', 'day-cp-steps.tsv'), STEPS)
      writeFileSync(join(root, 'cp', 'day-cp-checks.tsv'), CHECKS)
      writeFileSync(join(root, 'ledger'), [`pass_id=${RUN}`, 'session_id=s', `started_at=${STARTED}`, 'state=open', 'blocks=0', `manifest=${join(root, 'cp', 'day-cp-steps.tsv')}`, ''].join('\n'))
      mkdirSync(join(root, 'day', 'reports'), { recursive: true })
      const quiet = { out: () => undefined, err: () => undefined }
      const base = ['--ledger', join(root, 'ledger'), '--day-dir', join(root, 'day'), '--now', STARTED]
      expect(runRender(['--phase', 'issues', '--pending-from', 'no.such', ...base], quiet)).toBe(2)
      expect(runRender(['--phase', 'end', '--pending-from', 's.late', '--print', 'none', ...base], quiet)).toBe(2)
      let out = ''
      expect(runRender(['--phase', 'issues', '--pending-from', 's.late', ...base], { out: (s) => (out += s), err: () => undefined })).toBe(0)
      const fps = (JSON.parse(out) as { fp: string }[]).map((c) => c.fp)
      expect(fps).toContain('check:c.early') // before the boundary and never ran: a real card
      expect(fps.some((f) => f.includes('late') || f.includes('bare') || f.includes('quiet'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('mid never reads as finished', () => {
    const r = buildReport({ ledger: ledger(), registries: registries(), findingFiles: new Map(), dataFiles: new Map(), earlier: [], phase: 'mid', now: STARTED })
    expect(r.state).toBe('running')
    expect(r.finished_at).toBeUndefined()
    expect(buildChecks({ ledger: ledger(), registries: registries(), phase: 'mid' }).checks.map((c) => c.id)).toEqual(['c.early', 'c.quiet'])
  })
})

describe('P1489 §6: a story quote is checked against exactly the line the writer was shown', () => {
  let root: string
  let dayDir: string
  const NOW = '2026-10-08T09:00:00Z'
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'day-p1489-'))
    dayDir = join(root, 'day')
    mkdirSync(join(dayDir, 'reports'), { recursive: true })
    writeFileSync(join(root, 'findings.txt'), 'An invented card title here\n')
    const r = {
      schema: 2,
      pass_id: '2026-10-07T05-00-00Z',
      started_at: '2026-10-07T05:00:00Z',
      state: 'complete',
      connections: [],
      checks: [],
      issues: [],
      reflection: { model: 'm', statements: [{ id: 'r1', text: 'Hold fewer large public evenings next month.' }] },
    }
    writeFileSync(join(dayDir, 'reports', '2026-10-07T05-00-00Z.json'), JSON.stringify(r))
    writeFileSync(join(dayDir, 'decisions.jsonl'), JSON.stringify({ kind: 'reflection', target: 'r1', run_id: '2026-10-07T05-00-00Z', position: -1, story: 'The invented evening felt quiet and slow.', at: '2026-10-07T10:00:00Z' }) + '\n')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const io = () => {
    const o = { out: '', err: '' }
    return { o, io: { out: (s: string) => (o.out += s), err: (s: string) => (o.err += s) } }
  }
  async function quotes(qs: string[]) {
    const hist = join(root, 'hist')
    writeFileSync(hist, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    const c = io()
    await contextRun(['--day-dir', dayDir, '--now', NOW, '--findings', join(root, 'findings.txt'), '--hist', hist, '--sources-out', join(root, 'sources.json')], c.io)
    const S = c.o.out.split('\n').find((l) => l.startsWith('S1 '))!
    const sources = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf-8'))
    const stmt = (t: string) => ({ text: t, agent: { position: 0, story: 'A story.', sources: qs.map((q) => ({ ref: 'S1', quote: q })) } })
    const reply = `MODEL: m\n${JSON.stringify({ statements: [stmt('One invented statement.'), stmt('Two invented statement.'), stmt('Three invented statement.')] })}`
    const p = io()
    await checkRun(['--parse'], reply, p.io)
    const q = io()
    const code = await checkRun(['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], p.o.out, q.io)
    return { code, err: q.o.err, out: q.o.out, S, sources }
  }

  it('the grounding line is the shared renderer’s output', async () => {
    const { S } = await quotes(['felt quiet and slow'])
    expect(S).toBe(storyLine('S1', { edited_at: '2026-10-07T10:00:00Z', state: 'open', position: -1, statement: 'Hold fewer large public evenings next month.', story: 'The invented evening felt quiet and slow.' }))
  })
  it('quotes of the story, of the statement he answered, and of the bracket all verify; the part is named', async () => {
    const r = await quotes(['felt quiet and slow', 'fewer large public evenings', 'open · Somewhat disagree'])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    const got = JSON.parse(r.out).statements[0].agent.sources.map((s: { source: string }) => s.source)
    expect(got).toEqual(['founder story 2026-10-07T05-00-00Z/r1', 'founder story 2026-10-07T05-00-00Z/r1 (the statement he answered)', 'founder story 2026-10-07T05-00-00Z/r1 (his recorded position)'])
  })
  it('a quote running across the statement and the story verifies (it was on screen) and says so', async () => {
    const r = await quotes(['next month.": The invented evening'])
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out).statements[0].agent.sources[0].source).toBe('founder story 2026-10-07T05-00-00Z/r1 (the line as shown)')
  })
  it('FAILING CONTROL: one word changed in each of those quotes misses all three', async () => {
    const r = await quotes(['felt loud and slow', 'fewer small public evenings', 'open · Strongly disagree'])
    expect(r.code).toBe(1)
    expect(r.err.split('\n').filter((l) => l.includes('not found in that source'))).toHaveLength(9) // 3 quotes × 3 statements
  })
  it('codex review: a quote in both the statement and a clipped-away story is attributed to the statement', async () => {
    const stmt = `Hold fewer large public evenings next month ${'and keep the rest '.repeat(14)}as planned.`
    const r0 = { schema: 2, pass_id: '2026-10-07T05-00-00Z', started_at: '2026-10-07T05:00:00Z', state: 'complete', connections: [], checks: [], issues: [], reflection: { model: 'm', statements: [{ id: 'r1', text: stmt }] } }
    writeFileSync(join(dayDir, 'reports', '2026-10-07T05-00-00Z.json'), JSON.stringify(r0))
    writeFileSync(join(dayDir, 'decisions.jsonl'), JSON.stringify({ kind: 'reflection', target: 'r1', run_id: '2026-10-07T05-00-00Z', position: -1, story: 'I said fewer large public evenings once.', at: '2026-10-07T10:00:00Z' }) + '\n')
    const r = await quotes(['fewer large public evenings'])
    expect(r.S).not.toContain('I said')
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out).statements[0].agent.sources[0].source).toBe('founder story 2026-10-07T05-00-00Z/r1 (the statement he answered)')
  })
  it('FAILING CONTROL: a quote from text clipped away before the writer saw it misses', async () => {
    const long = `${'word '.repeat(80)}the hidden tail sentence`
    writeFileSync(join(dayDir, 'decisions.jsonl'), JSON.stringify({ kind: 'reflection', target: 'r1', run_id: '2026-10-07T05-00-00Z', position: -1, story: long, at: '2026-10-07T10:00:00Z' }) + '\n')
    const r = await quotes(['the hidden tail sentence'])
    expect(r.S.endsWith('…')).toBe(true)
    expect(r.code).toBe(1)
    expect(r.err).toContain('not found in that source')
  })
})

describe('P1489: a connection the run never used is neutral (not-used)', () => {
  const withConn = (state: string) =>
    ok({
      schema: 2,
      pass_id: RUN,
      started_at: STARTED,
      state: 'complete',
      connections: [{ id: 'analytics', label: 'Analytics', state }],
      checks: [{ id: 'usage', label: 'Usage', status: 'skipped', connection: 'analytics' }, chk('fine', 'ok', 'normal')],
      issues: [],
    } as unknown as DayReport)
  it('is read as not-used, never as failed', () => {
    expect(withConn('not-used').connections[0].state).toBe('not-used')
  })
  it('is not broken: no Connections line on the card, no Fix, no card', () => {
    const r = withConn('not-used')
    const v = buildView(r, [])
    expect(v.issues).toHaveLength(0)
    expect(v.connections[0].fix_queued).toBe(false)
    expect(renderCard(r, v, { kanbanUrl: 'http://x' })).not.toContain('Connections:')
    expect(connectionBroken('not-used')).toBe(false)
  })
  it('is never shown as worked or as failed', () => {
    const s = connectionStatus('not-used')
    expect(s.word).toBe('Not used this run')
    expect(['ok', 'bad', 'need']).not.toContain(s.cls)
  })
  it('controls: a failed connection is still broken, and an unknown state still reads failed', () => {
    const r = withConn('failed')
    expect(renderCard(r, buildView(r, []), { kanbanUrl: 'http://x' })).toContain('Connections: Analytics didn’t work')
    expect(withConn('exploded').connections[0].state).toBe('failed')
  })
})
