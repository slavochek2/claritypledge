// P1399: the Day page's data — /day runs (schema v2) and the founder's decisions on them.
//
// Enabled only when KANBAN_DAY_DIR is set. The pp launcher sets it; cp's does not, so the
// cp board has no Day page and no Day endpoints (spec decision 1).
//
// The directory is PRIVATE and lives outside every repo:
//   <dir>/reports/<run>.json   one per /day run, read-only here
//   <dir>/decisions.jsonl      append-only; the ONLY file this server writes, always through the
//                              locked append in dayStore.ts (P1440: the mark-done CLI writes too)
//
// PRIVACY (P1317 precedent, spec invariants): nothing derived from a report or a decision is
// logged. Logs carry a fixed-vocabulary reason or a count at most. Routes accept a run id,
// never a path.
//
// Rule 2: the latest run is the newest file by its started_at (or, when the file cannot be
// read, by its modification time). A newest file that is unreadable is still the latest: the
// page says so instead of quietly showing yesterday's run, and no decision can be recorded.

import type { Express, Request, Response } from 'express'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { KANBAN_CONFIG } from '../config'
import { ackWaitMs, collectionHash, dayClock, dayLauncher, launchWorkdir, sweepLaunchDirs, waitForAck, writePromptFile } from './dayLaunch'
import { appendDecisionLines, parseLines, readDecisionsText, Refusal } from './dayStore'
import { ledgerOf, markLine, resendLine } from './dayStories'
import {
  buildPrompt,
  buildView,
  collect,
  collectedKeys,
  decisionTargetExists,
  parseDecisions,
  parseLaunches,
  parseReport,
  quotaHistory,
  runWarnings,
  statementsByRun,
  validateDecisionInput,
  validateStoryRequest,
  traceOf,
  type DayDecision,
  type LaunchReceipt,
  type RunStatements,
  type RunTrace,
  type DayReport,
  type DecisionInput,
  type ParsedReport,
  type StoryEntry,
} from '../src/lib/day'

const RUN_ID = /^[A-Za-z0-9._-]{1,80}$/
/** a report's pass_id may carry colons (an ISO time); a file id never does */
const PASS_ID = /^[A-Za-z0-9._:-]{1,80}$/
const MAX_TEXT_BYTES = 256 * 1024
const MAX_BATCH = 200
/** The mark-done CLI the prompt tells the agent to run, by absolute path: the session may start anywhere. */
// The command the hand-off session runs to mark a story: this install's own tsx and script, by
// absolute path. A bare `npx tsx` in a launch dir without tsx would offer to download it (P1440 review).
const STORY_CLI = `${fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url))} ${fileURLToPath(new URL('../scripts/day-story-done.ts', import.meta.url))}`

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

/** Every readable run's report. */
const reportsOf = (runs: LoadedRun[]): DayReport[] => runs.flatMap((r) => (r.parsed.kind === 'ok' ? [r.parsed.report] : []))

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
function latestReadable(dir: string): { id: string; report: DayReport; history: RunTrace[]; statements: Record<string, RunStatements> } | { refused: string } {
  const list = listRuns(dir)
  const latest = list.runs[0]
  if (!latest) return { refused: 'No run to decide on' }
  if (latest.parsed.kind !== 'ok') return { refused: 'The latest run cannot be read' }
  return { id: latest.id, report: latest.parsed.report, history: traces(list.runs), statements: statementsByRun(reportsOf(list.runs)) }
}

/** P1440: every story of every run, with its state (open / sent / stuck / done). An unreadable file has none. */
function ledgerFor(dir: string, statements: Record<string, RunStatements>): StoryEntry[] {
  try {
    return ledgerOf(parseLines(readDecisionsText(dir)), statements)
  } catch {
    return [] // readDecisions has already said the file is unreadable
  }
}

/**
 * The stories a run's page shows: the latest run sees the whole ledger (its own stories and every
 * earlier one); an earlier run sees its own, plus those of runs before it that are still not done.
 */
