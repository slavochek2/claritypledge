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

import { randomUUID } from 'crypto'
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'fs'
import { join } from 'path'
import { parseDecisions, parseLaunches, type DayDecision, type LaunchReceipt, type StoryMarker } from '../src/lib/day'

export const DECISIONS_FILE = 'decisions.jsonl'
const LOCK_RETRY_MS = 50
const LOCK_WAIT_MS = 5_000
/** A lock older than this was left by a writer that died mid-append; nothing holds one this long. */
const LOCK_STALE_MS = 30_000
/**
 * An `at` further ahead of now than this is a clock error, not a time: it stays in the file (and is
 * counted) but does not set the floor for new lines, or one bad line would date every later one in
 * the future (P1440 review G3). Ten minutes covers ordinary drift between the two writers.
 */
const FUTURE_SLACK_MS = 10 * 60_000

/** The decisions file as the writers and the ledger need it. */
export interface ParsedLines {
  lines: DayDecision[]
  markers: StoryMarker[]
  badLines: number
  launches: LaunchReceipt[]
  /** the latest believable `at` on any line (any kind), as epoch ms; null for an empty file */
  lastAt: number | null
  /** lines whose `at` is more than ten minutes ahead of now (left out of lastAt) */
  future: number
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

export function parseLines(text: string, now: number | Date = Date.now()): ParsedLines {
  const { lines, markers, badLines } = parseDecisions(text)
  const ceiling = +now + FUTURE_SLACK_MS
  let lastAt: number | null = null
  let future = 0
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    try {
      const at = (JSON.parse(raw) as { at?: unknown }).at
      const t = typeof at === 'string' ? Date.parse(at) : NaN
      if (!Number.isFinite(t)) continue
      if (t > ceiling) future++
      else if (lastAt === null || t > lastAt) lastAt = t
    } catch {
      // counted by parseDecisions
    }
  }
  return { lines, markers, badLines, launches: parseLaunches(text), lastAt, future }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const readOwner = (lock: string) => readFileSync(lock, 'utf-8')

/**
 * Take the lock: create it exclusively, holding an owner id only this writer knows. A lock older
 * than 30s is removed — but only the one judged stale: its owner is read again right before the
 * unlink, so a fresh lock another writer took in between is left alone (P1440 review C3).
 *
 * KNOWN RESIDUAL RACE, accepted and NOT handled: the re-read and the unlink are two calls, not one
 * atomic step. If, in the microseconds between them, a second waiter also removes the same stale
 * lock and a third writer takes a fresh one, this unlink deletes that fresh lock and two writers then
 * hold the lock at once. It needs a writer stalled or dead for more than 30s AND two others racing on
 * the same instant; plain files offer no atomic compare-and-delete to close it.
 *
 * `hooks.afterStaleCheck` exists for the test that reproduces the interleaving.
 */
export async function acquireLock(lock: string, hooks: { afterStaleCheck?: () => void } = {}): Promise<string> {
  const owner = randomUUID()
  const until = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      const fd = openSync(lock, 'wx', 0o600)
      try {
        writeSync(fd, owner)
      } finally {
        closeSync(fd)
      }
      return owner
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') throw err
    }
    try {
      const seen = readOwner(lock)
      if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
        hooks.afterStaleCheck?.()
        if (readOwner(lock) === seen) unlinkSync(lock)
        continue
      }
    } catch {
      continue // released between the open and the read: try again at once
    }
    if (Date.now() >= until) throw Object.assign(new Error('decisions file is locked'), { code: 'ELOCKED' })
    await sleep(LOCK_RETRY_MS)
  }
}

/** Let go of the lock — only while it still holds this writer's owner (it may have been taken over as stale). */
export function releaseLock(lock: string, owner: string): void {
  try {
    if (readOwner(lock) === owner) unlinkSync(lock)
  } catch {
    // already gone: nothing to release
  }
}

/**
 * Append lines under the lock. `build` sees the file as it is once the lock is held and returns the
 * lines to write (without `at`), or throws a Refusal; an empty list writes nothing. The lines get one
 * `at` = max(now, the latest recorded at + 1ms): every append is strictly later than everything
 * before it, so the file's times never go backwards. Returns the lines as written.
 * A line may carry `notBefore` (an ISO time; never written): the append is then also stamped at
 * least 1ms after it. A story marker needs this — it counts only when strictly later than the
 * story's edit, and that edit may lie beyond the future slack, outside `lastAt`.
 * `create: false` (the CLI) never makes the day dir: a mistyped --dir must fail, not grow a folder.
 */
export async function appendDecisionLines(
  dir: string,
  build: (existing: ParsedLines) => object[],
  now: () => Date = () => new Date(),
  opts: { create?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  if (opts.create !== false) mkdirSync(dir, { recursive: true })
  const lock = join(dir, `${DECISIONS_FILE}.lock`)
  const owner = await acquireLock(lock)
  try {
    const text = readDecisionsText(dir)
    const stamp = now()
    const existing = parseLines(text, stamp)
    const out = build(existing)
    if (!out.length) return []
    const after = out.map((o) => Date.parse(String((o as { notBefore?: unknown }).notBefore ?? ''))).filter(Number.isFinite)
    const at = new Date(Math.max(stamp.getTime(), (existing.lastAt ?? -Infinity) + 1, ...after.map((t) => t + 1))).toISOString()
    const stamped = out.map((o) => {
      const { notBefore: _hint, ...line } = o as Record<string, unknown>
      return { ...line, at }
    })
    // A writer that died mid-line left a torn tail: start on a fresh line, so the fragment stays one
    // bad line instead of swallowing the first new one (P1440 review C2).
    const lead = text && !text.endsWith('\n') ? '\n' : ''
    appendFileSync(join(dir, DECISIONS_FILE), lead + stamped.map((l) => JSON.stringify(l)).join('\n') + '\n', { encoding: 'utf-8', mode: 0o600 })
    return stamped
  } finally {
    releaseLock(lock, owner)
  }
}
