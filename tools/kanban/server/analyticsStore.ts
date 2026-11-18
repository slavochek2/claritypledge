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
import type { Insight, LedgerEntry, StoredRead } from '../scripts/analytics-gate'

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

export function appendLedger(dir: string, key: string, decision: 'confirm' | 'dismiss', at: Date): void {
  ensureDirs(dir)
  appendFileSync(join(dir, 'ledger.jsonl'), JSON.stringify({ key, decision, at: at.toISOString() }) + '\n', { mode: 0o600 })
  chmodSync(join(dir, 'ledger.jsonl'), 0o600)
}

/**
 * P1673: the weekly insights still waiting for a decision. `error` is a read that could not be
 * loaded, never the same as having nothing to decide. A read that was not collected raises no card:
 * /day's own cp.analytics check reports that. A dismiss hides its key for good; a confirm hides only
 * the card of the read it was made on.
 * P1707: shared by the Day page server and the fixing agent's verdict CLI (scripts/day-insight.ts),
 * so both refuse the same second decision.
 */
export function undecidedInsights(dir: string): { insights: Insight[]; error: boolean } {
  try {
    const good = latestRead(dir)
    if (!good || good.status !== 'collected' || latestReadFileDate(dir) !== good.date) return { insights: [], error: false }
    const decided = new Set(
      // an unreadable ledger throws here: a failed load, never "nothing" and never a dismissed card again
      readLedgerStrict(dir)
        .filter((e) => e.decision === 'dismiss' || (e.decision === 'confirm' && (e.at ?? '') >= good.date))
        .map((e) => e.key),
    )
    return { insights: good.insights.filter((i) => !decided.has(i.key)), error: false }
  } catch {
    return { insights: [], error: true }
  }
}

/**
 * P1673 review: one ledger decision per insight. Records `decision` for an insight still waiting for
 * one; a retry, a double press, a stale tab or a second agent verdict is refused and writes nothing.
 */
export function recordInsightDecision(dir: string, key: string, decision: 'confirm' | 'dismiss', at: Date): 'recorded' | 'not-undecided' | 'unreadable' {
  const open = undecidedInsights(dir)
  if (open.error) return 'unreadable'
  if (!open.insights.some((i) => i.key === key)) return 'not-undecided'
  appendLedger(dir, key, decision, at)
  return 'recorded'
}
