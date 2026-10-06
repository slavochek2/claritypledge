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
import { KANBAN_CONFIG } from '../config'
import { ackWaitMs, collectionHash, dayClock, dayLauncher, launchWorkdir, sweepLaunchDirs, waitForAck, writePromptFile } from './dayLaunch'
import {
  buildPrompt,
  buildView,
  collect,
  collectedKeys,
  decisionTargetExists,
  parseDecisions,
  parseReport,
  quotaHistory,
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

/** The board's own page, and nothing else, may start a terminal session (rule 9). */
function fromBoard(req: Request): boolean {
  const origin = req.get('origin')
  const port = KANBAN_CONFIG.ports.frontend
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`
}

/**
 * Launch receipts in decisions.jsonl — the memory of what was sent, across restarts. One launch is
 * several lines sharing an id: `pending` (written BEFORE anything is spawned, so a crash between the
 * spawn and the receipt cannot open a second session), then `started` once the launcher acknowledged
 * Claude, or `failed`. A launch counts as sent while its last line is pending or started.
 */
interface SentLaunch { id: string; run_id: string; at: string; state: string; items: string[] }

function readSent(dir: string): SentLaunch[] {
  let text = ''
  try {
    text = readFileSync(join(dir, 'decisions.jsonl'), 'utf-8')
  } catch {
    return []
  }
  const byId = new Map<string, SentLaunch>()
  for (const raw of text.split('\n')) {
    if (!raw.includes('"sent"')) continue
    try {
      const o = JSON.parse(raw) as Partial<SentLaunch> & { kind?: string }
      if (o.kind !== 'sent' || typeof o.id !== 'string' || typeof o.state !== 'string' || typeof o.at !== 'string') continue
      const prev = byId.get(o.id)
      byId.set(o.id, {
        id: o.id,
        run_id: typeof o.run_id === 'string' ? o.run_id : prev?.run_id ?? '',
        at: prev?.at ?? o.at, // when it was first sent, not when it was confirmed
        state: o.state,
        items: Array.isArray(o.items) ? o.items.filter((x): x is string => typeof x === 'string') : prev?.items ?? [],
      })
    } catch {
      // unreadable lines are counted by parseDecisions; nothing to do here
    }
  }
  return [...byId.values()]
}

/** What was already sent from this run: the items (so only changes go next time) and when, last. */
function sentForRun(dir: string, report: DayReport): { items: Set<string>; lastAt?: string; all: SentLaunch[] } {
  const all = readSent(dir).filter((l) => l.state === 'pending' || l.state === 'started')
  const mine = all.filter((l) => l.run_id === report.pass_id)
  return { items: new Set(mine.flatMap((l) => l.items)), lastAt: mine.map((l) => l.at).sort().pop(), all }
}

function appendLine(dir: string, line: object): void {
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, 'decisions.jsonl'), JSON.stringify(line) + '\n', { encoding: 'utf-8', mode: 0o600 })
}

const LAUNCH_EVERY_MS = 60_000
let launching = false

export function registerDayRoutes(app: Express, now: () => Date = () => new Date()) {
  // Prompt files a launched session never read (it deletes its own), older than a day.
  if (dayEnabled()) sweepLaunchDirs()
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
      const sent = isLatest ? sentForRun(dir, run.parsed.report) : { items: new Set<string>(), lastAt: undefined }
      res.json({
        id,
        isLatest,
        kind: 'ok',
        report: run.parsed.report,
        view,
        droppedRows: run.parsed.droppedRows,
        decisionsBadLines: badLines,
        collectedCount: collect(view, sent.items).count,
        quotaHistory: quotaHistory(run.parsed.report, list.runs.flatMap((r) => (r.parsed.kind === 'ok' ? [r.parsed.report] : []))),
        lastSentAt: sent.lastAt ?? null,
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

  // Start fixing (Phase C, rule 9): open one Claude session in the founder's terminal with the
  // prompt built HERE. The body names the run and nothing else; the page's own origin only; JSON
  // only; at most one launch a minute; the same collection is never sent twice. Every refusal
  // happens before anything is spawned.
  app.post('/api/day/start', async (req, res) => {
    const dir = dayDir()
    if (!dir) return res.status(404).json({ error: 'Day page is not enabled' })
    if (!fromBoard(req)) return res.status(403).json({ error: 'Only the Day page can start a session' })
    if (!isJson(req)) return res.status(415).json({ error: 'JSON only' })
    const body = req.body as Record<string, unknown> | undefined
    const keys = body && typeof body === 'object' ? Object.keys(body) : []
    if (keys.length !== 1 || keys[0] !== 'run_id' || typeof body?.run_id !== 'string' || !PASS_ID.test(body.run_id)) {
      return res.status(400).json({ error: 'The request names the run and nothing else' })
    }
    if (launching) return res.status(429).json({ error: 'A session is already opening' })
    launching = true
    try {
      const latest = latestReadable(dir)
      if ('refused' in latest) return res.status(409).json({ error: latest.refused, reason: 'not-latest' })
      if (body.run_id !== latest.report.pass_id && body.run_id !== latest.id) {
        return res.status(409).json({ error: 'Start fixing works on the latest run only', reason: 'not-latest' })
      }
      const view = buildView(latest.report, readDecisions(dir).lines, latest.history)
      const sent = sentForRun(dir, latest.report)
      const now = dayClock()
      if (sent.all.some((l) => now.getTime() - Date.parse(l.at) < LAUNCH_EVERY_MS)) {
        return res.status(429).json({ error: 'Started less than a minute ago' })
      }
      // After a send, only what changed goes out (Phase C review: a re-send of everything opened a
      // second session on the same fixes).
      const c = collect(view, sent.items)
      if (!c.count) {
        return sent.lastAt
          ? res.status(409).json({ error: 'This was already sent to a terminal', reason: 'already-sent' })
          : res.status(409).json({ error: 'Nothing to send', reason: 'nothing' })
      }
      const prompt = buildPrompt(latest.report, view, sent.items, sent.lastAt)
      const id = collectionHash(prompt + now.toISOString())
      const base = { kind: 'sent', id, run_id: latest.report.pass_id, target: collectionHash(prompt) }
      appendLine(dir, { ...base, state: 'pending', at: now.toISOString(), items: collectedKeys(c), count: c.count })
      const { file, ack, cleanup } = writePromptFile(prompt)
      let result: Awaited<ReturnType<ReturnType<typeof dayLauncher>>> = { ok: false }
      try {
        result = await dayLauncher()(file, ack, launchWorkdir())
        if (result.ok && !(await waitForAck(ack, ackWaitMs()))) result = { ok: false }
      } catch {
        result = { ok: false }
      }
      if (!result.ok) {
        cleanup()
        appendLine(dir, { ...base, state: 'failed', at: dayClock().toISOString() })
        console.warn('[kanban] day: terminal launch did not start a session, copy fallback offered')
        return res.status(502).json({ error: 'The terminal could not be opened', fallback: 'copy' })
      }
      // The session is already open: a failed receipt must not report a failure (the pending line
      // reserved above still counts as sent, so nothing can launch twice).
      try {
        appendLine(dir, { ...base, state: 'started', at: dayClock().toISOString(), how: result.how })
      } catch (err) {
        console.warn(`[kanban] day: session started but its receipt was not written (${(err as NodeJS.ErrnoException).code ?? 'error'})`)
      }
      res.json({ launched: true, how: result.how, count: c.count, followUp: !!sent.lastAt })
    } catch (err) {
      console.error(`[kanban] POST /api/day/start failed (${(err as NodeJS.ErrnoException).code ?? 'error'})`)
      res.status(500).json({ error: 'Failed to start a session' })
    } finally {
      launching = false
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
      const sent = sentForRun(dir, latest.report)
      res.json({
        run_id: latest.report.pass_id,
        prompt: buildPrompt(latest.report, view, sent.items, sent.lastAt),
        count: collect(view, sent.items).count,
        lastSentAt: sent.lastAt ?? null,
      })
    } catch {
      console.error('[kanban] GET /api/day/prompt failed')
      res.status(500).json({ error: 'Failed to build the prompt' })
    }
  })
}
