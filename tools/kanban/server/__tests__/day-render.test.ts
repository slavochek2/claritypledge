import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { buildView, daysOpen, parseDecisions, parseReport, traceOf, type DayReport } from '../../src/lib/day'
import { cleanStepLabel, fileIdOf, firstSeen, readSidecar, renderCard, run } from '../../scripts/day-render'

/**
 * P1399 Phase B — the /day renderer (scripts/day-render.ts). Synthetic ledgers, manifests and
 * day dirs in a temp folder only: nothing here reads ~/.claude-day or ~/.claude-day-ledger.
 *
 * Each rule has a known-bad control in scripts/day-mutation-controls.sh: the rule is broken in a
 * throwaway copy and the test named here must go red.
 */

const T = '\t'
const PASS = '2026-10-04T05:37:45Z-97246'
const STARTED = '2026-10-04T05:37:45Z'
const NOW = '2026-10-04T06:10:00Z'
const MARKER = 'PRIVATE-CONTENT-MARKER-RENDER'
const TS = '2026-10-04T05:40:00Z'

interface World {
  root: string
  ledger: string
  dayDir: string
  personal: string
  cp: string
}

const step = (id: string, status: string, rc = 0, detail = '') => [`STEP`, id, status, String(rc), TS, detail].join(T)
const check = (id: string, status: string, stepId: string, detail = '', source = 'cmd') => ['CHECK', id, status, stepId, TS, source, detail].join(T)
const find = (chk: string, sev: string, hex: string, title: string, keyed = false) => ['FIND', chk, sev, hex, 'private', title, ...(keyed ? ['keyed'] : [])].join(T)
const data = (section: string) => ['DATA', section, TS].join(T)
const hexOf = (chk: string, faultKey: string) => createHash('sha256').update(`${chk}\n${faultKey}`).digest('hex').slice(0, 16)

const PERSONAL_STEPS = [
  '# synthetic dispatcher manifest',
  '# id\tkind\tpolicy\tlabel',
  ['disp.0d', 'gate', 'hard', 'day-gates.sh --mode=start (D1 calendar staleness, D6 previous pass)'].join(T),
  ['disp.2a', 'cmd', 'hard', 'Cloud credits and AI keys'].join(T),
  ['disp.3', 'attest', 'hard', 'Agent VM health (P1399)'].join(T),
  ['disp.8', 'attest', 'skippable', 'Events calendar refresh (skipped only on token expiry)'].join(T),
].join('\n')
const PERSONAL_CHECKS = [
  '# check-id\tstep-id\tlabel\tgroup\tseverity\tconnection',
  ['pp.credits', 'disp.2a', 'Cloud credits', 'Money', 'normal', ''].join(T),
  ['pp.keys', 'disp.2a', 'AI key liveness', 'Keys', 'high', ''].join(T),
].join('\n')
const CP_STEPS = [
  ['cp.w1', 'cmd', 'hard', 'Prod smoke and history'].join(T),
  ['cp.w3', 'cmd', 'hard', 'Repo health'].join(T),
  ['cp.w2c', 'attest', 'skippable', 'Signup intel'].join(T),
].join('\n')
const CP_CHECKS = [
  ['cp.sentry', 'cp.w1', 'Error tracker', 'Errors', 'normal', 'sentry'].join(T),
  ['cp.rls', 'cp.w3', 'Database access rules', 'Security', 'high', ''].join(T),
  ['cp.grants', 'cp.w3', 'Function grants', 'Security', 'normal', ''].join(T),
  ['cp.lint', 'cp.w3', 'Lint', 'Code', 'normal', ''].join(T),
].join('\n')

function makeWorld(): World {
  const root = mkdtempSync(join(tmpdir(), 'day-render-'))
  const w: World = { root, ledger: join(root, 'ledger'), dayDir: join(root, 'day'), personal: join(root, 'pp', 'day-steps.tsv'), cp: join(root, 'cp', 'day-cp-steps.tsv') }
  mkdirSync(join(root, 'pp'))
  mkdirSync(join(root, 'cp'))
  writeFileSync(w.personal, PERSONAL_STEPS)
  writeFileSync(join(root, 'pp', 'day-checks.tsv'), PERSONAL_CHECKS)
  writeFileSync(w.cp, CP_STEPS)
  writeFileSync(join(root, 'cp', 'day-cp-checks.tsv'), CP_CHECKS)
  return w
}

/** A complete, clean pass: every hard step recorded, every registered check reported ok. */
function cleanBody(w: World): string[] {
  return [
    `manifest=${w.personal}`,
    step('disp.0d', 'ok', 0, 'recorded by day-gates.sh mode=start'),
    step('disp.2a', 'ok', 0, '28s 4628b'),
    check('pp.credits', 'ok', 'disp.2a', '19 of 400 spent'),
    check('pp.keys', 'ok', 'disp.2a', '7 of 7 answering'),
    step('disp.3', 'attested', 0, 'VM healthy, healer idle'),
    `manifest=${w.cp}`,
    step('cp.w1', 'ok', 0, '10s 120b'),
    check('cp.sentry', 'ok', 'cp.w1', 'no new issues', 'agent'),
    step('cp.w3', 'ok', 0, '40s 900b'),
    check('cp.rls', 'ok', 'cp.w3', 'live matches main'),
    check('cp.grants', 'ok', 'cp.w3', 'no drift'),
    check('cp.lint', 'ok', 'cp.w3', 'clean'),
    step('cp.w2c', 'skipped', 0, 'no new real-user signups'),
    step('disp.8', 'skipped', 0, 'token expired'),
  ]
}

function writeLedger(w: World, body: string[], h: { pass?: string; started?: string; state?: string } = {}) {
  const head = [`pass_id=${h.pass ?? PASS}`, 'session_id=s-1', `started_at=${h.started ?? STARTED}`, `state=${h.state ?? 'open'}`, 'blocks=0']
  writeFileSync(w.ledger, [...head, ...body, ''].join('\n'))
}

function writeFinding(w: World, hex: string, body: string, sidecar?: object | string) {
  mkdirSync(`${w.ledger}.findings`, { recursive: true })
  writeFileSync(join(`${w.ledger}.findings`, `${hex}.txt`), body)
  if (sidecar !== undefined) writeFileSync(join(`${w.ledger}.findings`, `${hex}.json`), typeof sidecar === 'string' ? sidecar : JSON.stringify(sidecar))
}

function writeData(w: World, section: string, value: unknown) {
  mkdirSync(`${w.ledger}.data`, { recursive: true })
  writeFileSync(join(`${w.ledger}.data`, `${section}.json`), typeof value === 'string' ? value : JSON.stringify(value))
}

function writeReportFile(w: World, r: DayReport) {
  mkdirSync(join(w.dayDir, 'reports'), { recursive: true })
  writeFileSync(join(w.dayDir, 'reports', `${fileIdOf(r.pass_id)}.json`), JSON.stringify(r))
}

const reportPath = (w: World, pass = PASS) => join(w.dayDir, 'reports', `${fileIdOf(pass)}.json`)

function render(w: World, phase: 'start' | 'end' | 'issues', extra: string[] = []) {
  let out = ''
  let err = ''
  const code = run(['--ledger', w.ledger, '--day-dir', w.dayDir, '--phase', phase, '--now', NOW, '--kanban-url', 'http://localhost:9052', ...extra], {
    out: (s) => (out += s),
    err: (s) => (err += s),
  })
  const path = reportPath(w)
  const report = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as DayReport) : undefined
  return { code, out, err, report }
}

