// P1578: the loops the /day runner closes. Called by day-render.ts when it assembles a report.
//
//   A. What became of every send. The ledger already records that an agent was sent a fault
//      (decisions.jsonl `sent` receipts, pending then started). Nothing recorded whether it worked,
//      so the next run raised the same fault as if nothing had happened. Now each run resolves every
//      earlier send to one of: fixed, still-open, never-started.
//   B. Who owns an issue. An open spec, or an unshipped branch, that names the issue by an EXACT
//      token: a P-number, the Sentry short id (with the word "sentry"), the fault's cause slug, or
//      the fault key as a branch name. No text similarity, no grouping of distinct Sentry issues.
//   C. Waiting on in-flight work. A card that offers "wait" and has a live owner is collapsed as
//      "waiting on <owner>"; when the owner has had no commit in 7 days (or is gone) it escalates.
//
// Everything is written into the report as annotations (`report.loops`); the board only renders
// them. The ledger stays append-only: outcomes and waits are new lines, never rewrites.
//
// Rules this file owns:
//   - "Fixed" needs a check that RAN this pass (ok or problem) and the fault absent from what it
//     reported. A check that did not run (not-run, unproven, skipped, or unknown) never counts: the
//     send stays unresolved and no line is written.
//   - Local git only, no fetch. Any git failure means owners are unknown: the report still builds.

import { execFileSync } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  OWNER_STALE_DAYS,
  allIssues,
  connectionBroken,
  type DayIssue,
  type DayLoop,
  type DayLoops,
  type DayReport,
  type LaunchReceipt,
  type LoopOutcome,
  type LoopOwner,
  type LoopResolved,
  type OutcomeLine,
} from '../src/lib/day'

const DAY_MS = 86_400_000
/** The checks whose fault, owned by an open spec, is not raised as a card at all (spec D). */
const SUPPRESS_WHEN_OWNED = new Set(['cp.quota'])

// ---------------------------------------------------------------------------------------
// Tokens.

/** Lowercase alphanumeric words: `fix/sentry-3z-fb` → fix, sentry, 3z, fb. */
export const tokensOf = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** Does `phrase` appear as consecutive words in `words`? */
function contiguous(words: string[], phrase: string[]): boolean {
  if (!phrase.length || phrase.length > words.length) return false
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((w, k) => words[i + k] === w)) return true
  }
  return false
}

// ---------------------------------------------------------------------------------------
// A. Sends.

/** A sent item `option:<fp>:<option id>:<text>`; fingerprints hold colons, option ids never do. */
export function parseSentItem(item: string, knownFps: ReadonlySet<string>): { fp: string; option_id: string } | null {
  if (!item.startsWith('option:')) return null
  const rest = item.slice('option:'.length)
  for (const fp of [...knownFps].sort((a, b) => b.length - a.length)) {
    if (!rest.startsWith(`${fp}:`)) continue
    const m = /^([A-Za-z0-9._-]{1,40}):/.exec(rest.slice(fp.length + 1))
    if (m) return { fp, option_id: m[1] }
  }
  // a fingerprint no report knows: only answers with no free text parse safely
  const m = /^(.+):([A-Za-z0-9._-]{1,40}):$/.exec(rest)
  return m ? { fp: m[1], option_id: m[2] } : null
}

interface Send { fp: string; option_id: string; sent_id: string; at: string; run_id: string; state: string }

function checkIdOf(fp: string, known: Map<string, DayIssue>): string {
  if (fp.startsWith('check:')) return fp.slice('check:'.length)
  return known.get(fp)?.check ?? fp.split(':')[0]
}

interface Resolution { resolved: LoopResolved[]; sent: Record<string, NonNullable<DayLoop['sent']>> }

