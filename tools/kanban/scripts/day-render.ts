// P1399 Phase B: the /day renderer. Reads the step ledger, the step lists and their check
// registries, the findings and the data sections, and writes the run's report (schema v2) into
// the private day-data folder. Then prints the terminal card.
//
//   npx tsx scripts/day-render.ts --phase start|end|issues [--ledger PATH] [--day-dir PATH]
//        [--print card|detail|none] [--now ISO] [--kanban-url URL]
//
// Exit codes: 0 ok · 1 the report could not be written · 2 usage, or no ledger · 3 the report
// would not validate (nothing is written).
//
// Rules this file owns (spec §5, contract phase-b-contract.md):
//   - "Did not run" never reads as clean. A registered check nobody reported is `unproven` when
//     its step ran and `not-run` when it did not; never `ok`. A step that exited non-zero while
//     every one of its checks says fine is a problem of its own.
//   - No phantom checks: a step with no registered check is not a check. It becomes a row only
//     when it failed or (at the end) never ran, in the "Daily run" group; an attested step never
//     reads as a check that worked.
//   - Provenance: a registered check takes a status only from its own step, and an agent row
//     never overrules a command row (an agent cannot overrule an exit code).
//   - A pass that died is closed: at --phase start another report still `running` becomes
//     `incomplete`, so a killed pass never reads as in progress forever.
//   - The fingerprint of a finding is `<check>:<fault key>`, never the title, so a decision made
//     on one run still matches the same fault on the next.
//   - Only the founder parks: the renderer never writes decisions.jsonl and never recommends Park.
//   - Nothing is silently dropped: a data section or a finding detail that cannot be read becomes
//     a `problem` check; a step list that has gone missing makes the run incomplete.
//   - Privacy: stdout carries the card (or the detail, when asked), nothing else. stderr carries
//     fixed-vocabulary lines only. The report is written atomically, mode 0600.
//
// Pure functions are exported for the tests; `run` does the I/O, and `main` only wires it to the
// process.

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import {
  PARK,
  allIssues,
  buildView,
  isAgentWork,
  parseDecisions,
  parseReport,
  traceOf,
  type CheckStatus,
  type DayCheck,
  type DayDecision,
  type DayIssue,
  type DayOption,
  type DayReport,
  type DayView,
  type Review,
} from '../src/lib/day'
import { checkStatus } from '../src/components/day/statusWords'

// ---------------------------------------------------------------------------------------
// Vocabulary shared with src/lib/day.ts's reader. A value outside these is not written.

const ID = /^[A-Za-z0-9._:-]{1,80}$/
const FAULT_KEY = /^[a-z0-9][a-z0-9._:-]{0,59}$/
const OPTION_ID = /^[A-Za-z0-9._-]{1,40}$/
const FILE_KEY = /^[A-Za-z0-9]{1,64}$/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/
const STATUSES: CheckStatus[] = ['ok', 'problem', 'not-run', 'unproven', 'skipped']
const SECTIONS = ['connections', 'people', 'monitoring', 'stats', 'reflection', 'reviews', 'run', 'notes', 'plain'] as const
type Section = (typeof SECTIONS)[number]

const MAX_EVIDENCE = 2000
const MAX_EVIDENCE_FOR_PLAIN_PASS = 600
const PLAIN_TITLE_MAX = 120
const PLAIN_BODY_MAX = 300
const CARD_ISSUES = 6
const RUN_GROUP = 'Daily run'
const REVIEW_TOPIC: Record<Review, string> = { weekly: 'Weekly review', monthly: 'Monthly review' }

const PARK_OPTION: DayOption = { id: PARK, label: 'Park: stop asking until I bring it back' }

const DEFAULT_OPTIONS: DayOption[] = [
  { id: 'agent', label: 'Give to the agent', agent: true },
  { id: PARK, label: 'Park: stop asking until I bring it back' },
]

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x : undefined)
const isoDay = (x: unknown): string | undefined => (typeof x === 'string' && ISO_DAY.test(x) && Number.isFinite(Date.parse(x)) ? x : undefined)
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// ---------------------------------------------------------------------------------------
// The ledger.

export interface StepRow { id: string; status: string; rc: number; detail: string }
export interface CheckRow { id: string; status: CheckStatus; step: string; source: string; detail: string }
/** `keyed` = recorded with a fault key, so it must have a sidecar */
export interface FindRow { check: string; severity: string; key: string; title: string; keyed: boolean }

export interface Ledger {
  header: Record<string, string>
  manifests: string[]
  /** last row per step id wins */
  steps: Map<string, StepRow>
  /** every row per check id, in ledger order (pickRow decides); Map order = first appearance */
  checks: Map<string, CheckRow[]>
  finds: FindRow[]
  data: Section[]
  /** lines that could not be read */
  bad: number
}