const byId = (r: DayReport | undefined, id: string) => r?.checks.find((c) => c.id === id)
const decisionsOf = (w: World) => (existsSync(join(w.dayDir, 'decisions.jsonl')) ? parseDecisions(readFileSync(join(w.dayDir, 'decisions.jsonl'), 'utf-8')).lines : [])

let w: World
beforeEach(() => {
  w = makeWorld()
})
afterEach(() => {
  rmSync(w.root, { recursive: true, force: true })
})

describe('day-render: per-check status (AC: a check failing inside a wave is a problem on the board)', () => {
  it('a registered check reported problem inside a step that exited 0 is a problem, and an issue on the board', () => {
    writeLedger(w, cleanBody(w).map((l) => (l.startsWith(`CHECK${T}cp.rls${T}`) ? check('cp.rls', 'problem', 'cp.w3', '2 rules live, not on main') : l)))
    const { code, report } = render(w, 'end')
    expect(code).toBe(0)
    expect(byId(report, 'cp.rls')).toMatchObject({ status: 'problem', detail: '2 rules live, not on main', label: 'Database access rules', group: 'Security', severity: 'high' })
    expect(byId(report, 'cp.w3')).toBeUndefined() // the wave itself is not a check: its checks are
    const view = buildView(report!, [], [])
    expect(view.issues.map((i) => i.fp)).toContain('check:cp.rls')
  })

  it('an agent-reported check carries that in its detail; registry label, group and connection are kept', () => {
    writeLedger(w, cleanBody(w))
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.sentry')).toMatchObject({ status: 'ok', detail: 'agent-reported: no new issues', connection: 'sentry', group: 'Errors' })
  })

  it('later CHECK rows for the same id win', () => {
    writeLedger(w, [...cleanBody(w), check('cp.lint', 'problem', 'cp.w3', '3 warnings')])
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.lint')).toMatchObject({ status: 'problem', detail: '3 warnings' })
  })

  it('an unregistered CHECK id is still reported, after the registered ones', () => {
    writeLedger(w, [...cleanBody(w), check('cp.extra', 'problem', 'cp.w3', 'surprise')])
    const { report } = render(w, 'end')
    const ids = report!.checks.map((c) => c.id)
    expect(ids.indexOf('cp.extra')).toBeGreaterThan(ids.indexOf('cp.lint'))
    expect(byId(report, 'cp.extra')?.status).toBe('problem')
  })
})

describe('day-render: a registered check with no CHECK row is never ok', () => {
  it('UNREPORTED CHECK — step recorded → unproven; step not recorded → not-run', () => {
    const body = cleanBody(w).filter((l) => !l.startsWith(`CHECK${T}cp.lint${T}`) && !l.startsWith(`STEP${T}cp.w1${T}`) && !l.startsWith(`CHECK${T}cp.sentry${T}`))
    writeLedger(w, body)
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.lint')).toMatchObject({ status: 'unproven', detail: 'the step ran but did not report this check' })
    expect(byId(report, 'cp.sentry')).toMatchObject({ status: 'not-run', detail: 'did not run' })
  })

  it('UNREPORTED CHECK — at phase start a check that has not run yet says so', () => {
    writeLedger(w, [`manifest=${w.personal}`, `manifest=${w.cp}`])
    const { report } = render(w, 'start')
    expect(byId(report, 'cp.rls')).toMatchObject({ status: 'not-run', detail: 'not run yet' })
    expect(report!.checks.some((c) => c.status === 'ok')).toBe(false)
  })
})

describe('day-render: a step without registered checks is one check', () => {
  it('STEP MAPPING — a step with no registered check is a row only when it failed or did not run', () => {
    const body = cleanBody(w)
      .map((l) => (l.startsWith(`STEP${T}disp.0d${T}`) ? step('disp.0d', 'failed', 4, '0s 53b') : l))
    writeLedger(w, body.filter((l) => !l.startsWith(`STEP${T}disp.8${T}`)))
    const { report } = render(w, 'end')
    expect(byId(report, 'disp.0d')).toMatchObject({ status: 'problem', detail: 'exited 4', label: 'Daily run gate: start', group: 'Daily run' })
    expect(byId(report, 'disp.8')).toMatchObject({ status: 'not-run', detail: "didn't run", label: 'Events calendar refresh', group: 'Daily run' })
    // ok, attested and skipped steps are not rows: they are not checks, and never count as worked
    for (const id of ['disp.3', 'cp.w2c', 'cp.w1', 'cp.w3', 'disp.2a']) expect(byId(report, id)).toBeUndefined()
    expect(report!.checks.filter((c) => c.status === 'ok').map((c) => c.id).sort()).toEqual(['cp.grants', 'cp.lint', 'cp.rls', 'cp.sentry', 'pp.credits', 'pp.keys'])
  })

  it('STEP MAPPING — an attested step never produces an ok row; at phase start an unrecorded step is not a row', () => {
    writeLedger(w, [`manifest=${w.personal}`, step('disp.3', 'attested', 0, 'VM healthy'), `manifest=${w.cp}`])
    const { report } = render(w, 'start')
    expect(report!.checks.map((c) => c.id).sort()).toEqual(['cp.grants', 'cp.lint', 'cp.rls', 'cp.sentry', 'pp.credits', 'pp.keys'])
  })

  it('a step label loses trailing parentheticals; a day-gates label becomes "Daily run gate: X"', () => {
    expect(cleanStepLabel('Due Board (P1399)')).toBe('Due Board')
    expect(cleanStepLabel('CM Events calendar refresh (skipped only on 8a exit 2 or 3)')).toBe('CM Events calendar refresh')
    expect(cleanStepLabel('Agent VM heal (only when Step 3 is not healthy) (P1)')).toBe('Agent VM heal')
    expect(cleanStepLabel('day-gates.sh --mode=subday-return')).toBe('Daily run gate: subday-return')
    expect(cleanStepLabel('day-gates.sh --mode=start (D1 calendar staleness)')).toBe('Daily run gate: start')
  })

  it('STEP EXIT — a step that exited non-zero while all its checks are ok adds a problem check', () => {
    writeLedger(w, cleanBody(w).map((l) => (l.startsWith(`STEP${T}cp.w3${T}`) ? step('cp.w3', 'failed', 1, '40s 900b') : l)))
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.w3')).toMatchObject({ status: 'problem', detail: 'exited 1', label: 'Repo health', group: 'Daily run' })
    expect(buildView(report!, [], []).issues.map((i) => i.fp)).toContain('check:cp.w3')
  })

  it('…but not when a check of that step already reports the problem', () => {
    const body = cleanBody(w)
      .map((l) => (l.startsWith(`STEP${T}cp.w3${T}`) ? step('cp.w3', 'failed', 1) : l))
      .map((l) => (l.startsWith(`CHECK${T}cp.rls${T}`) ? check('cp.rls', 'problem', 'cp.w3', 'drift') : l))
    writeLedger(w, body)
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.w3')).toBeUndefined()
  })
})

