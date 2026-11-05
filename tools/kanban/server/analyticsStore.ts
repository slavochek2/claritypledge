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
import type { LedgerEntry, StoredRead } from '../scripts/analytics-gate'

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

export function readLedger(dir: string): LedgerEntry[] {
  let text: string
  try {
    text = readFileSync(join(dir, 'ledger.jsonl'), 'utf-8')
  } catch {
    return []
  }
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

export function appendLedger(dir: string, key: string, decision: 'confirm' | 'dismiss', at: Date): void {
  ensureDirs(dir)
  appendFileSync(join(dir, 'ledger.jsonl'), JSON.stringify({ key, decision, at: at.toISOString() }) + '\n', { mode: 0o600 })
  chmodSync(join(dir, 'ledger.jsonl'), 0o600)
}
