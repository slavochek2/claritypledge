// P1399: the Day page's data — /day runs (schema v2) and the founder's decisions on them.
//
// Enabled only when KANBAN_DAY_DIR is set. The pp launcher sets it; cp's does not, so the
// cp board has no Day page and no Day endpoints (spec decision 1).
//
// The directory is PRIVATE and lives outside every repo:
//   <dir>/reports/<run>.json   one per /day run, read-only here
//   <dir>/decisions.jsonl      append-only; the ONLY file this server writes
//
// PRIVACY (P1317 precedent, spec invariants): nothing derived from a report or a decision is
// logged. Logs carry a fixed-vocabulary reason or a count at most. Routes accept a run id,
// never a path.
//
// Rule 2: the latest run is the newest file by its started_at (or, when the file cannot be
// read, by its modification time). A newest file that is unreadable is still the latest: the
// page says so instead of quietly showing yesterday's run, and no decision can be recorded.

import type { Express, Request } from 'express'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  buildPrompt,
  buildView,
  collect,
  decisionTargetExists,
  parseDecisions,
  parseReport,
  runWarnings,
  validateDecisionInput,
  traceOf,
  type DayDecision,
  type RunTrace,
  type DayReport,
  type DecisionInput,
  type ParsedReport,
} from '../src/lib/day'

const RUN_ID = /^[A-Za-z0-9._-]{1,80}$/
/** a report's pass_id may carry colons (an ISO time); a file id never does */
const PASS_ID = /^[A-Za-z0-9._:-]{1,80}$/
const MAX_TEXT_BYTES = 256 * 1024
const MAX_BATCH = 200

// Read at request time (not module load) so tests and embedders can flip it.
export function dayDir(): string | null {
  const d = process.env.KANBAN_DAY_DIR
  return d && d.trim() ? d.trim() : null
}

export function dayEnabled(): boolean {
  return dayDir() !== null
}

interface LoadedRun {
  id: string
  /** started_at from the file, else the file's mtime — what "newest" is measured by */
  sortKey: string
  startedAt: string | null
  parsed: ParsedReport | { kind: 'unreadable' }
  text: string
}

function loadRun(dir: string, id: string): LoadedRun | null {
  const path = join(dir, 'reports', `${id}.json`)
  // Rule 2: the time comes from stat, separately from the read, so a file that exists but cannot
  // be read (permissions, a directory, I/O) still sorts by its own age and stays the latest.
  let mtime: string
  try {
    mtime = statSync(path).mtime.toISOString()
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    mtime = new Date().toISOString()
  }
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    console.error(`[kanban] day: a run file is unreadable (${(err as NodeJS.ErrnoException)?.code ?? 'unknown'})`)
    return { id, sortKey: mtime, startedAt: null, parsed: { kind: 'unreadable' }, text: '' }
  }
  let parsed: LoadedRun['parsed']
  let startedAt: string | null = null
  try {
    const raw = JSON.parse(text)
    parsed = parseReport(raw)
    if (parsed.kind === 'ok') startedAt = parsed.report.started_at
    else if (parsed.kind === 'other-schema' && typeof raw?.started_at === 'string' && Number.isFinite(Date.parse(raw.started_at))) startedAt = raw.started_at
    if (parsed.kind === 'invalid') {
      console.warn(`[kanban] day: a run failed validation (${parsed.problems.slice(0, 5).join(',')})`)
      parsed = { kind: 'unreadable' }
    }
  } catch {
    console.warn('[kanban] day: a run file is not valid JSON')
    parsed = { kind: 'unreadable' }
  }
  const sortKey = startedAt ? new Date(Date.parse(startedAt)).toISOString() : mtime
  return { id, sortKey, startedAt, parsed, text }
}

type RunList = { state: 'present'; runs: LoadedRun[] } | { state: 'absent' | 'error'; runs: [] }