describe('day-render: run state', () => {
  it('RUN STATE — phase start writes running; phase end with everything recorded is complete', () => {
    writeLedger(w, cleanBody(w))
    expect(render(w, 'start').report?.state).toBe('running')
    const end = render(w, 'end')
    expect(end.report?.state).toBe('complete')
    expect(end.report?.finished_at).toBe(NOW)
  })

  it('RUN STATE — a missing hard step → incomplete; a missing skippable step does not matter', () => {
    writeLedger(w, cleanBody(w).filter((l) => !l.startsWith(`STEP${T}cp.w2c${T}`)))
    expect(render(w, 'end').report?.state).toBe('complete')
    writeLedger(w, cleanBody(w).filter((l) => !l.startsWith(`STEP${T}disp.3${T}`)))
    expect(render(w, 'end').report?.state).toBe('incomplete')
  })

  it('RUN STATE — a registered check with no CHECK row → incomplete', () => {
    writeLedger(w, cleanBody(w).filter((l) => !l.startsWith(`CHECK${T}cp.grants${T}`)))
    expect(render(w, 'end').report?.state).toBe('incomplete')
  })

  it('RUN STATE — an abandoned ledger → abandoned', () => {
    writeLedger(w, cleanBody(w), { state: 'abandoned' })
    expect(render(w, 'end').report?.state).toBe('abandoned')
  })

  it('RUN STATE — a step list that has gone missing is a problem and never complete', () => {
    writeLedger(w, cleanBody(w))
    rmSync(w.cp)
    const { report } = render(w, 'end')
    expect(report?.state).toBe('incomplete')
    expect(byId(report, 'day.manifests')?.status).toBe('problem')
  })
})

describe('day-render: fingerprints survive a title change; a park holds', () => {
  it('FINGERPRINT — same check + fault key, different titles → same fp; a pass-1 park keeps it off the pass-2 card', () => {
    const hex = hexOf('cp.rls', 'rls:live-not-on-main')
    const p2 = '2026-10-05T05:30:00Z-11111'
    // pass 1
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'high', hex, 'Rules live for 19 days')])
    writeFinding(w, hex, '2 rules live', { check: 'cp.rls', fault_key: 'rls:live-not-on-main', title: 'Rules live for 19 days' })
    const one = render(w, 'end').report!
    // the founder parks it on pass 1
    writeFileSync(join(w.dayDir, 'decisions.jsonl'), JSON.stringify({ kind: 'option', target: 'cp.rls:rls:live-not-on-main', option_id: 'park', run_id: PASS, at: '2026-10-04T09:00:00Z' }) + '\n')
    // pass 2: the title text changed
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'high', hex, 'Rules live for 20 days')], { pass: p2, started: '2026-10-05T05:30:00Z' })
    writeFinding(w, hex, '2 rules live', { check: 'cp.rls', fault_key: 'rls:live-not-on-main', title: 'Rules live for 20 days' })
    let out = ''
    const code = run(['--ledger', w.ledger, '--day-dir', w.dayDir, '--phase', 'end', '--now', '2026-10-05T06:00:00Z'], { out: (s) => (out += s), err: () => {} })
    expect(code).toBe(0)
    const two = JSON.parse(readFileSync(reportPath(w, p2), 'utf-8')) as DayReport
    expect(one.issues[0].fp).toBe('cp.rls:rls:live-not-on-main')
    expect(two.issues[0].fp).toBe(one.issues[0].fp)
    expect(out).not.toContain('Rules live')
    const view = buildView(two, decisionsOf(w), [traceOf(one), traceOf(two)])
    expect(view.parked.map((p) => p.fp)).toEqual(['cp.rls:rls:live-not-on-main'])
    expect(view.issues.map((i) => i.fp)).not.toContain('cp.rls:rls:live-not-on-main')
    expect(out).toMatch(/· 1 parked/)
  })

  it('a sidecar issue takes its fields; Park is never the recommendation', () => {
    const hex = hexOf('cp.rls', 'rls:drift')
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'medium', hex, 'Rules drift')])
    writeFinding(w, hex, 'first line of body\nsecond', {
      check: 'cp.rls', fault_key: 'rls:drift', title: 'Rules drift', topic: 'Security', deadline: '2026-10-06', important: false,
      options: [{ id: 'park', label: 'Park' }, { id: 'merge', label: 'Merge them', agent: true }], recommend: 'park', confidence: 140, why: 'cheap', evidence: 'verified',
      point_b: 'Rules match main', review: 'weekly',
    })
    const r = render(w, 'end').report!
    const i = r.issues[0]
    expect(i).toMatchObject({ fp: 'cp.rls:rls:drift', topic: 'Security', check: 'cp.rls', deadline: '2026-10-06', point_a: 'first line of body', point_b: 'Rules match main', evidence: 'verified', review: 'weekly', source: 'Database access rules' })
    expect(i.important).toBeUndefined()
    expect(i.recommendation_confidence).toBe(100)
    expect(i.options.find((o) => o.id === 'park')?.recommended).toBeUndefined()
    expect(i.options.find((o) => o.id === 'merge')?.recommended).toBe(true)
    expect(i.evidence_text).toBe('first line of body\nsecond')
  })
})

describe('day-render: first seen', () => {
  const issueReport = (pass: string, started: string, fp: string): DayReport => ({
    schema: 2, pass_id: pass, started_at: started, state: 'complete', connections: [], checks: [{ id: 'x', label: 'x', status: 'ok' }],
    issues: [{ fp, topic: 't', title: 't', point_a: '', obstacle: '', point_b: '', options: [{ id: 'agent', label: 'Give to the agent' }] }],
  })

  it('FIRST SEEN — the minimum of the sidecar date, earlier reports (their first_seen and their dates) and this pass', () => {
    const fp = 'disp.3:vm:healer-gave-up'
    const earlier = [issueReport('a', '2026-09-30T05:00:00Z', fp), issueReport('b', '2026-09-29T05:00:00Z', fp), issueReport('c', '2026-09-27T05:00:00Z', 'other:fp')]
    expect(firstSeen(fp, '2026-09-20', earlier, STARTED)).toBe('2026-09-20')
    expect(firstSeen(fp, undefined, earlier, STARTED)).toBe('2026-09-29')
    expect(firstSeen('new:fp', undefined, earlier, STARTED)).toBe('2026-10-04')
    // the minimum, not the sidecar's word: an earlier report that saw it first wins over a later sidecar date
    expect(firstSeen(fp, '2026-10-01', earlier, STARTED)).toBe('2026-09-29')
    // an earlier report's own first_seen counts too
    const dated = { ...issueReport('d', '2026-09-30T05:00:00Z', fp) }
    dated.issues = [{ ...dated.issues[0], first_seen: '2026-09-15' }]
    expect(firstSeen(fp, '2026-09-25', [...earlier, dated], STARTED)).toBe('2026-09-15')
  })

  it('FIRST SEEN — through the CLI: earlier report files date the fault, within a day of the healer’s own clock', () => {
    const hex = hexOf('disp.3', 'vm:healer-gave-up')
    const fp = 'disp.3:vm:healer-gave-up'
    const healerSince = '2026-09-28T23:10:00Z' // what the healer's --first-seen would say
    writeReportFile(w, issueReport('2026-09-30T05-00-00Z-1', '2026-09-30T05:00:00Z', fp))
    writeReportFile(w, issueReport('2026-09-29T05-00-00Z-1', '2026-09-29T05:00:00Z', fp))
    mkdirSync(join(w.dayDir, 'reports'), { recursive: true })
    writeFileSync(join(w.dayDir, 'reports', 'garbage.json'), '{not json')
    writeLedger(w, [...cleanBody(w), find('disp.3', 'high', hex, 'Agent VM healer gave up')])
    writeFinding(w, hex, 'healer stopped', { check: 'disp.3', fault_key: 'vm:healer-gave-up', title: 'Agent VM healer gave up' })
    const r = render(w, 'end').report!
    const issue = r.issues.find((i) => i.fp === fp)!
    expect(issue.first_seen).toBe('2026-09-29')
    const ours = daysOpen(issue.first_seen, r.started_at)!
    const healer = daysOpen(healerSince, r.started_at)!
    expect(Math.abs(ours - healer)).toBeLessThanOrEqual(1)
    // and with the healer's (earlier) date in the sidecar, that date is used
    writeFinding(w, hex, 'healer stopped', { check: 'disp.3', fault_key: 'vm:healer-gave-up', title: 'Agent VM healer gave up', first_seen: '2026-09-28' })
    expect(render(w, 'end').report!.issues.find((i) => i.fp === fp)!.first_seen).toBe('2026-09-28')
  })
})