export function parseLedger(textIn: string): Ledger {
  const l: Ledger = { header: {}, manifests: [], steps: new Map(), checks: new Map(), finds: [], data: [], bad: 0 }
  for (const line of textIn.split('\n')) {
    if (!line.trim()) continue
    const f = line.split('\t')
    const head = /^([a-z_]+)=(.*)$/.exec(line)
    if (f.length === 1 && head) {
      if (head[1] === 'manifest') l.manifests.push(head[2])
      else if (!(head[1] in l.header)) l.header[head[1]] = head[2] // the first value wins, as day-step.sh reads it
    } else if (f[0] === 'STEP' && f.length >= 4 && ID.test(f[1])) {
      l.steps.set(f[1], { id: f[1], status: f[2], rc: Number.parseInt(f[3], 10) || 0, detail: f.slice(5).join(' ').trim() })
    } else if (f[0] === 'CHECK' && f.length >= 3 && ID.test(f[1])) {
      const status = STATUSES.includes(f[2] as CheckStatus) ? (f[2] as CheckStatus) : 'unproven'
      // Only an explicit `cmd` is a command's own result; anything else is an agent's word.
      const row: CheckRow = { id: f[1], status, step: f[3] ?? '-', source: f[5] === 'cmd' ? 'cmd' : 'agent', detail: f.slice(6).join(' ').trim() }
      l.checks.set(f[1], [...(l.checks.get(f[1]) ?? []), row])
    } else if (f[0] === 'FIND' && f.length >= 4 && FILE_KEY.test(f[3])) {
      l.finds.push({ check: f[1], severity: f[2], key: f[3], title: (f[5] ?? '').trim(), keyed: f[6] === 'keyed' })
    } else if (f[0] === 'DATA' && f.length >= 2) {
      // An unknown section is a newer producer: ignored, like an unknown field (rule 3).
      if ((SECTIONS as readonly string[]).includes(f[1]) && !l.data.includes(f[1] as Section)) l.data.push(f[1] as Section)
    } else {
      l.bad++
    }
  }
  return l
}

/** A command's row beats an agent's (an agent cannot overrule an exit code); within one source the later row wins. */
export function pickRow(rows: CheckRow[]): CheckRow | undefined {
  let best: CheckRow | undefined
  for (const r of rows) if (!best || r.source === 'cmd' || best.source !== 'cmd') best = r
  return best
}

// ---------------------------------------------------------------------------------------
// Step lists (manifests) and the check registries beside them.

export interface ManifestStep { id: string; hard: boolean; label: string; group: string }
export interface RegisteredCheck { id: string; step: string; label: string; group?: string; severity?: 'high' | 'normal'; connection?: string }
export interface StepList { steps: ManifestStep[]; checks: RegisteredCheck[] }
/** missing = step lists that could not be read · noRegistry = names of step lists with no check list beside them */
export interface Registries { lists: StepList[]; missing: number; noRegistry: string[]; bad: number }

const rowsOf = (t: string) => t.split('\n').filter((r) => r.trim() && !r.trimStart().startsWith('#')).map((r) => r.split('\t').map((c) => c.trim()))

/** The owner's group for a step that has no registered checks (contract). */
export const ownerGroup = (manifestPath: string) => (basename(manifestPath) === 'day-steps.tsv' ? 'Personal' : 'ClarityPledge')
/** `day-cp-steps.tsv` → `day-cp`: the step list's name, as the founder reads it. */
export const listName = (manifestPath: string) => basename(manifestPath).replace(/-steps\.tsv$/, '').replace(/\.tsv$/, '')

/**
 * A step's label as a check label: trailing parentheticals ("(P1399)", "(skipped only on …)") go,
 * and a day-gates.sh line becomes "Daily run gate: <mode>".
 */
export function cleanStepLabel(label: string): string {
  const gate = /day-gates\.sh\s+--mode=([A-Za-z0-9_-]+)/.exec(label)
  if (gate) return `Daily run gate: ${gate[1]}`
  let s = label.trim()
  for (let prev = ''; prev !== s; ) {
    prev = s
    s = s.replace(/\s*\([^()]*\)\s*$/, '').trim()
  }
  return s || label.trim()
}

/** `<name>-steps.tsv` → `<name>-checks.tsv` beside it. */
export const registryPathFor = (manifestPath: string) => (manifestPath.endsWith('-steps.tsv') ? `${manifestPath.slice(0, -'-steps.tsv'.length)}-checks.tsv` : null)

export function parseManifest(t: string, group: string): { steps: ManifestStep[]; bad: number } {
  const steps: ManifestStep[] = []
  let bad = 0
  for (const [id, , policy, label] of rowsOf(t)) {
    if (!ID.test(id)) { bad++; continue }
    steps.push({ id, hard: policy !== 'skippable', label: label || id, group })
  }
  return { steps, bad }
}

export function parseRegistry(t: string): { checks: RegisteredCheck[]; bad: number } {
  const checks: RegisteredCheck[] = []
  let bad = 0
  for (const [id, step, label, group, severity, connection] of rowsOf(t)) {
    if (!ID.test(id) || !step || !ID.test(step)) { bad++; continue }
    const c: RegisteredCheck = { id, step, label: label || id }
    if (group) c.group = group
    if (severity === 'high' || severity === 'normal') c.severity = severity
    if (connection && ID.test(connection)) c.connection = connection
    checks.push(c)
  }
  return { checks, bad }
}

// ---------------------------------------------------------------------------------------
// Checks.

export interface BuildChecksInput { ledger: Ledger; registries: Registries; phase: 'start' | 'end' }

const notRunDetail = (phase: 'start' | 'end') => (phase === 'start' ? 'not run yet' : 'did not run')
const agentDetail = (row: CheckRow) => (row.source === 'agent' ? `agent-reported${row.detail ? `: ${row.detail}` : ''}` : row.detail)

/** The row a registered check accepts: only from its own step (provenance), then pickRow. */
export function acceptedRow(ledger: Ledger, rc: RegisteredCheck): CheckRow | undefined {
  return pickRow((ledger.checks.get(rc.id) ?? []).filter((r) => r.step === rc.step))
}

/**
 * A step with no registered check is not a check (no phantom rows, no inflated "worked" count).
 * It becomes a row only when it failed, or never ran by the end of the pass.
 */