function resolveSends(report: DayReport, earlier: DayReport[], receipts: LaunchReceipt[], outcomes: OutcomeLine[], present: Set<string>): Resolution {
  const started = Date.parse(report.started_at)
  const known = new Map<string, DayIssue>()
  for (const r of [...earlier, report]) for (const i of allIssues(r)) known.set(i.fp, i)
  const knownFps = new Set(known.keys())

  // every send before this pass, per fingerprint, oldest first. Failed launches never counted as sent.
  const sends = new Map<string, Send[]>()
  for (const l of [...receipts].sort((a, b) => a.at.localeCompare(b.at))) {
    if ((l.state !== 'pending' && l.state !== 'started') || l.run_id === report.pass_id || !(Date.parse(l.at) < started)) continue
    for (const item of l.items) {
      const p = parseSentItem(item, knownFps)
      if (!p) continue
      const list = sends.get(p.fp) ?? []
      list.push({ ...p, sent_id: l.id, at: l.at, run_id: l.run_id, state: l.state })
      sends.set(p.fp, list)
    }
  }

  // What EARLIER passes already recorded as fixed: a fault that comes back after one is a new
  // fault, not the same attempt. This pass's own lines are ignored here, so a second render of the
  // same pass reads exactly like the first.
  const fixedBefore = new Map<string, Set<string>>() // fp → sent ids
  for (const o of outcomes) {
    if (o.outcome !== 'fixed' || !o.sent_id || o.run_id === report.pass_id) continue
    fixedBefore.set(o.fp, (fixedBefore.get(o.fp) ?? new Set()).add(o.sent_id))
  }

  // A check whose connection is down still reads "problem", but its card moved to the connection
  // row, so the fault is absent from the page without being fixed: treat it as not run.
  const down = new Set(report.connections.filter((c) => connectionBroken(c.state)).map((c) => c.id))
  const status = new Map(report.checks.map((c) => [c.id, c.connection && down.has(c.connection) ? 'not-run' : c.status]))
  // Absence proves a fix only when the check ran and enumerated its faults: an ok result, or a
  // problem result that still filed at least one detailed finding. A bare "problem" with no
  // finding may simply have failed to list what is wrong.
  const detailed = new Set(report.issues.map((i) => i.check ?? i.fp.split(':')[0]))
  const provesAbsence = (id: string) => {
    const st = status.get(id)
    return st === 'ok' || (st === 'problem' && detailed.has(id))
  }
  const resolved: LoopResolved[] = []
  const sent: Resolution['sent'] = {}
  for (const [fp, all] of sends) {
    const done = fixedBefore.get(fp)
    let from = 0
    if (done) all.forEach((s, k) => { if (done.has(s.sent_id)) from = k + 1 })
    const window = all.slice(from)
    if (!window.length) continue
    const last = window[window.length - 1]
    const isPresent = present.has(fp)
    let outcome: LoopOutcome | null = null
    if (!isPresent && provesAbsence(checkIdOf(fp, known))) outcome = 'fixed'
    else if (isPresent) outcome = last.state === 'pending' ? 'never-started' : 'still-open'
    if (!outcome) continue // the check did not run: not fixed, not open, not recorded
    resolved.push({ fp, outcome, sent_id: last.sent_id, sent_at: last.at, run_id: last.run_id })
    if (outcome === 'fixed') continue
    // "agent sent, not fixed" is about an agent's work: a wait is not a send
    const work = window.filter((s) => s.option_id !== 'wait')
    const tail = work[work.length - 1]
    if (tail) sent[fp] = { outcome, at: tail.at, run_id: tail.run_id, sent_id: tail.sent_id, attempts: work.length }
  }
  return { resolved, sent }
}

// ---------------------------------------------------------------------------------------
// B. Owners.

export interface GitBranch {
  name: string
  /** ISO time of the newest commit */
  tip_at: string
  /** ISO time of its first commit that main does not have */
  first_at?: string
  /** it has commits main does not have: a fix exists and has not shipped */
  unshipped: boolean
  /** subjects of the commits main does not have */
  subjects: string[]
}

export interface GitSpec {
  /** lowercase, `p1530` */
  pnum: string
  /** in features/, not done or archived */
  open: boolean
  created?: string
  last_commit_at?: string
  title?: string
  text: string
}

export interface GitFacts {
  /** false when local git could not be read: every owner is then unknown */
  ok: boolean
  branches: GitBranch[]
  specs: GitSpec[]
}

const ownerText = (i: DayIssue) => [i.fp, i.cause, i.title, i.technical?.title].filter(Boolean).join(' ')

/** The word the fault key ends in: `cp.sentry:sentry:javascript-react-3z` → 3z; null when it is not a Sentry fault. */
function sentryShortId(i: DayIssue): string | null {
  const key = i.fp.split(':').pop() ?? ''
  const isSentry = i.check === 'cp.sentry' || i.fp.startsWith('cp.sentry:') || tokensOf(i.fp).includes('sentry')
  const t = tokensOf(key)
  return isSentry && t.length >= 2 ? t[t.length - 1] : null
}

/**
 * The fingerprints a spec CLAIMS, on a line of its own: `day-owns: <fp> <fp>`. A spec that only
 * mentions a fingerprint (as an example, or in the story of how it was found) owns nothing: the real
 * 2026-10-27 run showed this very spec "owning" two faults it quotes.
 */