describe('day-render: legacy findings', () => {
  it('LEGACY FIND — no sidecar → find:<hex> with default options; Park never recommended', () => {
    const hex = 'abcdef0123456789'
    writeLedger(w, [...cleanBody(w), find('disp.2a', 'high', hex, 'GCP credit baseline stale')])
    writeFinding(w, hex, 'baseline is 40 days old\nmore')
    const r = render(w, 'end').report!
    const i = r.issues[0]
    expect(i).toMatchObject({ fp: `find:${hex}`, title: 'GCP credit baseline stale', important: true, point_a: 'baseline is 40 days old', obstacle: '', point_b: '', topic: 'Personal' })
    expect(i.options.map((o) => o.id)).toEqual(['agent', 'park'])
    expect(i.options[0].recommended).toBe(true)
    expect(i.options[1].recommended).toBeUndefined()
    expect(i.first_seen).toBe('2026-10-04')
  })

  it('an unusable sidecar falls back to the plain finding and says the detail could not be read', () => {
    const hex = hexOf('cp.rls', 'x')
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'low', hex, 'Some finding')])
    writeFinding(w, hex, 'body', '{broken')
    const r = render(w, 'end').report!
    expect(r.issues[0].fp).toBe(`find:${hex}`)
    expect(byId(r, 'day.findings')).toMatchObject({ status: 'problem' })
  })

  it('the same finding recorded twice in one pass is one issue (the later title wins)', () => {
    const hex = 'abcdef0123456789'
    writeLedger(w, [...cleanBody(w), find('disp.2a', 'low', hex, 'first'), find('disp.2a', 'low', hex, 'second')])
    writeFinding(w, hex, 'b')
    const r = render(w, 'end')
    expect(r.code).toBe(0)
    expect(r.report!.issues.map((i) => i.title)).toEqual(['second'])
  })
})

describe('day-render: DATA sections', () => {
  const sections = {
    connections: [{ id: 'sentry', label: 'Sentry', state: 'not-connected', why: 'login expired' }, { id: 'beeper', label: 'Beeper', state: 'failed' }],
    people: [{ id: 'p1', name: 'Ada', confirmed: false }, { id: 'p2', name: 'Bo', confirmed: true, background: MARKER }],
    monitoring: { quotas: [{ id: 'claude', label: 'Claude', collected: true, remaining_pct: 40 }] },
    stats: { readings: [{ id: 'signups', label: 'Signups', collected: true, value: 3 }] },
    reflection: { model: 'claude-opus-x', statements: [{ id: 's1', text: 'Stop doing X' }] },
    reviews: ['weekly'],
    run: { model: 'claude-opus-x', unpushed_commits: 2 },
    notes: [{ id: 'shipped', title: 'What shipped', body: 'line 1\nline 2', review: 'weekly' }],
  }

  it('DATA — every section lands in the report as given', () => {
    const body = cleanBody(w)
    for (const [k, v] of Object.entries(sections)) {
      writeData(w, k, v)
      body.push(data(k))
    }
    writeLedger(w, body)
    const r = render(w, 'end').report!
    expect(r.connections).toEqual(sections.connections)
    expect(r.people).toEqual(sections.people)
    expect(r.monitoring).toEqual(sections.monitoring)
    expect(r.stats).toEqual(sections.stats)
    expect(r.reflection).toEqual(sections.reflection)
    expect(r.reviews).toEqual(['weekly'])
    expect(r.model).toBe('claude-opus-x')
    expect(r.unpushed_commits).toBe(2)
    expect(r.notes).toEqual(sections.notes)
    expect(r.checks.some((c) => c.id.startsWith('day.data'))).toBe(false)
  })

  it('DATA — a malformed file is omitted and becomes a problem check, never silently dropped', () => {
    writeData(w, 'connections', '[{"id": "sentry", oops')
    writeData(w, 'people', [{ id: 'p1' }]) // no name: not a person
    writeData(w, 'notes', [{ id: 'n1', title: 'no body' }])
    writeLedger(w, [...cleanBody(w), data('connections'), data('people'), data('stats'), data('notes')]) // stats has no file
    const { code, report } = render(w, 'end')
    expect(code).toBe(0)
    expect(report!.connections).toEqual([])
    expect(report!.people).toBeUndefined()
    expect(report!.stats).toBeUndefined()
    expect(report!.notes).toBeUndefined()
    for (const s of ['connections', 'people', 'stats', 'notes']) expect(byId(report, `day.data.${s}`)).toMatchObject({ status: 'problem', detail: 'could not be read' })
    expect(buildView(report!, [], []).issues.map((i) => i.fp)).toContain('check:day.data.people')
  })
})

describe('day-render: the written file', () => {
  it('WRITTEN FILE — passes parseReport with no dropped rows, mode 0600 in a 0700 folder, decisions untouched', () => {
    const hex = hexOf('cp.rls', 'rls:drift')
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'high', hex, 'Rules drift'), find('disp.2a', 'low', '0123456789abcdef', 'legacy')])
    writeFinding(w, hex, 'b', { check: 'cp.rls', fault_key: 'rls:drift', title: 'Rules drift' })
    writeFinding(w, '0123456789abcdef', 'c')
    expect(render(w, 'end').code).toBe(0)
    const parsed = parseReport(JSON.parse(readFileSync(reportPath(w), 'utf-8')))
    expect(parsed.kind).toBe('ok')
    if (parsed.kind === 'ok') expect(parsed.droppedRows).toBe(0)
    expect(statSync(reportPath(w)).mode & 0o777).toBe(0o600)
    expect(statSync(join(w.dayDir, 'reports')).mode & 0o777).toBe(0o700)
    expect(readdirSync(join(w.dayDir, 'reports'))).toEqual([`${fileIdOf(PASS)}.json`])
    expect(existsSync(join(w.dayDir, 'decisions.jsonl'))).toBe(false)
    expect(fileIdOf(PASS)).toBe('2026-10-04T05-37-45Z-97246')
  })

  it('WOULD NOT VALIDATE — exit 3 and nothing written; the earlier file stays as it was', () => {
    writeLedger(w, cleanBody(w))
    expect(render(w, 'start').code).toBe(0)
    const before = readFileSync(reportPath(w), 'utf-8')
    writeLedger(w, cleanBody(w), { started: 'yesterday morning' })
    const r = render(w, 'end')
    expect(r.code).toBe(3)
    expect(r.out).toBe('')
    expect(readFileSync(reportPath(w), 'utf-8')).toBe(before)
    expect(readdirSync(join(w.dayDir, 'reports'))).toEqual([`${fileIdOf(PASS)}.json`])
  })

  it('usage: a missing ledger or a bad flag exits 2 and writes nothing', () => {
    expect(render(w, 'end').code).toBe(2)
    writeLedger(w, cleanBody(w))
    expect(run(['--ledger', w.ledger, '--day-dir', w.dayDir, '--phase', 'middle'], { out: () => {}, err: () => {} })).toBe(2)
    expect(run(['--ledger', w.ledger, '--day-dir', w.dayDir], { out: () => {}, err: () => {} })).toBe(2)
    expect(existsSync(join(w.dayDir, 'reports'))).toBe(false)
  })
})