function stepProblem(step: ManifestStep, rec: StepRow | undefined, phase: 'start' | 'end'): Omit<DayCheck, 'id'> | null {
  const base = { label: cleanStepLabel(step.label), group: RUN_GROUP }
  if (!rec) return phase === 'end' ? { ...base, status: 'not-run', detail: "didn't run" } : null
  if (rec.status === 'failed' || rec.rc !== 0) return { ...base, status: 'problem', detail: `exited ${rec.rc}` }
  if (rec.status === 'ok' || rec.status === 'attested' || rec.status === 'skipped') return null
  return { ...base, status: 'unproven', detail: 'recorded with an unknown result' }
}

/**
 * Every check of the run, in step-list order: registered checks, then step problems, then
 * unregistered CHECK ids. `misplaced` counts rows for a registered check that came from another step.
 */
export function buildChecks({ ledger, registries, phase }: BuildChecksInput): { checks: DayCheck[]; misplaced: number } {
  const out: DayCheck[] = []
  const used = new Set<string>()
  let misplaced = 0
  const add = (id: string, c: Omit<DayCheck, 'id'>) => {
    let unique = id
    for (let n = 2; used.has(unique); n++) unique = `${id}.${n}`
    used.add(unique)
    out.push({ id: unique, ...c })
  }
  const stepGroup = new Map<string, string>()
  for (const list of registries.lists) {
    const byStep = new Map<string, DayCheck[]>()
    for (const rc of list.checks) {
      if (used.has(rc.id)) continue
      misplaced += (ledger.checks.get(rc.id) ?? []).filter((r) => r.step !== rc.step).length
      const row = acceptedRow(ledger, rc)
      const meta = {
        label: rc.label,
        ...(rc.group ? { group: rc.group } : {}),
        ...(rc.severity ? { severity: rc.severity } : {}),
        ...(rc.connection ? { connection: rc.connection } : {}),
      }
      let c: Omit<DayCheck, 'id'>
      if (row) {
        const detail = agentDetail(row)
        c = { ...meta, status: row.status, ...(detail ? { detail } : {}) }
      } else if (ledger.steps.has(rc.step)) {
        c = { ...meta, status: 'unproven', detail: 'the step ran but did not report this check' }
      } else {
        c = { ...meta, status: 'not-run', detail: notRunDetail(phase) }
      }
      add(rc.id, c)
      byStep.set(rc.step, [...(byStep.get(rc.step) ?? []), { id: rc.id, ...c }])
    }
    for (const step of list.steps) {
      stepGroup.set(step.id, step.group)
      const rec = ledger.steps.get(step.id)
      const own = byStep.get(step.id)
      if (!own) {
        const p = stepProblem(step, rec, phase)
        if (p) add(step.id, p)
        continue
      }
      // The step failed but none of its checks says so: the failure must not vanish.
      const failed = !!rec && (rec.status === 'failed' || rec.rc !== 0)
      if (failed && own.every((c) => c.status === 'ok' || c.status === 'skipped')) {
        add(step.id, { label: cleanStepLabel(step.label), group: RUN_GROUP, status: 'problem', detail: `exited ${rec.rc}` })
      }
    }
  }
  for (const [id, rows] of ledger.checks) {
    const row = pickRow(rows)
    if (used.has(id) || !row) continue
    const group = stepGroup.get(row.step)
    const detail = agentDetail(row)
    add(id, { label: id, status: row.status, ...(detail ? { detail } : {}), ...(group ? { group } : {}) })
  }
  return { checks: out, misplaced }
}

/** complete = every hard step recorded, every registered check reported from its own step, and no step or check list missing. */
export function runState(ledger: Ledger, registries: Registries, phase: 'start' | 'end'): DayReport['state'] {
  if (phase === 'start') return 'running'
  if (ledger.header.state === 'abandoned') return 'abandoned'
  if (registries.missing > 0) return 'incomplete'
  if (registries.noRegistry.length > 0) return 'incomplete'
  for (const list of registries.lists) {
    if (list.steps.some((s) => s.hard && !ledger.steps.has(s.id))) return 'incomplete'
    if (list.checks.some((c) => !acceptedRow(ledger, c))) return 'incomplete'
  }
  return 'complete'
}

// ---------------------------------------------------------------------------------------
// Issues.

export interface Sidecar {
  check: string
  fault_key: string
  title: string
  topic?: string
  deadline?: string
  first_seen?: string
  important?: boolean
  options?: DayOption[]
  recommend?: string
  /** read from `confidence`, or its alias `fit` (the founder reads it as "Fit N%") */
  confidence?: number
  /** the main risk of the recommended option: one line, ≤ 200 */
  risk?: string
  why?: string
  evidence?: 'verified' | 'unverified'
  point_a?: string
  obstacle?: string
  point_b?: string
  review?: Review
}

