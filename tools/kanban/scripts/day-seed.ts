// P1399: seed a day-data directory with SYNTHETIC /day runs, for the e2e suite and for QA
// screenshots. Never real data.
//
//   npx tsx scripts/day-seed.ts <dir> [variant]
//
// Variants: default · weekly · monthly · stale · running · incomplete · unknown · malformed · unreadable ·
// other-schema · empty · absent · connected (every connection ok) · no-people (people: []) ·
// people-absent (no people field: not collected) · no-notes (no notes field).
//
// SAFETY: it writes only inside <dir>; it refuses the real day-data folder (~/.claude-day) and
// any non-empty directory it did not create (a `.day-seed` marker proves it did). `absent`
// removes <dir> itself, and only when the marker is there.

import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { synthEarlier, synthMonthly, synthReport, synthWeekly } from '../server/__tests__/fixtures/day-fixture'
import type { DayReport } from '../src/lib/day'

export const VARIANTS = [
  'default',
  'weekly',
  'monthly',
  'stale',
  'running',
  'incomplete',
  'unknown',
  'malformed',
  'unreadable',
  'other-schema',
  'empty',
  'absent',
  'connected',
  'no-people',
  'people-absent',
  'no-notes',
] as const
export type Variant = (typeof VARIANTS)[number]

const MARKER = '.day-seed'
export const EARLIER_ID = '2026-10-03T05-05-00Z'
export const LATEST_ID = '2026-10-04T05-37-45Z'
export const NEWER_ID = '2026-10-05T05-00-00Z'

function real(p: string): string {
  // Resolve symlinks on the longest existing prefix, so a link into the real folder is caught.
  let cur = resolve(p)
  const rest: string[] = []
  while (!existsSync(cur)) {
    rest.unshift(cur.slice(cur.lastIndexOf(sep) + 1))
    const up = resolve(cur, '..')
    if (up === cur) break
    cur = up
  }
  return join(realpathSync(cur), ...rest)
}

export function assertSafeDir(dir: string): string {
  const target = real(dir)
  const forbidden = real(join(homedir(), '.claude-day'))
  if (target === forbidden || target.startsWith(forbidden + sep)) throw new Error('day-seed: refusing the real day-data folder')
  if (target === real(homedir()) || target === sep) throw new Error('day-seed: refusing a top-level folder')
  if (existsSync(target) && readdirSync(target).length && !existsSync(join(target, MARKER))) {
    throw new Error('day-seed: refusing a non-empty folder this script did not create')
  }
  return target
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

export function seedDay(dir: string, variant: Variant = 'default'): string {
  if (!VARIANTS.includes(variant)) throw new Error(`day-seed: unknown variant ${variant}`)
  const target = assertSafeDir(dir)

  if (variant === 'absent') {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    return target
  }

  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, MARKER), 'synthetic day data for tests\n')
  const reports = join(target, 'reports')
  rmSync(reports, { recursive: true, force: true })
  rmSync(join(target, 'decisions.jsonl'), { force: true })
  mkdirSync(reports, { recursive: true })
  if (variant === 'empty') return target

  const put = (id: string, body: unknown) => writeFileSync(join(reports, `${id}.json`), typeof body === 'string' ? body : JSON.stringify(body, null, 2))
  put(EARLIER_ID, synthEarlier())

  let latest: DayReport | Record<string, unknown> = synthReport()
  switch (variant) {
    case 'weekly':
      latest = synthWeekly()
      break
    case 'monthly':
      latest = synthMonthly()
      break
    case 'stale':
      latest = synthReport({ started_at: daysAgo(3), finished_at: daysAgo(3) })
      break
    case 'running':
      latest = synthReport({ state: 'running', finished_at: undefined })
      break
    case 'incomplete':
      latest = synthReport({ state: 'incomplete' })
      break
    case 'unknown': {
      const r = synthReport()
      r.checks.push({ id: 'mystery', label: 'Mystery check', status: 'exploded' as never, detail: 'odd answer', group: 'Code' })
      latest = r
      break
    }
    case 'malformed': {
      const r = synthReport() as unknown as { checks: unknown[] }
      r.checks.push({ id: 42, nonsense: true })
      latest = r as unknown as DayReport
      break
    }
    case 'connected':
      latest = synthReport({ connections: synthReport().connections.map((c) => ({ ...c, state: 'ok' as const })) })
      break
    case 'no-people':
      latest = synthReport({ people: [] })
      break
    case 'people-absent': {
      const r = synthReport()
      delete r.people
      latest = r
      break
    }
    case 'no-notes': {
      const r = synthReport()
      delete r.notes
      latest = r
      break
    }
    case 'unreadable':
      put(LATEST_ID, synthReport())
      put(NEWER_ID, '{"schema": 2, "pass_id": "broken"')
      return target
    case 'other-schema':
      put(LATEST_ID, synthReport())
      put(NEWER_ID, { schema: 3, pass_id: NEWER_ID, started_at: '2026-10-05T05:00:00Z', summary: 'A newer format the board does not know.' })
      return target
  }
  put(LATEST_ID, latest)
  return target
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dir, variant = 'default'] = process.argv.slice(2)
  if (!dir) {
    console.error('usage: tsx scripts/day-seed.ts <dir> [variant]')
    process.exit(2)
  }
  try {
    console.log(`seeded ${seedDay(dir, variant as Variant)} (${variant})`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