/** Many issues, broken connections, people, a park: the richest synthetic pass. */
function richWorld(): void {
  const body = cleanBody(w)
    .map((l) => (l.startsWith(`CHECK${T}cp.rls${T}`) ? check('cp.rls', 'problem', 'cp.w3', '2 rules live, not on main') : l))
    .map((l) => (l.startsWith(`CHECK${T}cp.lint${T}`) ? check('cp.lint', 'problem', 'cp.w3', '3 warnings') : l))
    .map((l) => (l.startsWith(`CHECK${T}cp.sentry${T}`) ? check('cp.sentry', 'not-run', 'cp.w1', 'login expired', 'agent') : l))
    .filter((l) => !l.startsWith(`CHECK${T}pp.keys${T}`))
  const finds: [string, string, object | undefined, string][] = [
    ['cp.rls', 'rls:live', { check: 'cp.rls', fault_key: 'rls:live', title: 'Database rules are live before review', important: true, deadline: '2026-10-05' }, 'high'],
    ['disp.3', 'vm:healer', { check: 'disp.3', fault_key: 'vm:healer', title: 'Agent VM healer gave up', first_seen: '2026-09-20' }, 'high'],
    ['disp.2a', 'gcp:baseline', { check: 'disp.2a', fault_key: 'gcp:baseline', title: 'Cloud credit baseline is stale' }, 'medium'],
    ['cp.grants', 'grants:new', { check: 'cp.grants', fault_key: 'grants:new', title: 'A new function is callable by anyone', deadline: '2026-10-20' }, 'low'],
    ['cp.w1', 'parked:thing', { check: 'cp.w1', fault_key: 'parked:thing', title: 'Old parked thing' }, 'low'],
    ['cp.smoke', 'reply:post', { check: 'cp.smoke', fault_key: 'reply:post', title: 'Replies waiting on the event post', options: [{ id: 'reply', label: 'I reply today' }, { id: 'park', label: 'Park' }] }, 'low'],
  ]
  for (const [chk, fk, side, sev] of finds) {
    const hex = hexOf(chk, fk)
    body.push(find(chk, sev, hex, (side as { title: string }).title, true))
    writeFinding(w, hex, `${MARKER} evidence body`, side)
  }
  body.push(find('disp.2a', 'low', 'fedcba9876543210', 'Mirror of one repo is stale'))
  writeFinding(w, 'fedcba9876543210', `${MARKER} legacy body`)
  writeData(w, 'connections', [{ id: 'sentry', label: 'Sentry', state: 'not-connected' }, { id: 'beeper', label: 'Beeper', state: 'failed' }, { id: 'gh', label: 'GitHub', state: 'ok' }])
  writeData(w, 'people', [{ id: 'p1', name: 'Ada', confirmed: false }, { id: 'p2', name: 'Bo', confirmed: true, background: MARKER }, { id: 'p3', name: 'Cy' }])
  body.push(data('connections'), data('people'))
  writeLedger(w, body)
  mkdirSync(w.dayDir, { recursive: true })
  writeFileSync(join(w.dayDir, 'decisions.jsonl'), JSON.stringify({ kind: 'option', target: 'cp.w1:parked:thing', option_id: 'park', run_id: 'older-run', at: '2026-10-01T09:00:00Z' }) + '\n')
}

describe('day-render: the card', () => {
  it('CARD — ≤ 25 lines, counts, first 6 issues in the board’s order, parked excluded, no internal words', () => {
    richWorld()
    const { code, out, report } = render(w, 'end')
    expect(code).toBe(0)
    const lines = out.trimEnd().split('\n')
    expect(lines.length).toBeLessThanOrEqual(25)
    const view = buildView(report!, decisionsOf(w), [traceOf(report!)])
    expect(lines[0]).toMatch(/^DAY · \w{3} \d{1,2} \w{3}, \d{2}:\d{2} · /)
    const urgent = view.issues.filter((i) => i.urgent).length
    expect(urgent).toBe(2)
    expect(view.counts.total).toBe(6)
    expect(lines[1]).toBe(`${view.issues.length} issues · 1 needs you · ${view.issues.length - 1} an agent can fix · 2 urgent · 2 of 6 checks worked · 1 parked`)
    expect(view.issues.length).toBeGreaterThan(6)
    const shown = lines.filter((l) => /^ {2}\d+\. /.test(l)).map((l) => l.replace(/^ {2}\d+\. ((Urgent|Important)( · Important)? — )?/, ''))
    expect(shown).toEqual(view.issues.slice(0, 6).map((i) => i.title))
    expect(lines).toContain(`  + ${view.issues.length - 6} more`)
    expect(out).not.toContain('Old parked thing')
    expect(out).toContain('Connections: Sentry not connected · Beeper didn’t work')
    expect(out).toContain('New people: 3 (1 not confirmed)')
    expect(lines[lines.length - 1]).toBe('Decide on the Day page: http://localhost:9052 → Day')
    expect(out).not.toMatch(/ledger|fingerprint|\bstep|pass_id|cp\.w|disp\.|find:/i)
    expect(out).not.toContain(MARKER)
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\x1b/)
  })

  it('CARD — the first issue line carries Urgent · Important, and the header reads in local time', () => {
    richWorld()
    const { report } = render(w, 'end')
    const view = buildView(report!, decisionsOf(w), [traceOf(report!)])
    const card = renderCard(report!, view, { kanbanUrl: 'http://k', timeZone: 'Europe/Berlin' })
    const lines = card.split('\n')
    expect(lines[0]).toBe('DAY · Sun 4 Oct, 07:37 · stopped early: 2 checks have no result')
    expect(lines[2]).toBe(`  1. Urgent · Important — ${view.issues[0].title}`)
  })

  it('CARD — connection and people lines only when relevant; a clean run says so', () => {
    writeLedger(w, [...cleanBody(w), data('connections'), data('people')])
    writeData(w, 'connections', [{ id: 'gh', label: 'GitHub', state: 'ok' }])
    writeData(w, 'people', [])
    const { out } = render(w, 'end')
    expect(out).not.toContain('Connections:')
    expect(out).not.toContain('New people')
    expect(out.split('\n')[0]).toMatch(/ · complete$/)
    expect(out).toContain('\n0 issues · 6 of 6 checks worked\n')
  })

  it('CARD — control characters and < > | in a title never reach the terminal; plurals are right', () => {
    const hex = hexOf('cp.rls', 'esc')
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'low', hex, 'x')])
    writeFinding(w, hex, 'b', { check: 'cp.rls', fault_key: 'esc', title: 'Bad \u001b[31mred\u001b[0m\n<b>title</b> | x > y' })
    const { out } = render(w, 'end')
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f<>|]/)
    expect(out).toContain('Bad [31mred [0m btitle/b x y')
    expect(out).toContain('\n1 issue · 1 an agent can fix · 6 of 6 checks worked\n')
  })

  it('--print detail lists every issue and every check with its status word; --print none prints nothing', () => {
    richWorld()
    const detail = render(w, 'end', ['--print', 'detail'])
    for (const c of detail.report!.checks) expect(detail.out).toContain(c.label)
    expect(detail.out).toMatch(/Database access rules: Problem/)
    expect(detail.out).toMatch(/Point A: /)
    expect(render(w, 'end', ['--print', 'none']).out).toBe('')
  })
})