/** All runs, newest first. Unreadable runs are listed, never silently dropped. */
function listRuns(dir: string): RunList {
  try {
    if (!statSync(dir).isDirectory()) return { state: 'error', runs: [] }
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? { state: 'absent', runs: [] } : { state: 'error', runs: [] }
  }
  let files: string[]
  try {
    files = readdirSync(join(dir, 'reports'))
  } catch (err) {
    // A day dir with no reports/ yet is "no runs recorded", not an error.
    return (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? { state: 'present', runs: [] } : { state: 'error', runs: [] }
  }
  const runs = files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((id) => RUN_ID.test(id))
    .map((id) => loadRun(dir, id))
    .filter((r): r is LoadedRun => r !== null)
  runs.sort((a, b) => b.sortKey.localeCompare(a.sortKey) || b.id.localeCompare(a.id))
  return { state: 'present', runs }
}

/** What every readable run reported — dates synthesised issues, tells "came back" from "never left". */
function traces(runs: LoadedRun[]): RunTrace[] {
  return runs.flatMap((r) => (r.parsed.kind === 'ok' ? [traceOf(r.parsed.report)] : []))
}

function readDecisions(dir: string): { lines: DayDecision[]; badLines: number } {
  try {
    const parsed = parseDecisions(readFileSync(join(dir, 'decisions.jsonl'), 'utf-8'))
    if (parsed.badLines) console.warn(`[kanban] day: decisions file has ${parsed.badLines} unreadable line(s)`)
    return parsed
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') console.error(`[kanban] day: decisions file unreadable (${code ?? 'unknown'})`)
    return { lines: [], badLines: 0 }
  }
}

/** The latest run, only when it is readable. Decisions and the prompt use this. */
function latestReadable(dir: string): { id: string; report: DayReport; history: RunTrace[] } | { refused: string } {
  const list = listRuns(dir)
  const latest = list.runs[0]
  if (!latest) return { refused: 'No run to decide on' }
  if (latest.parsed.kind !== 'ok') return { refused: 'The latest run cannot be read' }
  return { id: latest.id, report: latest.parsed.report, history: traces(list.runs) }
}

const isJson = (req: Request) => !!req.is('application/json')

export function registerDayRoutes(app: Express, now: () => Date = () => new Date()) {
  app.get('/api/day', (_req, res) => {
    const dir = dayDir()
    if (!dir) return res.json({ enabled: false })
    try {
      const list = listRuns(dir)
      res.json({
        enabled: true,
        state: list.state,
        latestId: list.runs[0]?.id ?? null,
        runs: list.runs.map((r) => ({
          id: r.id,
          startedAt: r.startedAt,
          readable: r.parsed.kind === 'ok',
          state: r.parsed.kind === 'ok' ? r.parsed.report.state : r.parsed.kind === 'other-schema' ? 'other-schema' : 'unreadable',
          reviews: r.parsed.kind === 'ok' ? r.parsed.report.reviews ?? [] : [],
        })),
      })
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
      const list = listRuns(dir)
      const run = list.runs.find((r) => r.id === id)
      if (!run) return res.status(404).json({ error: 'Unknown run' })
      const isLatest = list.runs[0]?.id === id
      if (run.parsed.kind === 'other-schema') {
        return res.json({ id, isLatest, kind: 'other-schema', text: run.text.slice(0, MAX_TEXT_BYTES) })
      }
      if (run.parsed.kind !== 'ok') return res.json({ id, isLatest, kind: 'unreadable' })
      const { lines, badLines } = readDecisions(dir)
      const view = buildView(run.parsed.report, lines, traces(list.runs))
      res.json({
        id,
        isLatest,
        kind: 'ok',
        report: run.parsed.report,
        view,
        droppedRows: run.parsed.droppedRows,
        decisionsBadLines: badLines,
        collectedCount: collect(view).count,
        warnings: runWarnings(run.parsed.report, now().toISOString(), isLatest),
      })
    } catch {
      console.error('[kanban] GET /api/day/runs failed')
      res.status(500).json({ error: 'Failed to read run' })
    }
  })

  // The board's only write. A batch of decisions on the latest run, appended in one write,
  // all-or-nothing. The body names targets, never paths; every target must exist in that run.
  app.post('/api/day/decisions', (req, res) => {
    const dir = dayDir()
    if (!dir) return res.status(404).json({ error: 'Day page is not enabled' })
    if (!isJson(req)) return res.status(415).json({ error: 'JSON only' })
    const body = req.body as { run_id?: unknown; decisions?: unknown }
    if (typeof body?.run_id !== 'string' || !PASS_ID.test(body.run_id) || !Array.isArray(body.decisions) || body.decisions.length > MAX_BATCH) {
      return res.status(400).json({ error: 'Invalid batch' })
    }
    const inputs: DecisionInput[] = []
    for (const d of body.decisions) {
      const v = validateDecisionInput(d)
      if (!v.ok) return res.status(400).json({ error: `Invalid decision (${v.problem})` })
      inputs.push(v.decision)
    }
    try {
      const latest = latestReadable(dir)
      if ('refused' in latest) return res.status(409).json({ error: latest.refused })
      const report = latest.report
      // The page may name the run by its file id or by its pass_id.
      if (body.run_id !== report.pass_id && body.run_id !== latest.id) return res.status(409).json({ error: 'Decisions apply to the latest run only' })
      if (!inputs.every((d) => decisionTargetExists(report, d))) return res.status(409).json({ error: 'Not something in the latest run' })
      if (!inputs.length) return res.json({ success: true, written: 0 })
      const at = now().toISOString()
      const lines = inputs.map((d) => {
        const out: DayDecision = { ...d, run_id: report.pass_id, at }
        // Rule 6: the fix step comes from the run, never from the request.
        if (d.kind === 'connection' && !d.remove) {
          const step = report.connections.find((c) => c.id === d.target)?.fix_step
          if (step) out.step = step
        }
        if (d.kind === 'option' && d.option_id === 'ask') out.is_question = true
        return JSON.stringify(out)
      })
      mkdirSync(dir, { recursive: true })
      appendFileSync(join(dir, 'decisions.jsonl'), lines.join('\n') + '\n', { encoding: 'utf-8', mode: 0o600 })
      res.json({ success: true, written: lines.length })
    } catch {
      console.error('[kanban] POST /api/day/decisions failed')
      res.status(500).json({ error: 'Failed to record decisions' })
    }
  })

  // The hand-off prompt, built here from the latest run plus the decisions file — the page
  // never sends prompt text (the same function feeds the terminal launch in Phase C).
  app.get('/api/day/prompt', (_req, res) => {
    const dir = dayDir()
    if (!dir) return res.status(404).json({ error: 'Day page is not enabled' })
    try {
      const latest = latestReadable(dir)
      if ('refused' in latest) return res.status(409).json({ error: latest.refused })
      const view = buildView(latest.report, readDecisions(dir).lines, latest.history)
      res.json({ run_id: latest.report.pass_id, prompt: buildPrompt(latest.report, view), count: collect(view).count })
    } catch {
      console.error('[kanban] GET /api/day/prompt failed')
      res.status(500).json({ error: 'Failed to build the prompt' })
    }
  })
}