function claims(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/^[ \t>*-]*day-owns:[ \t]*(.+)$/gm)) for (const t of m[1].split(/[\s,`]+/)) if (t) out.add(t)
  return out
}

interface Cand { branch?: GitBranch; spec?: GitSpec }

/**
 * Who owns this issue, from exact tokens only (spec B). Null when nobody does, or git is unreadable.
 * The newest-moving candidate wins. An open spec outranks a bare branch as the NAME of the owner, and
 * lends its created date; the branch lends the last commit.
 */
export function ownerFor(issue: DayIssue, facts: GitFacts, now: Date): LoopOwner | null {
  if (!facts.ok) return null
  // P-numbers count from the card's identity and headline only: the explanation fields mention
  // past work ("regressed after P1442") that does not own the fault.
  const pTokens = new Set([...ownerText(issue).matchAll(/\bP(\d{3,5})\b/g)].map((m) => `p${m[1]}`))
  const short = sentryShortId(issue)
  const causePhrase = issue.cause ? tokensOf(issue.cause.split(':').pop() ?? '') : []
  const keyPhrase = tokensOf(issue.fp.split(':').pop() ?? '')

  const branches: GitBranch[] = []
  for (const b of facts.branches) {
    if (!b.unshipped) continue // a branch already merged to main owns nothing
    const name = tokensOf(b.name)
    const subjects = b.subjects.map(tokensOf)
    const hit =
      [...pTokens].some((p) => name.includes(p) || subjects.some((s) => s.includes(p))) ||
      (short !== null && ((name.includes('sentry') && name.includes(short)) || subjects.some((s) => s.includes('sentry') && s.includes(short)))) ||
      (causePhrase.length >= 2 && (contiguous(name, causePhrase) || subjects.some((s) => contiguous(s, causePhrase)))) ||
      (keyPhrase.length >= 2 && contiguous(name, keyPhrase))
    if (hit) branches.push(b)
  }
  const specs = facts.specs.filter((s) => s.open && (pTokens.has(s.pnum) || claims(s.text).has(issue.fp)))
  if (!branches.length && !specs.length) return null

  const newest = <T,>(xs: T[], at: (x: T) => string | undefined) => xs.slice().sort((a, b) => (at(b) ?? '').localeCompare(at(a) ?? ''))[0]
  const cand: Cand = { branch: newest(branches, (b) => b.tip_at), spec: newest(specs, (s) => s.last_commit_at ?? s.created) }
  const last = [cand.branch?.tip_at, cand.spec?.last_commit_at ?? cand.spec?.created].filter(Boolean).sort().pop()
  const idle = last && Number.isFinite(Date.parse(last)) ? Math.max(0, Math.floor((now.getTime() - Date.parse(last)) / DAY_MS)) : undefined
  const owner: LoopOwner = cand.spec
    ? {
        kind: 'spec',
        ref: cand.spec.pnum.toUpperCase(),
        label: cand.spec.title ? `${cand.spec.pnum.toUpperCase()} ${cand.spec.title}`.slice(0, 160) : cand.spec.pnum.toUpperCase(),
        state: 'live',
      }
    : { kind: 'branch', ref: (cand.branch as GitBranch).name, label: (cand.branch as GitBranch).name, state: 'live' }
  const since = cand.spec?.created ?? cand.branch?.first_at ?? cand.branch?.tip_at
  if (since) owner.since = since.slice(0, 10)
  if (last) owner.last_commit_at = last
  if (idle !== undefined) {
    owner.idle_days = idle
    if (now.getTime() - Date.parse(last as string) > OWNER_STALE_DAYS * DAY_MS) owner.state = 'stale'
  }
  if (cand.branch?.unshipped) owner.unshipped = true
  return owner
}

// ---------------------------------------------------------------------------------------
// The report.

export interface LoopInputs {
  receipts: LaunchReceipt[]
  /** the outcome lines already in decisions.jsonl */
  outcomes: OutcomeLine[]
  earlier: DayReport[]
  git: GitFacts
  now: Date
}

/**
 * Annotate `report` in place with `report.loops`, and return the ledger lines this pass adds: an
 * outcome per resolved send not yet recorded, and a `waiting` per waiting card for this pass.
 */
export function applyLoops(report: DayReport, inp: LoopInputs): { lines: OutcomeLine[] } {
  delete report.loops
  const views = allIssues(report)
  const present = new Set(views.map((i) => i.fp))
  const { resolved, sent } = resolveSends(report, inp.earlier, inp.receipts, inp.outcomes, present)

  // the newest earlier report that carried a fault remembers who owned it then
  const before = [...inp.earlier].sort((a, b) => b.started_at.localeCompare(a.started_at))
  const prevOwner = (fp: string): LoopOwner | undefined => before.map((r) => r.loops?.cards[fp]?.owner).find(Boolean)

  const cards: Record<string, DayLoop> = {}
  const waits: { fp: string; owner: string }[] = []
  for (const v of views) {
    const card: DayLoop = {}
    if (sent[v.fp]) card.sent = sent[v.fp]
    const hasWait = v.options.some((o) => o.id === 'wait')
    let owner = ownerFor(v, inp.git, inp.now)
    if (!owner && inp.git.ok) {
      const prev = prevOwner(v.fp)
      // it was owned on an earlier run and is not found now: only a wait card needs to hear about it
      if (prev && hasWait) owner = { ...prev, state: 'gone' }
    }
    if (owner) {
      card.owner = owner
      if (hasWait && owner.state === 'live') {
        card.waiting = true
        waits.push({ fp: v.fp, owner: owner.ref })
      } else if (hasWait) {
        card.escalated = { why: owner.state === 'gone' ? 'gone' : 'idle', ...(owner.idle_days !== undefined ? { days: owner.idle_days } : {}) }
      }
      if (owner.kind === 'spec' && owner.state === 'live' && SUPPRESS_WHEN_OWNED.has(v.check ?? '')) card.suppressed = true
    }
    if (Object.keys(card).length) cards[v.fp] = card
  }
  const loops: DayLoops = { git: inp.git.ok ? 'ok' : 'failed', resolved, cards }
  report.loops = loops

  const have = new Set(inp.outcomes.map((o) => `${o.outcome}|${o.outcome === 'waiting' ? o.run_id : o.sent_id}|${o.fp}`))
  const lines: OutcomeLine[] = []
  for (const r of resolved) {
    if (have.has(`${r.outcome}|${r.sent_id}|${r.fp}`)) continue
    lines.push({ kind: 'outcome', outcome: r.outcome, fp: r.fp, sent_id: r.sent_id, for_run: r.run_id, run_id: report.pass_id })
  }
  for (const w of waits) {
    if (have.has(`waiting|${report.pass_id}|${w.fp}`)) continue
    lines.push({ kind: 'outcome', outcome: 'waiting', fp: w.fp, owner: w.owner, run_id: report.pass_id })
  }
  return { lines }
}

// ---------------------------------------------------------------------------------------
// Local git. Read-only, no fetch, every call bounded; any failure means "owner unknown".

export type GitRun = (args: string[]) => string

const realGit = (root: string): GitRun => (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8', timeout: 15_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })

const CLOSED_STATUS = new Set(['done', 'all-done', 'rejected', 'archived'])

export function readGitFacts(root: string, git: GitRun = realGit(root)): GitFacts {
  const bad: GitFacts = { ok: false, branches: [], specs: [] }
  try {
    const refs = git(['for-each-ref', '--format=%(refname:short)%09%(committerdate:iso-strict)', 'refs/heads'])
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t') as [string, string])
    if (!refs.some(([n]) => n === 'main')) return bad
    const branches: GitBranch[] = []
    for (const [name, tip_at] of refs) {
      // a backup is a copy of work, not someone doing it
      if (name === 'main' || name.startsWith('backup/')) continue
      const rows = git(['log', `main..${name}`, '--format=%cI%x09%s', '-n', '300']).split('\n').filter(Boolean)
      branches.push({
        name,
        tip_at,
        ...(rows.length ? { first_at: rows[rows.length - 1].split('\t')[0] } : {}),
        unshipped: rows.length > 0,
        subjects: rows.map((r) => r.split('\t').slice(1).join('\t')),
      })
    }
    // newest commit date per file under features/, in one call
    const lastAt = new Map<string, string>()
    let at = ''
    for (const l of git(['log', '--format=@@%cI', '--name-only', '-n', '3000', '--', 'features/']).split('\n')) {
      if (l.startsWith('@@')) at = l.slice(2)
      else if (l && at && !lastAt.has(l)) lastAt.set(l, at)
    }
    const dir = join(root, 'features')
    const specs: GitSpec[] = []
    for (const f of existsSync(dir) ? readdirSync(dir) : []) {
      const m = /^p(\d+)_.*\.md$/.exec(f)
      if (!m) continue
      const text = readFileSync(join(dir, f), 'utf-8')
      const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
      const field = (k: string) => new RegExp(`^${k}:\\s*['"]?([^'"\\n#]+?)['"]?\\s*(?:#.*)?$`, 'm').exec(fm)?.[1]
      const title = /^#\s*P\d+:\s*(.+)$/m.exec(text)?.[1]?.trim()
      specs.push({
        pnum: `p${m[1]}`,
        open: !CLOSED_STATUS.has((field('status') ?? '').trim()),
        ...(field('created_date') ? { created: field('created_date')?.trim() } : {}),
        ...(lastAt.get(`features/${f}`) ? { last_commit_at: lastAt.get(`features/${f}`) } : {}),
        ...(title ? { title: title.slice(0, 100) } : {}),
        text,
      })
    }
    return { ok: true, branches, specs }
  } catch {
    return bad
  }
}