describe('day-render: Phase D — fit, risk, and the plain-language overlay', () => {
  const side = (extra: Record<string, unknown>) => readSidecar(JSON.stringify({ check: 'c', fault_key: 'k', title: 't', ...extra }))!

  it('FIT — a sidecar carries a one-line risk (≤ 200) and reads "fit" as an alias of "confidence"', () => {
    expect(side({ fit: 70 }).confidence).toBe(70)
    expect(side({ fit: 140 }).confidence).toBe(100)
    expect(side({ confidence: 55, fit: 70 }).confidence).toBe(55) // the older name wins when both are given
    expect(side({ risk: '  Could lock a guest out.  ' }).risk).toBe('Could lock a guest out.')
    expect(side({ risk: 'a\nb' }).risk).toBe('a b')
    expect(side({ risk: 'x'.repeat(500) }).risk).toHaveLength(200)
    expect(side({ risk: 7 }).risk).toBeUndefined()
    expect(side({ risk: '  ' }).risk).toBeUndefined()
  })

  it('FIT — fit and risk land on the issue, and the board reads them back', () => {
    const hex = hexOf('cp.rls', 'fit:one')
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'low', hex, 'T', true)])
    writeFinding(w, hex, 'b', { check: 'cp.rls', fault_key: 'fit:one', title: 'T', fit: 82, risk: 'Could break the sign-in page.', evidence: 'verified' })
    const { report } = render(w, 'end')
    expect(report!.issues[0]).toMatchObject({ recommendation_confidence: 82, risk: 'Could break the sign-in page.', evidence: 'verified' })
    const back = parseReport(JSON.parse(readFileSync(reportPath(w), 'utf-8')))
    expect(back.kind === 'ok' && back.report.issues[0].risk).toBe('Could break the sign-in page.')
  })

  const OVERLAY_FP = 'cp.rls:rls:live'
  const ORIGINAL = { title: 'Database rules are live before review', point_a: '2 policies on live, 0 in migrations.', obstacle: 'Not reviewed.', point_b: 'Live rules match main.' }
  const PLAIN = { fp: OVERLAY_FP, title: 'Tuesday’s guests could be locked out', point_a: 'Two access rules went live without a second pair of eyes.', obstacle: 'Nobody has checked they match the plan.', point_b: 'Guests get in on Tuesday.', extra_field: 'ignored' }

  /** One written finding (cp.rls) and one check nobody wrote up (cp.lint → a synthesised issue). */
  function plainWorld(overlay?: unknown) {
    const hex = hexOf('cp.rls', 'rls:live')
    const body = cleanBody(w)
      .map((l) => (l.startsWith(`CHECK${T}cp.rls${T}`) ? check('cp.rls', 'problem', 'cp.w3', '2 rules live') : l))
      .map((l) => (l.startsWith(`CHECK${T}cp.lint${T}`) ? check('cp.lint', 'problem', 'cp.w3', '3 warnings') : l))
    body.push(find('cp.rls', 'high', hex, ORIGINAL.title, true))
    writeFinding(w, hex, `${MARKER} evidence`, { check: 'cp.rls', fault_key: 'rls:live', ...ORIGINAL })
    if (overlay !== undefined) {
      writeData(w, 'plain', overlay)
      body.push(data('plain'))
    }
    writeLedger(w, body)
  }
  const issueOf = (r: DayReport | undefined, fp: string) => r?.issues.find((i) => i.fp === fp)

  it('PLAIN — no overlay: the original text, and no "technical" field', () => {
    plainWorld()
    const i = issueOf(render(w, 'end').report, OVERLAY_FP)!
    expect(i).toMatchObject(ORIGINAL)
    expect(i.technical).toBeUndefined()
  })

  it('PLAIN — the overlay becomes the displayed title and points; the originals are kept in "technical"; extra fields are ignored', () => {
    plainWorld([PLAIN])
    const { code, report } = render(w, 'end')
    expect(code).toBe(0)
    const i = issueOf(report, OVERLAY_FP)!
    expect(i).toMatchObject({ title: PLAIN.title, point_a: PLAIN.point_a, obstacle: PLAIN.obstacle, point_b: PLAIN.point_b })
    expect(i.technical).toEqual(ORIGINAL)
    expect(JSON.stringify(report)).not.toContain('extra_field')
    expect(report!.checks.some((c) => c.id.startsWith('day.data'))).toBe(false)
    // the board reads it back from the written file, and the fingerprint did not move
    const back = parseReport(JSON.parse(readFileSync(reportPath(w), 'utf-8')))
    expect(back.kind === 'ok' && back.report.issues.find((x) => x.fp === OVERLAY_FP)?.technical).toEqual(ORIGINAL)
  })

  it('PLAIN — an overlay row for an fp that is not in the run is ignored and counted, never a problem', () => {
    plainWorld([PLAIN, { ...PLAIN, fp: 'cp.nothing:here' }, { ...PLAIN, fp: 'cp.other:there' }])
    const { code, report, err } = render(w, 'end')
    expect(code).toBe(0)
    expect(issueOf(report, OVERLAY_FP)!.title).toBe(PLAIN.title)
    expect(report!.issues.map((i) => i.fp)).not.toContain('cp.nothing:here')
    expect(report!.checks.some((c) => c.id === 'day.data.plain')).toBe(false)
    expect(err).toContain('day-render: 2 plain-language rows matched no issue\n')
  })

  it('PLAIN — a malformed overlay is a day.data.plain problem check, and the original text stays', () => {
    const bad: unknown[] = [
      '[{"fp": "cp.rls:rls:live", oops', // not JSON
      { ...PLAIN }, // not an array
      [{ ...PLAIN, title: 'x'.repeat(121) }], // title over 120
      [{ ...PLAIN, obstacle: 'x'.repeat(301) }], // another field over 300
      [{ ...PLAIN, point_b: undefined }], // a missing field
      [PLAIN, { fp: 'a:b', title: 'only a title' }], // one bad row spoils the overlay: never half-applied silently
      [{ ...PLAIN, fp: 'has space' }],
    ]
    for (const overlay of bad) {
      rmSync(`${w.ledger}.data`, { recursive: true, force: true })
      plainWorld(overlay)
      const { code, report } = render(w, 'end')
      expect(code, JSON.stringify(overlay)).toBe(0)
      expect(byId(report, 'day.data.plain'), JSON.stringify(overlay)).toMatchObject({ status: 'problem', detail: 'could not be read' })
      const i = issueOf(report, OVERLAY_FP)!
      expect(i).toMatchObject(ORIGINAL)
      expect(i.technical).toBeUndefined()
    }
  })

  it('PLAIN — a check nobody wrote up is a card too: its overlay is applied and its fingerprint stays', () => {
    plainWorld([{ fp: 'check:cp.lint', title: 'Code style problems', point_a: 'A few style warnings.', obstacle: 'They pile up.', point_b: 'A clean build.' }])
    const { report } = render(w, 'end')
    const cards = buildView(report!, [], []).issues.filter((x) => x.fp === 'check:cp.lint')
    expect(cards).toHaveLength(1) // exactly one card for it, not a written one plus a synthesised twin
    const i = issueOf(report, 'check:cp.lint')!
    expect(i.title).toBe('Code style problems')
    expect(i.technical!.title).toMatch(/^Lint: /)
    expect(i.check).toBe('cp.lint')
    expect(i.options.map((o) => o.id)).toEqual(['agent', 'park'])
    expect(i.options.find((o) => o.recommended)!.agent).toBe(true)
  })

  it('PLAIN — --phase issues prints the cards as JSON for the plain-language pass, and writes nothing', () => {
    richWorld()
    writeData(w, 'plain', [{ ...PLAIN, fp: 'cp.rls:rls:live' }])
    const body = readFileSync(w.ledger, 'utf-8')
    writeFileSync(w.ledger, `${body}${data('plain')}\n`)
    const ledgerBefore = readFileSync(w.ledger, 'utf-8')
    const { code, out, err, report } = render(w, 'issues')
    expect(code).toBe(0)
    expect(report).toBeUndefined()
    expect(existsSync(join(w.dayDir, 'reports'))).toBe(false)
    expect(readFileSync(w.ledger, 'utf-8')).toBe(ledgerBefore)
    expect(err).toBe('')
    const cards = JSON.parse(out) as { fp: string; topic: string; title: string; point_a: string; obstacle: string; point_b: string; options: { label: string; recommended?: boolean }[]; evidence_text?: string }[]
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThan(6)
    const rls = cards.find((c) => c.fp === 'cp.rls:rls:live')!
    expect(rls.title).toBe('Database rules are live before review') // the original: the plain pass reads the technical text, never its own earlier rewrite
    expect(Object.keys(rls).sort()).toEqual(['evidence_text', 'fp', 'obstacle', 'options', 'point_a', 'point_b', 'title', 'topic'])
    expect(rls.options.some((o) => o.recommended === true)).toBe(true)
    expect(rls.options.every((o) => typeof o.label === 'string')).toBe(true)
    expect(cards.some((c) => c.fp.startsWith('check:'))).toBe(true) // the cards nobody wrote up are in
    expect(cards.map((c) => c.fp)).not.toContain('cp.w1:parked:thing') // parked: not on the card
  })

  it('PLAIN — --phase issues cuts the evidence to 600 characters', () => {
    const hex = hexOf('cp.rls', 'long')
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'low', hex, 'T', true)])
    writeFinding(w, hex, 'e'.repeat(1500), { check: 'cp.rls', fault_key: 'long', title: 'T' })
    const cards = JSON.parse(render(w, 'issues').out) as { evidence_text: string }[]
    expect(cards[0].evidence_text.length).toBeLessThanOrEqual(600)
    expect(cards[0].evidence_text.length).toBeGreaterThan(500)
  })

  it('PLAIN — the bare runbook invocation works: only --phase issues, ledger and day dir from the defaults (real process)', async () => {
    richWorld()
    const home = mkdtempSync(join(tmpdir(), 'day-home-'))
    try {
      writeFileSync(join(home, '.claude-day-ledger'), readFileSync(w.ledger, 'utf-8'))
      cpSync(`${w.ledger}.findings`, join(home, '.claude-day-ledger.findings'), { recursive: true })
      cpSync(`${w.ledger}.data`, join(home, '.claude-day-ledger.data'), { recursive: true })
      const kanban = resolve(__dirname, '../..')
      const go = (extra: string[]) =>
        new Promise<string>((res, rej) =>
          execFile(join(kanban, 'node_modules/.bin/tsx'), ['scripts/day-render.ts', '--phase', 'issues', ...extra], { cwd: kanban, env: { ...process.env, HOME: home, NODE_NO_WARNINGS: '1' } }, (err, stdout) => (err ? rej(err) : res(stdout))),
        )
      const bare = JSON.parse(await go([])) as { fp: string }[]
      expect(bare.length).toBeGreaterThan(6)
      expect(JSON.parse(await go(['--print', 'card']))).toEqual(bare) // --print is accepted and ignored
      expect(existsSync(join(home, '.claude-day'))).toBe(false) // nothing written
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 60_000)

  it('PLAIN — --phase issues with no ledger is a usage error that prints nothing', () => {
    const r = run(['--ledger', join(w.root, 'missing'), '--day-dir', w.dayDir, '--phase', 'issues'], { out: () => undefined, err: () => undefined })
    expect(r).toBe(2)
  })
})