function storiesFor(report: DayReport, isLatest: boolean, ledger: StoryEntry[]): StoryEntry[] {
  if (isLatest) return ledger
  const started = Date.parse(report.started_at)
  return ledger.filter((e) => e.run_id === report.pass_id || (e.state !== 'done' && e.run_started_at !== null && Date.parse(e.run_started_at) < started))
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
function readSent(dir: string): LaunchReceipt[] {
  try {
    return parseLaunches(readDecisionsText(dir))
  } catch {
    return []
  }
}

/**
 * What was already sent from this run: the items (so only changes go next time), when each was first
 * sent (P1432: the card says "Sent"), and when the last launch was. Failed launches never count.
 */
function sentForRun(dir: string, report: DayReport): { items: Set<string>; itemsAt: Record<string, string>; lastAt?: string; all: LaunchReceipt[] } {
  const all = readSent(dir).filter((l) => l.state === 'pending' || l.state === 'started')
  const mine = all.filter((l) => l.run_id === report.pass_id).sort((a, b) => a.at.localeCompare(b.at))
  const itemsAt: Record<string, string> = {}
  for (const l of mine) for (const k of l.items) itemsAt[k] ??= l.at
  return { items: new Set(Object.keys(itemsAt)), itemsAt, lastAt: mine[mine.length - 1]?.at, all }
}

function appendLine(dir: string, line: object): Promise<unknown> {
  return appendDecisionLines(dir, () => [line], dayClock)
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
      // An earlier run shows what was sent from it too (P1432); the bar's lastSentAt stays latest-only.
      const sent = sentForRun(dir, run.parsed.report)
      // P1440: the stories with their hashes — the page echoes a hash back to mark a story, never computes one.
      const ledger = ledgerFor(dir, statementsByRun(reportsOf(list.runs)))
      res.json({
        id,
        isLatest,
        kind: 'ok',
        report: run.parsed.report,
        view,
        droppedRows: run.parsed.droppedRows,
        decisionsBadLines: badLines,
        collectedCount: isLatest ? collect(view, sent.items, ledger).count : collect(view, new Set<string>()).count,
        stories: storiesFor(run.parsed.report, isLatest, ledger),
        quotaHistory: quotaHistory(run.parsed.report, list.runs.flatMap((r) => (r.parsed.kind === 'ok' ? [r.parsed.report] : []))),
        lastSentAt: isLatest ? sent.lastAt ?? null : null,
        sentItems: sent.itemsAt,
        warnings: runWarnings(run.parsed.report, now().toISOString(), isLatest),
      })
    } catch {
      console.error('[kanban] GET /api/day/runs failed')
      res.status(500).json({ error: 'Failed to read run' })
    }
  })

  // The board's only write. A batch of decisions on the latest run, appended in one write,
  // all-or-nothing. The body names targets, never paths; every target must exist in that run.
  app.post('/api/day/decisions', async (req, res) => {
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
      const lines = inputs.map((d) => {
        // `at` is stamped under the lock (monotonic across both writers)
        const out: Omit<DayDecision, 'at'> = { ...d, run_id: report.pass_id }
        // Rule 6: the fix step comes from the run, never from the request.
        if (d.kind === 'connection' && !d.remove) {
          const step = report.connections.find((c) => c.id === d.target)?.fix_step
          if (step) out.step = step
        }
        return out
      })
      await appendDecisionLines(dir, () => lines, dayClock)
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
      // second session on the same fixes) — except stories, which go out again until they are marked
      // or stuck (P1440: sent is not processed). Open stories of earlier runs count, so a run with
      // nothing else to send still starts.
      const ledger = ledgerFor(dir, latest.statements)
      const c = collect(view, sent.items, ledger)
      if (!c.count) {
        return sent.lastAt
          ? res.status(409).json({ error: 'This was already sent to a terminal', reason: 'already-sent' })
          : res.status(409).json({ error: 'Nothing to send', reason: 'nothing' })
      }
      const prompt = buildPrompt(latest.report, view, sent.items, sent.lastAt, { ledger, cli: STORY_CLI })
      const id = collectionHash(prompt + now.toISOString())
      const base = { kind: 'sent', id, run_id: latest.report.pass_id, target: collectionHash(prompt) }
      await appendLine(dir, { ...base, state: 'pending', items: collectedKeys(c), count: c.count })
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
        await appendLine(dir, { ...base, state: 'failed' })
        console.warn('[kanban] day: terminal launch did not start a session, copy fallback offered')
        return res.status(502).json({ error: 'The terminal could not be opened', fallback: 'copy' })
      }
      // The session is already open: a failed receipt must not report a failure (the pending line
      // reserved above still counts as sent, so nothing can launch twice).
      try {
        await appendLine(dir, { ...base, state: 'started', how: result.how })
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
      const ledger = ledgerFor(dir, latest.statements)
      res.json({
        run_id: latest.report.pass_id,
        prompt: buildPrompt(latest.report, view, sent.items, sent.lastAt, { ledger, cli: STORY_CLI }),
        count: collect(view, sent.items, ledger).count,
        lastSentAt: sent.lastAt ?? null,
      })
    } catch {
      console.error('[kanban] GET /api/day/prompt failed')
      res.status(500).json({ error: 'Failed to build the prompt' })
    }
  })

  // P1440: "Mark done" and "Send again" for a story — of ANY run, unlike /decisions (latest run
  // only): an earlier day's story is still open work. Same guard as /start (the board's own page,
  // JSON only); the body names the story version by its hash, which the server sent. The checks run
  // under the lock against the file as it is then, and are the ones the CLI uses.
  const storyRoute = (action: 'done' | 'resend') => async (req: Request, res: Response) => {
    const dir = dayDir()
    if (!dir) return res.status(404).json({ error: 'Day page is not enabled' })
    if (!fromBoard(req)) return res.status(403).json({ error: 'Only the Day page can mark a story' })
    if (!isJson(req)) return res.status(415).json({ error: 'JSON only' })
    const v = validateStoryRequest(action, req.body)
    if (!v.ok) return res.status(400).json({ error: `Invalid request (${v.problem})` })
    try {
      const statements = statementsByRun(reportsOf(listRuns(dir).runs))
      await appendDecisionLines(
        dir,
        (existing) => {
          const ledger = ledgerOf(existing, statements)
          return [action === 'done' ? markLine(ledger, v.input) : resendLine(ledger, v.input)]
        },
        dayClock,
      )
      res.json({ success: true })
    } catch (err) {
      if (err instanceof Refusal) return res.status(err.status).json({ error: err.message })
      console.error(`[kanban] POST /api/day/stories/${action} failed (${(err as NodeJS.ErrnoException).code ?? 'error'})`)
      res.status(500).json({ error: 'Failed to record the story' })
    }
  }
  app.post('/api/day/stories/done', storyRoute('done'))
  app.post('/api/day/stories/resend', storyRoute('resend'))
}
