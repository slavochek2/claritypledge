// P1640: the weekly product read, written to the private analytics folder.
//
//   npx tsx scripts/weekly-analytics.ts --input raw.json [--dir PATH]
//   npx tsx scripts/weekly-analytics.ts --check [--dir PATH]
//
// Default dir ~/.claude-analytics (mode 0700). Reads the earlier reads and ledger.jsonl, runs the
// noise gate, writes reads/<date>.json (mode 0600).
// Exit codes: 0 collected · 3 not collected, or the input was invalid (a not-collected read with
// the reason is written either way) · 2 usage.
// --check prints one line: `ok <detail>` (exit 0) when the latest read is collected and under 8 days
// old, otherwise `problem <detail>` (exit 1). No read at all is a problem.
// Privacy: output carries counts and dates only, never read contents.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { NOT_COLLECTED, gate, validateRawRead, type StoredRead } from './analytics-gate'
import { analyticsDir, latestRead, latestReadFileDate, listReads, readLedger, writeRead } from '../server/analyticsStore'

export const MAX_AGE_DAYS = 8
const DAY_MS = 86_400_000

interface IO {
  out: (s: string) => void
  err: (s: string) => void
}

const arg = (argv: string[], name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function check(dir: string, now: Date): { code: 0 | 1; line: string } {
  const r = latestRead(dir)
  if (!r) return { code: 1, line: 'problem no weekly read yet' }
  const newest = latestReadFileDate(dir)
  if (newest !== r.date) return { code: 1, line: `problem latest read file ${newest} cannot be read` }
  if (r.status !== 'collected') return { code: 1, line: `problem latest read ${r.date} was not collected` }
  const age = Math.floor((now.getTime() - Date.parse(r.date)) / DAY_MS)
  // One day of leeway: the read's date is local, `now` is compared in UTC.
  if (age < -1) return { code: 1, line: `problem latest read ${r.date} is dated in the future` }
  if (age >= MAX_AGE_DAYS) return { code: 1, line: `problem latest read ${r.date} is ${age} days old` }
  return { code: 0, line: `ok latest read ${r.date}, ${Math.max(0, age)} days old` }
}

/** A failed retry must not replace a good read of the same day. */
const keepsGoodRead = (dir: string, date: string) => listReads(dir).some((p) => p.date === date && p.status === 'collected')

export function run(argv: string[], io: IO, now: Date = new Date()): number {
  const dir = resolve(arg(argv, '--dir') ?? analyticsDir())
  if (argv.includes('--check')) {
    const c = check(dir, now)
    io.out(c.line + '\n')
    return c.code
  }
  const input = arg(argv, '--input')
  if (!input) {
    io.err('usage: weekly-analytics --input raw.json [--dir PATH] | --check [--dir PATH]\n')
    return 2
  }
  let raw: unknown
  let problem: string | null = null
  try {
    raw = JSON.parse(readFileSync(input, 'utf-8'))
  } catch {
    problem = 'input could not be read as JSON'
  }
  const v = problem ? null : validateRawRead(raw)
  if (v && !v.ok) problem = v.reason
  if (problem || !v || !v.ok) {
    const rawDate = (raw as { date?: unknown } | undefined)?.date
    const date = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : isoDay(now)
    const bad: StoredRead = { date, status: 'not-collected', reason: problem ?? 'invalid input', headline: NOT_COLLECTED, insights: [] }
    if (!keepsGoodRead(dir, date)) writeRead(dir, bad)
    io.err(`not collected: ${bad.reason}\n`)
    return 3
  }
  const read = v.read
  // Earlier reads only: a re-run of the same day must not count itself as history.
  const priors = listReads(dir).filter((p) => p.date < read.date)
  const { headline, insights } = gate(read, priors, readLedger(dir))
  const stored: StoredRead = { ...read, headline, insights }
  if (read.status === 'collected' || !keepsGoodRead(dir, read.date)) writeRead(dir, stored)
  if (read.status === 'not-collected') {
    io.err(`not collected: ${read.reason ?? 'no reason given'}\n`)
    return 3
  }
  io.out(`collected ${read.date}: ${insights.length} insight(s)\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(run(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }))
}