describe('day-render: privacy', () => {
  const STDERR_VOCAB = /^day-render: (report written \((running|complete|incomplete|abandoned)\)|usage: .*|no ledger at the given path|the ledger has no pass id|the report would not validate \([a-z_,-]+\)|could not write the report \([A-Z]+\)|some earlier reports could not be read \(\d+\)|marked \d+ unfinished earlier runs? incomplete|\d+ plain-language rows? matched no issue)$/

  // NODE_NO_WARNINGS: tsx triggers Node's own fixed-text deprecation notice (DEP0205); the
  // assertion is about the renderer's lines, which carry no content.
  it('PRIVACY — stdout carries only the card; stderr only fixed-vocabulary lines (in a real process)', async () => {
    richWorld()
    writeData(w, 'stats', { readings: [{ id: MARKER, label: MARKER, collected: true }] })
    const kanban = resolve(__dirname, '../..')
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((res, rej) =>
      execFile(join(kanban, 'node_modules/.bin/tsx'), ['scripts/day-render.ts', '--ledger', w.ledger, '--day-dir', w.dayDir, '--phase', 'end', '--now', NOW], { cwd: kanban, env: { ...process.env, NODE_NO_WARNINGS: '1' } }, (err, stdout, stderr) =>
        err ? rej(err) : res({ stdout, stderr })),
    )
    const report = JSON.parse(readFileSync(reportPath(w), 'utf-8')) as DayReport
    const view = buildView(report, decisionsOf(w), [traceOf(report)])
    expect(stdout).toBe(renderCard(report, view, { kanbanUrl: 'http://localhost:9052' }) + '\n')
    expect(stdout).not.toContain(MARKER)
    expect(stderr).not.toContain(MARKER)
    for (const l of stderr.split('\n').filter(Boolean)) expect(l).toMatch(STDERR_VOCAB)
  }, 30_000)

  it('PRIVACY — in-process, errors carry no content either', () => {
    richWorld()
    const r1 = render(w, 'end')
    writeLedger(w, cleanBody(w), { started: `${MARKER}` })
    const r2 = render(w, 'end')
    for (const err of [r1.err, r2.err]) {
      expect(err).not.toContain(MARKER)
      for (const l of err.split('\n').filter(Boolean)) expect(l).toMatch(STDERR_VOCAB)
    }
    expect(r2.code).toBe(3)
  })
})