/** A sidecar we can use, or null (then the finding is read as a plain one). */
export function readSidecar(raw: string): Sidecar | null {
  let o: unknown
  try {
    o = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(o) || typeof o.check !== 'string' || !ID.test(o.check) || typeof o.fault_key !== 'string' || !FAULT_KEY.test(o.fault_key) || !text(o.title)) return null
  if (`${o.check}:${o.fault_key}`.length > 100) return null
  const s: Sidecar = { check: o.check, fault_key: o.fault_key, title: o.title as string }
  for (const k of ['topic', 'why', 'point_a', 'obstacle', 'point_b', 'recommend'] as const) if (typeof o[k] === 'string') s[k] = o[k] as string
  if (isoDay(o.deadline)) s.deadline = o.deadline as string
  if (isoDay(o.first_seen)) s.first_seen = (o.first_seen as string).slice(0, 10)
  if (typeof o.important === 'boolean') s.important = o.important
  const fit = [o.confidence, o.fit].find((v) => typeof v === 'number' && Number.isFinite(v)) as number | undefined
  if (fit !== undefined) s.confidence = Math.round(Math.min(100, Math.max(0, fit)))
  if (typeof o.risk === 'string' && o.risk.replace(/\s+/g, ' ').trim()) s.risk = o.risk.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (o.evidence === 'verified' || o.evidence === 'unverified') s.evidence = o.evidence
  if (o.review === 'weekly' || o.review === 'monthly') s.review = o.review
  if (Array.isArray(o.options)) {
    const seen = new Set<string>()
    const opts: DayOption[] = []
    for (const x of o.options) {
      if (!isObj(x) || typeof x.id !== 'string' || !OPTION_ID.test(x.id) || !text(x.label)) continue
      if (x.id === 'own' || x.id === 'ask' || x.id === 'other' || seen.has(x.id)) continue // page-only ids, duplicates
      seen.add(x.id)
      opts.push({ id: x.id, label: x.label as string, ...(x.agent === true ? { agent: true } : {}) })
    }
    if (opts.length) s.options = opts
  }
  return s
}

/**
 * The earliest of: the sidecar's date (the check's own clock), every earlier report's first_seen
 * for this fp, the date of every earlier report that carried it, and this pass's date.
 */
export function firstSeen(fp: string, sidecarFirst: string | undefined, earlier: Pick<DayReport, 'started_at' | 'issues'>[], startedAt: string): string {
  const dates = [startedAt.slice(0, 10)]
  if (sidecarFirst && isoDay(sidecarFirst)) dates.push(sidecarFirst.slice(0, 10))
  for (const r of earlier) {
    const issue = r.issues.find((i) => i.fp === fp)
    if (!issue) continue
    dates.push(r.started_at.slice(0, 10))
    if (isoDay(issue.first_seen)) dates.push((issue.first_seen as string).slice(0, 10))
  }
  return dates.sort()[0]
}

export interface FindingFiles { body?: string; sidecar?: string }
export interface BuildIssuesInput {
  finds: FindRow[]
  files: Map<string, FindingFiles>
  checks: DayCheck[]
  steps: ManifestStep[]
  earlier: Pick<DayReport, 'started_at' | 'issues'>[]
  startedAt: string
}

function withRecommendation(options: DayOption[], recommend: string | undefined, why: string | undefined): DayOption[] {
  // Only the founder parks: Park is never the recommendation, whatever the finding asked for.
  const pick = options.find((o) => o.id === recommend && o.id !== PARK) ?? options.find((o) => o.id !== PARK)
  const out = options.map((o) => (o === pick ? { ...o, recommended: true, ...(why ? { why } : {}) } : { ...o }))
  // ...and he can always park: a finding that brings its own options still offers Park last (first
  // real run, 2026-10-04: the VM issue offered only "wait" and "update").
  if (!out.some((o) => o.id === PARK)) out.push({ ...PARK_OPTION })
  return out
}

/** Findings → issues. Unusable sidecars are counted (never silently dropped) and read as plain findings. */
export function buildIssues(input: BuildIssuesInput): { issues: DayIssue[]; unusable: number } {
  const checks = new Map(input.checks.map((c) => [c.id, c]))
  const steps = new Map(input.steps.map((s) => [s.id, s]))
  const latest = new Map<string, FindRow>() // one issue per finding: the later row wins
  for (const f of input.finds) {
    latest.delete(f.key)
    latest.set(f.key, f)
  }
  let unusable = 0
  const byFp = new Map<string, DayIssue>()
  for (const row of latest.values()) {
    const files = input.files.get(row.key) ?? {}
    const side = files.sidecar === undefined ? null : readSidecar(files.sidecar)
    // A sidecar that is unreadable, or missing for a finding recorded with a fault key, is lost detail.
    if (files.sidecar === undefined ? row.keyed : !side) unusable++
    const checkId = side?.check ?? row.check
    const fp = side ? `${side.check}:${side.fault_key}` : `find:${row.key}`
    const check = checks.get(checkId)
    const step = steps.get(checkId)
    const body = (files.body ?? '').replace(/\s+$/, '')
    const issue: DayIssue = {
      fp,
      topic: side?.topic || (side?.review ? REVIEW_TOPIC[side.review] : undefined) || check?.group || step?.group || 'Checks',
      title: side?.title ?? (row.title || 'A finding with no title'),
      point_a: side?.point_a ?? body.split('\n')[0] ?? '',
      obstacle: side?.obstacle ?? '',
      point_b: side?.point_b ?? '',
      options: withRecommendation(side?.options ?? DEFAULT_OPTIONS, side?.recommend, side?.why),
    }
    if (check) issue.check = checkId
    if (side?.important ?? row.severity === 'high') issue.important = true
    if (side?.deadline) issue.deadline = side.deadline
    issue.first_seen = firstSeen(fp, side?.first_seen, input.earlier, input.startedAt)
    if (side?.review) issue.review = side.review
    const source = check?.label ?? step?.label
    if (source) issue.source = source
    if (side?.confidence !== undefined) issue.recommendation_confidence = side.confidence
    if (side?.risk) issue.risk = side.risk
    if (side?.evidence) issue.evidence = side.evidence
    if (body) issue.evidence_text = truncate(body, MAX_EVIDENCE)
    byFp.delete(fp)
    byFp.set(fp, issue)
  }
  return { issues: [...byFp.values()], unusable }
}

// ---------------------------------------------------------------------------------------
// The plain-language overlay (Phase D, founder decision 10): the `plain` data section rewrites a
// card into what it means for the founder. The original wording is kept in `technical`.

