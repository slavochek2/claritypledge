// P1399 Phase D (founder decision 3A): the /day outreach funnel is the cp board's own Pipeline
// columns — Contacted → In conversation → Qualified → Committed → Active — counted from the
// opportunity files. No new logging.
//
//   npx tsx scripts/day-pipeline.ts [--dir <opportunities dir>] [--goals <goals.md>] [--today YYYY-MM-DD]
//
// Prints exactly three lines:
//   pipeline: contacted=N in-conversation=N qualified=N committed=N active=N unknown=N
//   PIPELINE  N conversations (a in-conversation · b qualified …) · C contacted · B booked — target: T conversations → 1 booking; overdue next_date: K
//   PIPELINE detail (terminal only, never copy to the board): overdue: <name (date), …>; fix the file: <id: why, …>   (or "nothing to name")
// Lines 1 and 2 are counts only, never a name or a filename (opportunity files are named after
// people): line 1 is stored by the dispatcher, line 2 is the founder's reading of goals.md's outreach
// goal and is copied into the whats-next board note. Line 3 names overdue contacts and broken files
// for the founder in the terminal; it is never stored.
// A missing folder prints `pipeline: none`, `PIPELINE  none — …` and a detail line (exit 0). A folder
// that exists but cannot be read prints `PIPELINE  unreadable — …` and exits 1.
//
// Count rules (derived here, documented once):
//   - conversations = stages in-conversation, qualified, committed, active (a conversation happened).
//     `contacted` is outreach with no conversation yet and is shown separately, never counted as one.
//     `closed` is shown separately too: the file does not say whether it closed before or after a
//     conversation, so it is not counted toward the goal.
//   - booked = stage committed or active (a dated session agreed or running).
//   - a missing, unknown or unparseable stage is `unknown` — reported separately ("N unknown stage"),
//     never counted as a conversation, never folded into a real column. (The board defaults it to
//     Contacted; the day report does not guess, so a typo shows up instead of inflating the funnel.)
//   - overdue = a non-closed, non-booked opportunity whose next_date is before today.
//   - target = the N in goals.md's "N conversations with 0 bookings" falsifier; bookings target is 1
//     (the goal is "until one group … books"). If goals.md no longer says it, target reads "unparseable".
//
// The opportunities folder is gitignored, so it lives only in the MAIN checkout: a worktree resolves
// it there through git's common dir, the way day-cp.md's METRICS_DIR does.

import { execFileSync } from 'child_process'
import { readFileSync, readdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { parseFrontmatter } from '../lib/frontmatter'

export const STAGES = ['contacted', 'in-conversation', 'qualified', 'committed', 'active'] as const
type Stage = (typeof STAGES)[number]
export const BOOKED: readonly Stage[] = ['committed', 'active']
/** The goal is "until one group … books a dated session" — the booking target is that "one". */
export const BOOKING_TARGET = 1

/** This script's own repo root (tools/kanban/scripts → three levels up), like server/dayLaunch.ts: never the working directory. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** The main checkout's root: the parent of git's common dir. Falls back to this script's repo root outside git. */
export function mainCheckoutRoot(from: string = REPO_ROOT): string {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: from,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return common ? dirname(common) : from
  } catch {
    return from
  }
}

/** The board's opportunities folder, in the MAIN checkout; KANBAN_PROJECT_ROOT, as the board's server reads it, still wins. */
export const defaultOpportunitiesDir = () => join(process.env.KANBAN_PROJECT_ROOT ?? mainCheckoutRoot(), '.private', 'crm', 'opportunities')
/** goals.md is tracked, so this checkout's own copy is the one to read. */
export const defaultGoalsFile = () => join(REPO_ROOT, 'docs', 'goals.md')

export interface Opp {
  stage: Stage | 'closed' | 'unknown'
  name: string
  next_date?: string
  /** Why the stage is unknown — so the founder can fix the file, not just see a count. */
  why?: string
}

function dateString(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().split('T')[0]
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim()
  return undefined
}

/** One line, no control characters: a name or stage from YAML (a block scalar) must not break the line contract. */
// eslint-disable-next-line no-control-regex -- stripping control chars is the point
const oneLine = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()

/** null only when the folder does not exist; any other read failure (permissions, not a folder) throws. */
export function readOpportunities(dir: string): Opp[] | null {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  const out: Opp[] = []
  for (const n of names.sort()) {
    if (!n.endsWith('.md')) continue
    // Filenames are interpolated into the detail line: sanitize like any other field.
    const id = oneLine(n.slice(0, -3)) || '(unnamed file)'
    let data: Record<string, unknown>
    try {
      data = parseFrontmatter(readFileSync(join(dir, n), 'utf-8')).data as Record<string, unknown>
    } catch {
      out.push({ stage: 'unknown', name: id, why: `${id}: frontmatter does not parse` })
      continue
    }
    const s = data.stage
    const stage: Opp['stage'] =
      s === 'closed' ? 'closed' : (STAGES as readonly unknown[]).includes(s) ? (s as Stage) : 'unknown'
    // The person, not the organization: "Jane Doe — Acme" → "Jane Doe"; else the filename.
    const name = typeof data.name === 'string' && oneLine(data.name) ? oneLine(oneLine(data.name).split(/\s*[—–]\s*|\s+-\s+/)[0]) || id : id
    const why = stage !== 'unknown' ? undefined : s === undefined || s === null || s === '' ? `${id}: no stage` : `${id}: stage "${oneLine(String(s)).slice(0, 40)}" is not a Pipeline stage`
    out.push({ stage, name, next_date: dateString(data.next_date), ...(why ? { why } : {}) })
  }
  return out
}