describe('day-render: where a status may come from (review 2026-10-04)', () => {
  it('PROVENANCE — a CHECK row from the wrong step is ignored and reported, never trusted', () => {
    const body = cleanBody(w).filter((l) => !l.startsWith(`CHECK${T}cp.rls${T}`))
    body.push(check('cp.rls', 'ok', 'cp.w1', 'all fine')) // cp.rls belongs to cp.w3
    writeLedger(w, body)
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.rls')).toMatchObject({ status: 'unproven', detail: 'the step ran but did not report this check' })
    expect(byId(report, 'day.records')).toMatchObject({ status: 'problem', detail: 'a status came from the wrong place' })
    expect(report!.state).toBe('incomplete')
  })

  it('PROVENANCE — a wrong-step row does not displace the right one', () => {
    writeLedger(w, [...cleanBody(w), check('cp.rls', 'problem', 'cp.w1', 'bogus'), check('cp.lint', 'problem', '-', 'bogus', 'agent')])
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.rls')).toMatchObject({ status: 'ok', detail: 'live matches main' })
    expect(byId(report, 'cp.lint')).toMatchObject({ status: 'ok', detail: 'clean' })
    expect(byId(report, 'day.records')?.detail).toBe('2 statuses came from the wrong place')
  })

  it('AGENT CANNOT OVERRULE — a later agent row never replaces a cmd row; agent over agent, later wins', () => {
    writeLedger(w, [
      ...cleanBody(w).map((l) => (l.startsWith(`CHECK${T}cp.rls${T}`) ? check('cp.rls', 'problem', 'cp.w3', 'drift exit 1') : l)),
      check('cp.rls', 'ok', 'cp.w3', 'looks fine to me', 'agent'),
      check('cp.sentry', 'problem', 'cp.w1', '3 new issues', 'agent'),
    ])
    const { report } = render(w, 'end')
    expect(byId(report, 'cp.rls')).toMatchObject({ status: 'problem', detail: 'drift exit 1' })
    expect(byId(report, 'cp.sentry')).toMatchObject({ status: 'problem', detail: 'agent-reported: 3 new issues' })
    expect(byId(report, 'day.records')).toBeUndefined()
  })
})

describe('day-render: killed passes and lost details (review 2026-10-04)', () => {
  const running = (pass: string, started: string, state: DayReport['state'] = 'running'): DayReport => ({
    schema: 2, pass_id: pass, started_at: started, state, connections: [], checks: [{ id: 'x', label: 'x', status: 'ok' }], issues: [], ...({ future_field: 1 } as object),
  })

  it('KILLED PASS — at phase start another report still running is closed as incomplete, atomically; others untouched', () => {
    writeReportFile(w, running('2026-10-03T05-00-00Z-1', '2026-10-03T05:00:00Z'))
    writeReportFile(w, running('2026-10-02T05-00-00Z-1', '2026-10-02T05:00:00Z', 'complete'))
    const completePath = reportPath(w, '2026-10-02T05-00-00Z-1')
    const before = readFileSync(completePath, 'utf-8')
    writeLedger(w, cleanBody(w))
    const r = render(w, 'start')
    expect(r.code).toBe(0)
    const killed = JSON.parse(readFileSync(reportPath(w, '2026-10-03T05-00-00Z-1'), 'utf-8'))
    expect(killed.state).toBe('incomplete')
    expect(killed.future_field).toBe(1) // rewritten as it was, only the state changed
    expect(statSync(reportPath(w, '2026-10-03T05-00-00Z-1')).mode & 0o777).toBe(0o600)
    expect(readFileSync(completePath, 'utf-8')).toBe(before)
    expect(r.report?.state).toBe('running') // this pass is the one running now
    expect(r.err).toContain('marked 1 unfinished earlier run incomplete')
    expect(readdirSync(join(w.dayDir, 'reports')).filter((n) => !n.endsWith('.json'))).toEqual([])
  })

  it('KILLED PASS — this pass’s own running report is not closed by its own start, and phase end closes nothing', () => {
    writeReportFile(w, running('2026-10-03T05-00-00Z-1', '2026-10-03T05:00:00Z'))
    writeLedger(w, cleanBody(w))
    expect(render(w, 'end').report?.state).toBe('complete')
    expect(JSON.parse(readFileSync(reportPath(w, '2026-10-03T05-00-00Z-1'), 'utf-8')).state).toBe('running')
    render(w, 'start')
    expect(render(w, 'start').report?.state).toBe('running')
  })

  it('KEYED FINDING — a fault-key finding whose sidecar is missing is a problem, and still shown', () => {
    const hex = hexOf('cp.rls', 'rls:drift')
    writeLedger(w, [...cleanBody(w), find('cp.rls', 'high', hex, 'Rules drift', true)])
    writeFinding(w, hex, 'body') // no .json beside it
    const r = render(w, 'end').report!
    expect(r.issues.map((i) => i.fp)).toEqual([`find:${hex}`])
    expect(byId(r, 'day.findings')).toMatchObject({ status: 'problem', detail: '1 finding detail could not be read' })
  })

  it('REGISTRY MISSING — a step list with no check list beside it is a problem and never complete', () => {
    rmSync(join(w.root, 'cp', 'day-cp-checks.tsv'))
    writeLedger(w, cleanBody(w))
    const r = render(w, 'end').report!
    expect(byId(r, 'day.registry')).toMatchObject({ status: 'problem', detail: 'the check list for day-cp is missing', group: 'Daily run' })
    expect(r.state).toBe('incomplete')
  })

  it('TOPIC — a review finding with no topic is filed under its review', () => {
    const hex = hexOf('cp.lint', 'weekly:x')
    writeLedger(w, [...cleanBody(w), find('cp.lint', 'low', hex, 'Weekly proposal', true)])
    writeFinding(w, hex, 'b', { check: 'cp.lint', fault_key: 'weekly:x', title: 'Weekly proposal', review: 'weekly' })
    expect(render(w, 'end').report!.issues[0].topic).toBe('Weekly review')
    writeFinding(w, hex, 'b', { check: 'cp.lint', fault_key: 'weekly:x', title: 'Weekly proposal', review: 'monthly', topic: 'Product' })
    expect(render(w, 'end').report!.issues[0].topic).toBe('Product')
  })
})

describe('day-render: imports', () => {
  it('imports nothing outside tools/kanban and no Supabase', () => {
    const src = readFileSync(resolve(__dirname, '../../scripts/day-render.ts'), 'utf-8')
    const specs = [...src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) {
      expect(s).not.toMatch(/supabase/i)
      if (s.startsWith('.')) expect(resolve(__dirname, '../../scripts', s).startsWith(resolve(__dirname, '../..'))).toBe(true)
    }
  })
})

describe('day-render: Park is always offered', () => {
  it('a finding with its own options still offers Park, last, never recommended', async () => {
    const { buildIssues } = await import('../../scripts/day-render')
    const fp = 'ab'.repeat(8) // a finding's 16-hex file name
    const { issues } = buildIssues({
      finds: [{ check: 'disp.vm', severity: 'high', key: fp, title: 'VM', keyed: true }],
      files: new Map([[fp, { body: 'b', sidecar: JSON.stringify({ check: 'disp.vm', fault_key: 'vm:outreach-down', title: 'VM', options: [{ id: 'wait', label: 'Keep waiting' }, { id: 'update', label: 'Update', agent: true }], recommend: 'wait' }) }]]),
      checks: [],
      steps: [],
      earlier: [],
      startedAt: '2026-10-04T05:00:00Z',
    } as never)
    const opts = issues[0].options
    expect(opts.map((o) => o.id)).toEqual(['wait', 'update', 'park'])
    expect(opts.find((o) => o.id === 'park')?.recommended).toBeFalsy()
    expect(opts.find((o) => o.id === 'wait')?.recommended).toBe(true)
  })
})