export interface PlainRow { fp: string; title: string; point_a: string; obstacle: string; point_b: string }

/** The overlay's rows, or null when it is not something the board can apply as given. Extra fields are ignored. */
export function readPlain(v: unknown): PlainRow[] | null {
  if (!Array.isArray(v)) return null
  const rows: PlainRow[] = []
  for (const r of v) {
    if (!isObj(r) || typeof r.fp !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(r.fp)) return null
    const row: Partial<PlainRow> = { fp: r.fp }
    for (const [k, max] of [['title', PLAIN_TITLE_MAX], ['point_a', PLAIN_BODY_MAX], ['obstacle', PLAIN_BODY_MAX], ['point_b', PLAIN_BODY_MAX]] as const) {
      const t = typeof r[k] === 'string' ? (r[k] as string).trim() : ''
      if (!t || t.length > max) return null
      row[k] = t
    }
    rows.push(row as PlainRow)
  }
  return rows
}

const ISSUE_KEYS = ['fp', 'topic', 'check', 'title', 'deadline', 'review', 'point_a', 'obstacle', 'point_b', 'more_info', 'source', 'options', 'recommendation_confidence', 'risk', 'evidence', 'evidence_text'] as const

/**
 * Apply the overlay to the report's issues (in place). A card the board would make from a check
 * nobody wrote up is a card too: it is written into the report with its overlay, under the same
 * fingerprint, so the board does not make it twice. Returns how many rows matched no card.
 */
export function applyPlain(report: DayReport, rows: PlainRow[], earlier: Pick<DayReport, 'started_at' | 'issues'>[]): number {
  const byFp = new Map(rows.map((r) => [r.fp, r])) // the later row wins
  const used = new Set<string>()
  const overlay = (i: DayIssue, r: PlainRow) => {
    i.technical = { title: i.title, point_a: i.point_a, obstacle: i.obstacle, point_b: i.point_b }
    i.title = r.title
    i.point_a = r.point_a
    i.obstacle = r.obstacle
    i.point_b = r.point_b
    used.add(r.fp)
  }
  for (const i of report.issues) {
    const r = byFp.get(i.fp)
    if (r) overlay(i, r)
  }
  const unwritten = [...byFp.keys()].filter((fp) => !used.has(fp))
  if (unwritten.length) {
    for (const view of allIssues(report)) {
      const r = byFp.get(view.fp)
      if (!view.synthetic || !r || used.has(view.fp)) continue
      const issue = { options: [] } as unknown as DayIssue
      for (const k of ISSUE_KEYS) if (view[k] !== undefined) (issue as unknown as Obj)[k] = view[k]
      if (view.important) issue.important = true
      issue.first_seen = firstSeen(view.fp, undefined, earlier, report.started_at)
      overlay(issue, r)
      report.issues.push(issue)
    }
  }
  return byFp.size - used.size
}

// ---------------------------------------------------------------------------------------
// Data sections.

const probe = (extra: Obj) =>
  parseReport({ schema: 2, pass_id: 'probe', started_at: '2026-01-01T00:00:00Z', state: 'running', connections: [], checks: [], issues: [], ...extra })
const noDrops = (extra: Obj) => {
  const p = probe(extra)
  return p.kind === 'ok' && p.droppedRows === 0
}

/** Is this section's JSON something the board reads as given? */
export function dataUsable(section: Section, v: unknown): boolean {
  switch (section) {
    case 'connections':
    case 'people':
    case 'notes':
      return Array.isArray(v) && noDrops({ [section]: v })
    case 'monitoring':
    case 'stats':
      return isObj(v)
    case 'reflection':
      return isObj(v) && Array.isArray(v.statements) && (v.model === undefined || !!text(v.model)) && noDrops({ reflection: v })
    case 'plain':
      return readPlain(v) !== null
    case 'reviews':
      return Array.isArray(v) && v.every((r) => r === 'weekly' || r === 'monthly')
    case 'run':
      return isObj(v) && (v.model === undefined || !!text(v.model)) &&
        (v.unpushed_commits === undefined || (typeof v.unpushed_commits === 'number' && Number.isFinite(v.unpushed_commits) && v.unpushed_commits >= 0))
  }
}

// ---------------------------------------------------------------------------------------
// The report.

export interface RenderInputs {
  ledger: Ledger
  registries: Registries
  findingFiles: Map<string, FindingFiles>
  /** section → its file text, or null when the file could not be read */
  dataFiles: Map<Section, string | null>
  earlier: DayReport[]
  phase: 'start' | 'end'
  now: string
}

const runProblem = (label: string, detail: string): Omit<DayCheck, 'id'> => ({ label, status: 'problem', detail, group: RUN_GROUP })

export function buildReport(inp: RenderInputs): DayReport {
  return buildReportDetailed(inp).report
}

