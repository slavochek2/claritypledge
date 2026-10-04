// P1399: the Day page's data — /day runs and the founder's decisions on them.
//
// Enabled only when KANBAN_DAY_DIR is set. The pp launcher sets it; cp's does not, so the
// cp board has no Day page and no Day endpoints (spec decision 1).
//
// The directory is PRIVATE and lives outside every repo:
//   <dir>/reports/<pass>.json   one per /day run, read-only here
//   <dir>/decisions.jsonl       append-only; the ONLY file this server writes
//
// PRIVACY (P1317 precedent, spec invariants): nothing derived from a report or a decision is
// logged. Logs carry a fixed-vocabulary reason, a count, or a run id at most. The routes
// accept a run id or a fingerprint, never a path.

import type { Express } from 'express'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  buildView,
  allItems,
  parseDecisions,
  runCounts,
  validateDecision,
  validateReport,
  type DayDecision,
  type DayReport,
} from '../src/lib/day'

const RUN_ID = /^[A-Za-z0-9._-]{1,80}$/

// Read at request time (not module load) so tests and embedders can flip it.
export function dayDir(): string | null {
  const d = process.env.KANBAN_DAY_DIR
  return d && d.trim() ? d.trim() : null
}

export function dayEnabled(): boolean {
  return dayDir() !== null
}

type RunLoad = { id: string; report: DayReport } | { id: string; invalid: string[] }

function loadRun(dir: string, id: string): RunLoad | null {
  try {
    const text = readFileSync(join(dir, 'reports', `${id}.json`), 'utf-8')
    const v = validateReport(JSON.parse(text))
    if (!v.ok) {
      console.warn(`[kanban] day: run ${id} failed validation (${v.problems.slice(0, 5).join(',')})`)
      return { id, invalid: v.problems }
    }
    return { id, report: v.report }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return null
    console.error(`[kanban] day: run ${id} unreadable (${code ?? 'parse-error'})`)
    return { id, invalid: ['unreadable'] }
  }
}

function listRunIds(dir: string): { state: 'present'; ids: string[] } | { state: 'absent' | 'error' } {
  const reports = join(dir, 'reports')
  try {
    if (!statSync(dir).isDirectory()) return { state: 'error' }
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? { state: 'absent' } : { state: 'error' }
  }
  try {
    const ids = readdirSync(reports)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .filter((id) => RUN_ID.test(id))
    return { state: 'present', ids }
  } catch (err) {
    // A day dir with no reports/ yet is "no runs recorded", not an error.
    return (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? { state: 'present', ids: [] } : { state: 'error' }
  }
}

function readDecisions(dir: string): { latest: Map<string, DayDecision>; badLines: number; state: 'present' | 'absent' | 'error' } {
  try {
    const parsed = parseDecisions(readFileSync(join(dir, 'decisions.jsonl'), 'utf-8'))
    if (parsed.badLines) console.warn(`[kanban] day: decisions file has ${parsed.badLines} unreadable line(s)`)
    return { ...parsed, state: 'present' }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') console.error(`[kanban] day: decisions file unreadable (${code ?? 'unknown'})`)
    return { latest: new Map(), badLines: 0, state: code === 'ENOENT' ? 'absent' : 'error' }
  }
}

export interface DayRunSummary {
  id: string
  startedAt: string | null
  state: string
  valid: boolean
  answer: number
  agent: number
  checksClean: number
  checksTotal: number
}

/** All runs, newest first. Invalid runs are listed (never silently dropped), flagged invalid. */
export function readRunList(dir: string): { state: 'present' | 'absent' | 'error'; runs: DayRunSummary[] } {
  const listed = listRunIds(dir)
  if (listed.state !== 'present') return { state: listed.state, runs: [] }
  const runs: DayRunSummary[] = []
  for (const id of listed.ids) {
    const r = loadRun(dir, id)
    if (!r) continue
    if ('invalid' in r) {
      runs.push({ id, startedAt: null, state: 'invalid', valid: false, answer: 0, agent: 0, checksClean: 0, checksTotal: 0 })
    } else {
      runs.push({ id, startedAt: r.report.started_at, state: r.report.state, valid: true, ...runCounts(r.report) })
    }
  }
  runs.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '') || b.id.localeCompare(a.id))
  return { state: 'present', runs }
}

export function registerDayRoutes(app: Express, now: () => Date = () => new Date()) {
  app.get('/api/day', (_req, res) => {
    const dir = dayDir()
    if (!dir) return res.json({ enabled: false })
    try {
      const { state, runs } = readRunList(dir)
      res.json({ enabled: true, state, runs })
    } catch {
      console.error('[kanban] GET /api/day failed')
      res.status(500).json({ error: 'Failed to read day runs' })
    }
  })

  app.get('/api/day/runs/:id', (req, res) => {
    const dir = dayDir()
    if (!dir) return res.status(404).json({ error: 'Day page is not enabled' })
    const id = req.params.id
    if (!RUN_ID.test(id)) return res.status(400).json({ error: 'Bad run id' })
    try {
      const r = loadRun(dir, id)
      if (!r) return res.status(404).json({ error: 'Unknown run' })
      if ('invalid' in r) return res.json({ id, valid: false, problems: r.invalid })
      const { runs } = readRunList(dir)
      const isLatest = runs.find((x) => x.valid)?.id === id
      const decisions = readDecisions(dir)
      // Decisions apply to the latest run only; an earlier run reads as it was.
      const view = buildView(r.report, isLatest ? decisions.latest : new Map(), now().toISOString())
      res.json({
        id,
        valid: true,
        isLatest,
        report: r.report,
        view,
        decisionsState: decisions.state,
        decisionsBadLines: decisions.badLines,
      })
    } catch {
      console.error('[kanban] GET /api/day/runs failed')
      res.status(500).json({ error: 'Failed to read run' })
    }
  })

  // The board's only write. One line, appended. Accepts a fingerprint and an action — never
  // a path — and only for an item that exists in the latest run, so a stale tab cannot
  // record a decision about something that is no longer being reported.
  app.post('/api/day/decision', (req, res) => {
    const dir = dayDir()
    if (!dir) return res.status(404).json({ error: 'Day page is not enabled' })
    const v = validateDecision(req.body)
    if (!v.ok) return res.status(400).json({ error: `Invalid decision (${v.problem})` })
    try {
      const { runs } = readRunList(dir)
      const latest = runs.find((x) => x.valid)
      if (!latest) return res.status(409).json({ error: 'No valid run to decide on' })
      const r = loadRun(dir, latest.id)
      if (!r || 'invalid' in r) return res.status(409).json({ error: 'Latest run unreadable' })
      const fps = new Set(allItems(r.report).map((x) => x.item.fp))
      if (!fps.has(v.decision.fp)) return res.status(409).json({ error: 'Not an item in the latest run' })
      const line: DayDecision = { ...v.decision, at: now().toISOString() }
      mkdirSync(dir, { recursive: true })
      appendFileSync(join(dir, 'decisions.jsonl'), JSON.stringify(line) + '\n', { encoding: 'utf-8', mode: 0o600 })
      res.json({ success: true, decision: line })
    } catch {
      console.error('[kanban] POST /api/day/decision failed')
      res.status(500).json({ error: 'Failed to record decision' })
    }
  })
}