export function countPipeline(dir: string): Record<Stage | 'unknown', number> | null {
  const opps = readOpportunities(dir)
  if (!opps) return null
  const counts: Record<Stage | 'unknown', number> = { contacted: 0, 'in-conversation': 0, qualified: 0, committed: 0, active: 0, unknown: 0 }
  for (const o of opps) if (o.stage !== 'closed') counts[o.stage]++
  return counts
}

export function pipelineLine(dir: string): string {
  const c = countPipeline(dir)
  return c ? `pipeline: ${[...STAGES, 'unknown' as const].map((s) => `${s}=${c[s]}`).join(' ')}` : 'pipeline: none'
}

/** The N in goals.md's "N conversations with 0 bookings", or null when the doc no longer says it. */
export function conversationTarget(goalsFile: string): number | null {
  try {
    const m = readFileSync(goalsFile, 'utf-8').match(/(\d+)\s+conversations\s+with\s+0\s+bookings/i)
    return m ? Number(m[1]) : null
  } catch {
    return null
  }
}

/** Stages where a conversation has happened (contacted = outreach only; see the header). */
export const CONVERSATION: readonly Stage[] = ['in-conversation', 'qualified', 'committed', 'active']

/** Board-safe: counts only, never a name or filename. */
export function summaryLine(dir: string, goalsFile: string, today: string): string {
  const t = conversationTarget(goalsFile)
  const target =
    t === null
      ? 'target: unparseable, goals.md no longer states "N conversations with 0 bookings"'
      : `target: ${t} conversations → ${BOOKING_TARGET} booking`
  const opps = readOpportunities(dir)
  if (!opps) return `PIPELINE  none — no opportunities folder — ${target}`
  const count = (s: Opp['stage']) => opps.filter((o) => o.stage === s).length
  const parts = CONVERSATION.map((s) => [s, count(s)] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
  const n = CONVERSATION.reduce((sum, s) => sum + count(s), 0)
  const booked = opps.filter((o) => (BOOKED as readonly string[]).includes(o.stage)).length
  const extra = [
    `${count('contacted')} contacted`,
    ...(count('closed') ? [`${count('closed')} closed`] : []),
    `${booked} booked`,
  ]
  const unknown = count('unknown')
  return (
    `PIPELINE  ${n} conversation${n === 1 ? '' : 's'}${parts.length ? ` (${parts.join(' · ')})` : ''} · ${extra.join(' · ')} — ` +
    `${target}; overdue next_date: ${overdue(opps, today).length}` +
    (unknown ? `; ${unknown} unknown stage (see detail)` : '')
  )
}

function overdue(opps: Opp[], today: string): Opp[] {
  return opps.filter((o) => o.stage !== 'closed' && !(BOOKED as readonly string[]).includes(o.stage) && o.next_date && o.next_date < today)
}

/** Founder-facing, terminal only: names overdue contacts and files whose stage is unknown. */
export function detailLine(dir: string, today: string): string {
  const head = 'PIPELINE detail (terminal only, never copy to the board):'
  const opps = readOpportunities(dir)
  if (!opps) return `${head} nothing to name`
  const late = overdue(opps, today).map((o) => `${o.name} (${o.next_date})`)
  const why = opps.filter((o) => o.why).map((o) => o.why)
  const bits = [...(late.length ? [`overdue: ${late.join(', ')}`] : []), ...(why.length ? [`fix the file: ${why.join(', ')}`] : [])]
  return `${head} ${bits.length ? bits.join('; ') : 'nothing to name'}`
}

/** Today in local time — the founder's calendar day, not UTC. */
export function localToday(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (k: string) => {
    const i = argv.indexOf(k)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined
  }
  const dir = arg('--dir') ?? defaultOpportunitiesDir()
  const goals = arg('--goals') ?? defaultGoalsFile()
  const today = arg('--today') ?? localToday()
  try {
    process.stdout.write(`${pipelineLine(dir)}\n${summaryLine(dir, goals, today)}\n${detailLine(dir, today)}\n`)
  } catch (err) {
    // The folder exists but cannot be read: not "none" — say why and fail, so it is never read as empty.
    const code = (err as NodeJS.ErrnoException).code ?? 'error'
    process.stdout.write(`pipeline: none\nPIPELINE  unreadable — the opportunities folder could not be read (${code})\nPIPELINE detail (terminal only, never copy to the board): nothing to name\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