/** The report, and how many plain-language rows matched no card (counted, never silently dropped). */
export function buildReportDetailed(inp: RenderInputs): { report: DayReport; plainUnmatched: number } {
  const { ledger, registries, phase } = inp
  const { checks, misplaced } = buildChecks({ ledger, registries, phase })
  const extra: DayCheck[] = []

  const data: Partial<Record<Section, unknown>> = {}
  for (const [section, raw] of inp.dataFiles) {
    let v: unknown
    try {
      v = raw === null ? undefined : JSON.parse(raw)
    } catch {
      v = undefined
    }
    if (v !== undefined && dataUsable(section, v)) data[section] = v
    else extra.push({ id: `day.data.${section}`, ...runProblem(`Daily data: ${section}`, 'could not be read') })
  }

  const startedAt = ledger.header.started_at ?? ''
  const steps = registries.lists.flatMap((l) => l.steps)
  const { issues, unusable } = buildIssues({ finds: ledger.finds, files: inp.findingFiles, checks, steps, earlier: inp.earlier, startedAt })

  if (registries.missing > 0) extra.push({ id: 'day.manifests', ...runProblem('Daily run setup', `${registries.missing} of the lists of what to run could not be read`) })
  const names = registries.noRegistry
  if (names.length) {
    extra.push({ id: 'day.registry', ...runProblem('Check list', names.length === 1 ? `the check list for ${names[0]} is missing` : `the check lists for ${names.join(', ')} are missing`) })
  }
  if (unusable > 0) extra.push({ id: 'day.findings', ...runProblem('Finding details', `${plural(unusable, 'finding detail')} could not be read`) })
  const bad = ledger.bad + registries.bad
  const record = [
    bad && `${plural(bad, 'line')} could not be read`,
    misplaced && (misplaced === 1 ? 'a status came from the wrong place' : `${misplaced} statuses came from the wrong place`),
  ].filter(Boolean)
  if (record.length) extra.push({ id: 'day.records', ...runProblem('Daily run record', record.join('; ')) })

  const report: DayReport = {
    schema: 2,
    pass_id: ledger.header.pass_id ?? '',
    started_at: startedAt,
    state: runState(ledger, registries, phase),
    connections: (data.connections as DayReport['connections']) ?? [],
    checks: [...checks, ...extra.filter((e) => !checks.some((c) => c.id === e.id))],
    issues,
  }
  if (phase === 'end') report.finished_at = inp.now
  const run = data.run as { model?: string; unpushed_commits?: number } | undefined
  if (run?.model) report.model = run.model
  if (run?.unpushed_commits !== undefined) report.unpushed_commits = run.unpushed_commits
  if (data.reviews) report.reviews = data.reviews as Review[]
  if (data.monitoring) report.monitoring = data.monitoring as DayReport['monitoring']
  if (data.stats) report.stats = data.stats as DayReport['stats']
  if (data.reflection) report.reflection = data.reflection as DayReport['reflection']
  if (data.people) report.people = data.people as DayReport['people']
  if (data.notes) report.notes = data.notes as DayReport['notes']
  const plainUnmatched = data.plain ? applyPlain(report, readPlain(data.plain) ?? [], inp.earlier) : 0
  return { report, plainUnmatched }
}

/** Problems (fixed vocabulary) that stop the report from being written; empty = it validates. */
export function validateReport(report: DayReport): string[] {
  const p = parseReport(JSON.parse(JSON.stringify(report)))
  if (p.kind === 'invalid') return p.problems
  if (p.kind === 'other-schema') return ['schema']
  if (p.droppedRows > 0) return ['rows']
  return []
}

/** File id = pass_id with every character outside [A-Za-z0-9._-] replaced by '-'. */
export const fileIdOf = (passId: string) => passId.replace(/[^A-Za-z0-9._-]/g, '-')

// ---------------------------------------------------------------------------------------
// The card and the detail (plain text, no ANSI, no internal words).

/**
 * Foreign text for the terminal: control characters (escape sequences included) become spaces,
 * and `<` `>` `|` are removed, so a relayed card can never carry a redirect or a pipe.
 */
// eslint-disable-next-line no-control-regex
const plain = (s: string, max = 100) => truncate(s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/[<>|]/g, '').replace(/\s+/g, ' ').trim(), max)

function when(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return plain(iso, 40)
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(d)
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return `${p('weekday')} ${p('day')} ${p('month')}, ${p('hour')}:${p('minute')}`
}

function stateWords(report: DayReport): string {
  if (report.state === 'running') return 'still running'
  if (report.state === 'complete') return 'complete'
  if (report.state === 'abandoned') return 'abandoned'
  const missing = report.checks.filter((c) => c.status === 'not-run' || c.status === 'unproven').length
  return missing ? `stopped early: ${plural(missing, 'check')} ${missing === 1 ? 'has' : 'have'} no result` : 'incomplete'
}

const header = (report: DayReport, timeZone?: string) => `DAY · ${when(report.started_at, timeZone)} · ${stateWords(report)}`
const tags = (i: { urgent: boolean; important: boolean }) => [i.urgent && 'Urgent', i.important && 'Important'].filter(Boolean).join(' · ')

export interface CardOptions { kanbanUrl: string; timeZone?: string }

export function renderCard(report: DayReport, view: DayView, opts: CardOptions): string {
  const urgent = view.issues.filter((i) => i.urgent).length
  // The same split Start fixing uses: a card the recommendation hands to the agent is agent work;
  // every other card needs the founder.
  const agentWork = view.issues.filter((i) => isAgentWork(i)).length
  const needYou = view.issues.filter((i) => !isAgentWork(i)).length
  const counts = [
    plural(view.issues.length, 'issue'),
    needYou && `${needYou} ${needYou === 1 ? 'needs' : 'need'} you`,
    agentWork && `${agentWork} an agent can fix`,
    urgent && `${urgent} urgent`,
    `${view.counts.worked} of ${plural(view.counts.total, 'check')} worked`,
    view.parked.length && `${view.parked.length} parked`,
  ].filter(Boolean)
  const L = [header(report, opts.timeZone), counts.join(' · ')]
  view.issues.slice(0, CARD_ISSUES).forEach((i, n) => {
    const t = tags(i)
    L.push(`  ${n + 1}. ${t ? `${t} — ` : ''}${plain(i.title)}`)
  })
  if (view.issues.length > CARD_ISSUES) L.push(`  + ${view.issues.length - CARD_ISSUES} more`)
  const broken = view.connections.filter((c) => c.state !== 'ok')
  if (broken.length) {
    L.push(`Connections: ${broken.map((c) => `${plain(c.label, 40)} ${c.state === 'not-connected' ? 'not connected' : 'didn’t work'}`).join(' · ')}`)
  }
  if (report.people?.length) {
    const unconfirmed = report.people.filter((p) => p.confirmed === false).length
    L.push(`New people: ${report.people.length}${unconfirmed ? ` (${unconfirmed} not confirmed)` : ''}`)
  }
  L.push(`Decide on the Day page: ${plain(opts.kanbanUrl, 200)} → Day`)
  return L.join('\n')
}

