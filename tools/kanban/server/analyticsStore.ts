// P1640: where the weekly product reads and the insight ledger live.
//
//   <dir>/reads/<YYYY-MM-DD>.json   one per weekly read (mode 0600)
//   <dir>/ledger.jsonl              append-only {key, decision, at}
//
// The directory is PRIVATE and outside every repo (a read may name people). Default
// ~/.claude-analytics, overridable with KANBAN_ANALYTICS_DIR (tests). Nothing read from here is logged.

import { appendFileSync, chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { CONFIRM_HIDE_DAYS, type Insight, type LedgerEntry, type StoredRead } from '../scripts/analytics-gate'
import { acquireLock, releaseLock } from './dayStore'

export const analyticsDir = (): string => process.env.KANBAN_ANALYTICS_DIR?.trim() || join(homedir(), '.claude-analytics')

const READ_FILE = /^\d{4}-\d{2}-\d{2}\.json$/

export function ensureDirs(dir: string): void {
  mkdirSync(join(dir, 'reads'), { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  chmodSync(join(dir, 'reads'), 0o700)
}

/** All readable reads, oldest first. A file that does not parse is skipped, never fatal. */
export function listReads(dir: string): StoredRead[] {
  let names: string[]
  try {
    names = readdirSync(join(dir, 'reads')).filter((n) => READ_FILE.test(n)).sort()
  } catch {
    return []
  }
  const out: StoredRead[] = []
  for (const n of names) {
    try {
      const r = JSON.parse(readFileSync(join(dir, 'reads', n), 'utf-8')) as StoredRead
      if (r && typeof r.date === 'string' && (r.status === 'collected' || r.status === 'not-collected') && Array.isArray(r.insights)) out.push(r)
    } catch {
      /* skipped */
    }
  }
  return out
}

export const latestRead = (dir: string): StoredRead | null => {
  const all = listReads(dir)
  return all.length ? all[all.length - 1] : null
}

/** The newest read file's date by name, parseable or not, so a corrupt latest file cannot hide behind an older good one. */
export function latestReadFileDate(dir: string): string | null {
  try {
    const names = readdirSync(join(dir, 'reads')).filter((n) => READ_FILE.test(n)).sort()
    return names.length ? names[names.length - 1].slice(0, 10) : null
  } catch {
    return null
  }
}

export function writeRead(dir: string, read: StoredRead): void {
  ensureDirs(dir)
  writeFileSync(join(dir, 'reads', `${read.date}.json`), JSON.stringify(read, null, 2) + '\n', { mode: 0o600 })
  chmodSync(join(dir, 'reads', `${read.date}.json`), 0o600)
}

function parseLedger(text: string): LedgerEntry[] {
  const out: LedgerEntry[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line) as LedgerEntry
      if (typeof e?.key === 'string' && (e.decision === 'confirm' || e.decision === 'dismiss')) out.push(e)
    } catch {
      /* skipped */
    }
  }
  return out
}

export function readLedger(dir: string): LedgerEntry[] {
  try {
    return parseLedger(readFileSync(join(dir, 'ledger.jsonl'), 'utf-8'))
  } catch {
    return []
  }
}

/**
 * P1673: one read that tells a missing ledger (nothing decided yet: []) from one that exists but cannot
 * be read (throws). readLedger answers [] for both, which would show an insight the founder already
 * dismissed again; the Day page treats the throw as a failed load instead.
 */
export function readLedgerStrict(dir: string): LedgerEntry[] {
  try {
    return parseLedger(readFileSync(join(dir, 'ledger.jsonl'), 'utf-8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw e
  }
}

/** `count`: the insight's count on the read it was confirmed on (insightCount), when that read has one (P1712). */
export function appendLedger(dir: string, key: string, decision: 'confirm' | 'dismiss', at: Date, count?: number): void {
  ensureDirs(dir)
  appendFileSync(join(dir, 'ledger.jsonl'), JSON.stringify({ key, decision, at: at.toISOString(), ...(count !== undefined ? { count } : {}) }) + '\n', { mode: 0o600 })
  chmodSync(join(dir, 'ledger.jsonl'), 0o600)
}

const DAY_MS = 24 * 3_600_000

/**
 * P1712: the number a confirm is compared against, from the read's structured data, never from its
 * display text: a failure's weekly count (`failures[].count`), or a 7-day shift's current value (its
 * section row's `current`). A first, or a read that does not carry the row, has none (undefined): only
 * the 30 days then bring the insight back.
 */
export function insightCount(read: StoredRead, key: string): number | undefined {
  const ok = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined)
  if (key.startsWith('failure:')) return ok(read.failures?.find((f) => `failure:${f.key}` === key)?.count)
  const shift = /^shift:([^:]+):(.*):(up|down)$/.exec(key)
  if (shift) {
    const section = (read.sections as Record<string, { rows?: { label: string; current: number | null }[] }> | undefined)?.[shift[1]]
    return ok(section?.rows?.find((r) => r.label === shift[2])?.current)
  }
  return undefined
}

/**
 * P1712: does this confirm still hide its insight on `read`? For CONFIRM_HIDE_DAYS from the confirm
 * (measured to the read's day, so the answer depends on the read, never on today's clock), unless the
 * read's count is at least double the count recorded at the confirm. A confirm with no recorded count,
 * or a read with none, only expires. Before P1712 a confirm hid only the read it was made on, so a
 * problem confirmed and fixed came back with the next read (dead clicks never reach zero).
 */
export function confirmHides(e: LedgerEntry, read: StoredRead): boolean {
  if (e.decision !== 'confirm') return false
  const at = Date.parse(e.at ?? '')
  const readDay = Date.parse(`${read.date}T00:00:00Z`)
  if (!Number.isFinite(at) || !Number.isFinite(readDay)) return (e.at ?? '') >= read.date // the pre-P1712 rule for an undated entry
  if (readDay - at >= CONFIRM_HIDE_DAYS * DAY_MS) return false
  const then = typeof e.count === 'number' && e.count > 0 ? e.count : undefined
  const now = insightCount(read, e.key)
  return !(then !== undefined && now !== undefined && now >= 2 * then)
}

/**
 * P1673: the weekly insights still waiting for a decision. `error` is a read that could not be
 * loaded, never the same as having nothing to decide. A read that was not collected raises no card:
 * /day's own cp.analytics check reports that. A dismiss hides its key for good; a confirm hides it
 * for 30 days or until its count doubles (P1712, confirmHides).
 * P1707: shared by the Day page server and the fixing agent's verdict CLI (scripts/day-insight.ts),
 * so both refuse the same second decision.
 * P1712: `date` is the read's ISO day, for the card's "weekly read of <date>, N days old".
 */
export function undecidedInsights(dir: string): { insights: Insight[]; error: boolean; date?: string } {
  try {
    const good = latestRead(dir)
    if (!good || good.status !== 'collected' || latestReadFileDate(dir) !== good.date) return { insights: [], error: false }
    const decided = new Set(
      // an unreadable ledger throws here: a failed load, never "nothing" and never a dismissed card again
      readLedgerStrict(dir)
        .filter((e) => e.decision === 'dismiss' || confirmHides(e, good))
        .map((e) => e.key),
    )
    return { insights: good.insights.filter((i) => !decided.has(i.key)), error: false, date: good.date }
  } catch {
    return { insights: [], error: true }
  }
}

/**
 * P1673 review: one ledger decision per insight. Records `decision` for an insight still waiting for
 * one; a retry, a double press, a stale tab or a second agent verdict is refused and writes nothing.
 * P1707 review A: the check and the append run under an exclusive lock file next to the ledger (the
 * day store's lock: bounded wait, stale-lock takeover), so two processes (the page's route and the
 * agent's CLI, or two CLIs) cannot both find an insight undecided and both write a line.
 * A lock held past the wait throws (ELOCKED): the caller reports a failure, never a decision.
 */
export async function recordInsightDecision(dir: string, key: string, decision: 'confirm' | 'dismiss', at: Date): Promise<'recorded' | 'not-undecided' | 'unreadable'> {
  ensureDirs(dir)
  const lock = join(dir, 'ledger.jsonl.lock')
  const owner = await acquireLock(lock)
  try {
    const open = undecidedInsights(dir)
    if (open.error) return 'unreadable'
    if (!open.insights.some((i) => i.key === key)) return 'not-undecided'
    // P1712: a confirm records the count it was made at, so a doubling can bring the insight back
    const read = decision === 'confirm' ? latestRead(dir) : null
    appendLedger(dir, key, decision, at, read ? insightCount(read, key) : undefined)
    return 'recorded'
  } finally {
    releaseLock(lock, owner)
  }
}
