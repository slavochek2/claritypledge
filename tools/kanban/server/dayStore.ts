// P1440: the one way into decisions.jsonl — for the board server and the mark-done CLI alike.
//
// Two writers now exist (the board, and the agent's `day-story-done.ts`), so an append is no longer
// a bare appendFileSync: each one takes an exclusive lock, re-reads the file, lets the caller check
// its request against what is in the file NOW (a story edited a second ago, a marker another writer
// just wrote), stamps every line with a monotonic `at`, appends, and releases.
//
// Why monotonic: story_done markers are valid only when they are strictly later than the story's
// latest edit (P1440 A), and the launch receipts count sends by time. Two appends in the same
// millisecond, or a clock that stepped back, would make that order a coin toss. The lines of ONE
// append share their `at` — a batch stays recognisably one write, as it always was.
//
// PRIVACY: nothing read from the file is logged; errors carry a code at most.

import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'fs'
import { join } from 'path'
import { parseDecisions, parseLaunches, type DayDecision, type LaunchReceipt, type StoryMarker } from '../src/lib/day'

export const DECISIONS_FILE = 'decisions.jsonl'
const LOCK_RETRY_MS = 50
const LOCK_WAIT_MS = 5_000
/** A lock older than this was left by a writer that died mid-append; nothing holds one this long. */
const LOCK_STALE_MS = 30_000

/** The decisions file as the writers and the ledger need it. */
export interface ParsedLines {
  lines: DayDecision[]
  markers: StoryMarker[]
  badLines: number
  launches: LaunchReceipt[]
  /** the latest `at` recorded on any line (any kind), as epoch ms; null for an empty file */
  lastAt: number | null
}

/** A request the file's current state refuses (unknown story, stale version, already done …). */
export class Refusal extends Error {
  constructor(message: string, readonly status = 409) {
    super(message)
  }
}

export function readDecisionsText(dir: string): string {
  try {
    return readFileSync(join(dir, DECISIONS_FILE), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return ''
    throw err
  }
}

export function parseLines(text: string): ParsedLines {
  const { lines, markers, badLines } = parseDecisions(text)
  let lastAt: number | null = null
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    try {
      const at = (JSON.parse(raw) as { at?: unknown }).at
      const t = typeof at === 'string' ? Date.parse(at) : NaN
      if (Number.isFinite(t) && (lastAt === null || t > lastAt)) lastAt = t
    } catch {
      // counted by parseDecisions
    }
  }
  return { lines, markers, badLines, launches: parseLaunches(text), lastAt }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function acquire(lock: string): Promise<void> {
  const until = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      const fd = openSync(lock, 'wx', 0o600)
      try {
        writeSync(fd, String(process.pid))
      } finally {
        closeSync(fd)
      }
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') throw err
    }
    try {
      if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
        unlinkSync(lock)
        continue
      }
    } catch {
      continue // released between the open and the stat: try again at once
    }
    if (Date.now() >= until) throw Object.assign(new Error('decisions file is locked'), { code: 'ELOCKED' })
    await sleep(LOCK_RETRY_MS)
  }
}

function release(lock: string): void {
  try {
    unlinkSync(lock)
  } catch {
    // already gone (removed as stale by another writer): nothing to release
  }
}

/**
 * Append lines under the lock. `build` sees the file as it is once the lock is held and returns the
 * lines to write (without `at`), or throws a Refusal; an empty list writes nothing. The lines get one
 * `at` = max(now, the latest recorded at + 1ms): every append is strictly later than everything
 * before it, so the file's times never go backwards. Returns the lines as written.
 */
export async function appendDecisionLines(
  dir: string,
  build: (existing: ParsedLines) => object[],
  now: () => Date = () => new Date(),
): Promise<Record<string, unknown>[]> {
  mkdirSync(dir, { recursive: true })
  const lock = join(dir, `${DECISIONS_FILE}.lock`)
  await acquire(lock)
  try {
    const existing = parseLines(readDecisionsText(dir))
    const out = build(existing)
    if (!out.length) return []
    const at = new Date(Math.max(now().getTime(), (existing.lastAt ?? -Infinity) + 1)).toISOString()
    const stamped = out.map((o) => ({ ...(o as Record<string, unknown>), at }))
    appendFileSync(join(dir, DECISIONS_FILE), stamped.map((l) => JSON.stringify(l)).join('\n') + '\n', { encoding: 'utf-8', mode: 0o600 })
    return stamped
  } finally {
    release(lock)
  }
}