/** Every issue (title, Point A / Obstacle / Point B, evidence), the parked ones, every check with its status word. */
export function renderDetail(report: DayReport, view: DayView, opts: CardOptions): string {
  const L = [header(report, opts.timeZone), '', 'Issues']
  if (!view.issues.length) L.push('  none')
  view.issues.forEach((i, n) => {
    const t = tags(i)
    L.push(`  ${n + 1}. ${t ? `${t} — ` : ''}${plain(i.title, 200)}`)
    L.push(`     Point A: ${plain(i.point_a, 400)}`, `     Obstacle: ${plain(i.obstacle, 400)}`, `     Point B: ${plain(i.point_b, 400)}`)
    L.push(`     Evidence: ${i.evidence === 'verified' ? 'verified' : 'not verified'}`)
    for (const line of (i.evidence_text ?? '').split('\n').filter((x) => x.trim())) L.push(`       ${plain(line, 200)}`)
  })
  if (view.parked.length) {
    L.push('', 'Parked')
    for (const p of view.parked) L.push(`  - ${plain(p.title, 200)} (parked ${p.parked.at.slice(0, 10)})`)
  }
  L.push('', 'Checks')
  for (const c of view.checks) L.push(`  ${plain(c.label, 80)}: ${checkStatus(c.status).word}${c.detail ? ` — ${plain(c.detail, 200)}` : ''}`)
  L.push('', `Decide on the Day page: ${plain(opts.kanbanUrl, 200)} → Day`)
  return L.join('\n')
}

// ---------------------------------------------------------------------------------------
// I/O. Nothing below logs content: stderr lines are fixed vocabulary.

export function readLedgerFiles(ledgerPath: string, ledger: Ledger): { findingFiles: Map<string, FindingFiles>; dataFiles: Map<Section, string | null> } {
  const read = (p: string) => {
    try {
      return readFileSync(p, 'utf-8')
    } catch {
      return undefined
    }
  }
  const findingFiles = new Map<string, FindingFiles>()
  for (const f of ledger.finds) {
    const dir = `${ledgerPath}.findings`
    findingFiles.set(f.key, { body: read(join(dir, `${f.key}.txt`)), sidecar: read(join(dir, `${f.key}.json`)) })
  }
  const dataFiles = new Map<Section, string | null>()
  for (const s of ledger.data) dataFiles.set(s, read(join(`${ledgerPath}.data`, `${s}.json`)) ?? null)
  return { findingFiles, dataFiles }
}

export function readRegistries(manifests: string[]): Registries {
  const out: Registries = { lists: [], missing: 0, noRegistry: [], bad: 0 }
  for (const m of manifests) {
    let t: string
    try {
      t = readFileSync(m, 'utf-8')
    } catch {
      out.missing++
      continue
    }
    const { steps, bad } = parseManifest(t, ownerGroup(m))
    out.bad += bad
    const regPath = registryPathFor(m)
    let checks: RegisteredCheck[] = []
    try {
      if (!regPath) throw new Error('no-registry-name')
      const r = parseRegistry(readFileSync(regPath, 'utf-8'))
      checks = r.checks
      out.bad += r.bad
    } catch {
      // Without its check list a step list's checks cannot be required: never complete.
      out.noRegistry.push(listName(m))
    }
    out.lists.push({ steps, checks })
  }
  return out
}

/** Every readable report in <dayDir>/reports except this pass's own. */
export function readReports(dayDir: string, passId: string): { reports: DayReport[]; unreadable: number } {
  const dir = join(dayDir, 'reports')
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'))
  } catch {
    return { reports: [], unreadable: 0 }
  }
  const reports: DayReport[] = []
  let unreadable = 0
  for (const n of names) {
    if (n === `${fileIdOf(passId)}.json`) continue
    try {
      const p = parseReport(JSON.parse(readFileSync(join(dir, n), 'utf-8')))
      if (p.kind === 'ok') {
        if (p.report.pass_id !== passId) reports.push(p.report)
      } else unreadable++
    } catch {
      unreadable++
    }
  }
  return { reports, unreadable }
}

export function readDecisions(dayDir: string): DayDecision[] {
  try {
    return parseDecisions(readFileSync(join(dayDir, 'decisions.jsonl'), 'utf-8')).lines
  } catch {
    return []
  }
}

function ensurePrivateDir(dir: string) {
  if (existsSync(dir)) return
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
}

/** Atomic, mode 0600: a temp file beside it (not *.json, so the board never lists it), then rename. */
function writeJsonAtomic(dir: string, name: string, value: unknown): void {
  const tmp = join(dir, `.${name}.tmp-${process.pid}`)
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    chmodSync(tmp, 0o600)
    renameSync(tmp, join(dir, name))
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* nothing to clean */
    }
    throw err
  }
}

export function writeReport(dayDir: string, report: DayReport): void {
  ensurePrivateDir(dayDir)
  const dir = join(dayDir, 'reports')
  ensurePrivateDir(dir)
  writeJsonAtomic(dir, `${fileIdOf(report.pass_id)}.json`, report)
}

/**
 * A pass that died never finished its report: at --phase start every OTHER report still `running`
 * is rewritten as `incomplete` (same file, every other field as it was, validated like a new
 * report, atomically). Returns how many were closed.
 */
export function closeKilledRuns(dayDir: string, passId: string): number {
  const dir = join(dayDir, 'reports')
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json') && n !== `${fileIdOf(passId)}.json`)
  } catch {
    return 0
  }
  let closed = 0
  for (const n of names) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(dir, n), 'utf-8'))
    } catch {
      continue
    }
    if (!isObj(raw) || raw.state !== 'running' || raw.pass_id === passId) continue
    const next = { ...raw, state: 'incomplete' }
    const p = parseReport(next)
    if (p.kind !== 'ok' || p.droppedRows > 0) continue
    writeJsonAtomic(dir, n, next)
    closed++
  }
  return closed
}

// ---------------------------------------------------------------------------------------
// The command.

interface Args { ledger: string; dayDir: string; phase: 'start' | 'end' | 'issues'; print: 'card' | 'detail' | 'none'; now: string; kanbanUrl: string }
const USAGE = 'usage: --phase start|end|issues [--ledger PATH] [--day-dir PATH] [--print card|detail|none] [--now ISO] [--kanban-url URL]'

export function parseArgs(argv: string[]): Args | null {
  const a: Partial<Args> = {
    ledger: join(homedir(), '.claude-day-ledger'),
    dayDir: join(homedir(), '.claude-day'),
    print: 'card',
    now: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    kanbanUrl: 'http://localhost:9052',
  }
  for (let i = 0; i < argv.length; i += 2) {
    const v = argv[i + 1]
    if (v === undefined) return null
    switch (argv[i]) {
      case '--ledger': a.ledger = v; break
      case '--day-dir': a.dayDir = v; break
      case '--phase': if (v !== 'start' && v !== 'end' && v !== 'issues') return null; a.phase = v; break
      case '--print': if (v !== 'card' && v !== 'detail' && v !== 'none') return null; a.print = v; break
      case '--now': if (!isoDay(v)) return null; a.now = v; break
      case '--kanban-url': a.kanbanUrl = v; break
      default: return null
    }
  }
  return a.phase ? (a as Args) : null
}

export interface IO { out: (s: string) => void; err: (s: string) => void }

export function run(argv: string[], io: IO): number {
  const say = (msg: string) => io.err(`day-render: ${msg}\n`)
  const args = parseArgs(argv)
  if (!args) {
    say(USAGE)
    return 2
  }
  let ledgerText: string
  try {
    ledgerText = readFileSync(args.ledger, 'utf-8')
  } catch {
    say('no ledger at the given path')
    return 2
  }
  const ledger = parseLedger(ledgerText)
  const registries = readRegistries(ledger.manifests)
  const { findingFiles, dataFiles } = readLedgerFiles(args.ledger, ledger)
  const { reports: earlier, unreadable } = readReports(args.dayDir, ledger.header.pass_id ?? '')
  if (unreadable) say(`some earlier reports could not be read (${unreadable})`)

  if (args.phase === 'issues') {
    // The input of the plain-language pass: the cards as they would be, in the producer's own
    // words (an earlier rewrite is left out). It reads; it writes nothing.
    dataFiles.delete('plain')
    const draft = buildReport({ ledger, registries, findingFiles, dataFiles, earlier, phase: 'end', now: args.now })
    const view = buildView(draft, readDecisions(args.dayDir), [...earlier, draft].map(traceOf))
    const cards = view.issues.map((i) => ({
      fp: i.fp,
      topic: i.topic,
      title: i.title,
      point_a: i.point_a,
      obstacle: i.obstacle,
      point_b: i.point_b,
      options: i.options.map((o, n) => ({ label: o.label, ...(n === i.recommended_index ? { recommended: true } : {}) })),
      ...(i.evidence_text ? { evidence_text: truncate(i.evidence_text, MAX_EVIDENCE_FOR_PLAIN_PASS) } : {}),
    }))
    io.out(`${JSON.stringify(cards, null, 2)}\n`)
    return 0
  }
  const { report, plainUnmatched } = buildReportDetailed({ ledger, registries, findingFiles, dataFiles, earlier, phase: args.phase, now: args.now })
  const problems = validateReport(report)
  if (problems.length) {
    say(`the report would not validate (${problems.slice(0, 5).join(',')})`)
    return 3
  }
  try {
    if (args.phase === 'start') {
      const closed = closeKilledRuns(args.dayDir, report.pass_id)
      if (closed) say(`marked ${plural(closed, 'unfinished earlier run')} incomplete`)
    }
    writeReport(args.dayDir, report)
  } catch (err) {
    say(`could not write the report (${String((err as NodeJS.ErrnoException)?.code ?? 'EUNKNOWN').replace(/[^A-Z]/g, '')})`)
    return 1
  }
  say(`report written (${report.state})`)
  if (plainUnmatched) say(`${plural(plainUnmatched, 'plain-language row')} matched no issue`)

  if (args.print !== 'none') {
    const view = buildView(report, readDecisions(args.dayDir), [...earlier, report].map(traceOf))
    const opts = { kanbanUrl: args.kanbanUrl }
    io.out(`${args.print === 'card' ? renderCard(report, view, opts) : renderDetail(report, view, opts)}\n`)
  }
  return 0
}

function main() {
  process.exitCode = run(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
