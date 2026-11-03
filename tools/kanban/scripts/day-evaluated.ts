// P1605: a fix session records what it concluded about a fault's cause, so /day does not raise it
// again without reason.
//
//   npx tsx scripts/day-evaluated.ts --fp <fp> [--fp <fp> ...] --cause "<named cause>" --verdict fixed|false|accepted
//       --expires YYYY-MM-DD [--threshold N] [--note "..."] [--dir <day dir>]
//       writes one `evaluated` line. Several --fp = one cause behind several fault keys.
//       Refused (exit 1, one line on stderr): empty cause, no/past expiry, expiry over 90 days away,
//       a malformed fingerprint, or a `check:` fingerprint (the "check did not report" cards).
//   npx tsx scripts/day-evaluated.ts --list [--dir <day dir>]
//       the records on file: id, verdict, expiry, fingerprints.
//
// The day dir defaults to $KANBAN_DAY_DIR, else ~/.claude-day, and must already exist with a
// reports/ folder (the CLI never creates one). Writes go through appendDecisionLines.

import { randomUUID } from 'crypto'
import { statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { EVALUATED_VERDICTS, FP, MAX_EVALUATED_FPS, parseEvaluated, validDay, type EvaluatedVerdict } from '../src/lib/day'
import { appendDecisionLines, readDecisionsText } from '../server/dayStore'

export interface IO { out: (s: string) => void; err: (s: string) => void }

const MAX_AHEAD_DAYS = 90
const DAY_MS = 86_400_000
const USAGE =
  'usage: --fp <fp> [--fp <fp>] --cause "..." --verdict fixed|false|accepted --expires YYYY-MM-DD [--threshold N] [--note "..."] [--dir DIR] | --list [--dir DIR]'
const VALUED = ['--fp', '--cause', '--verdict', '--expires', '--threshold', '--note', '--dir']

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

function parseArgs(argv: string[]): { v: Record<string, string>; fps: string[]; list: boolean } | null {
  const v: Record<string, string> = {}
  const fps: string[] = []
  let list = false
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--list') list = true
    else if (VALUED.includes(k) && argv[i + 1] !== undefined) {
      const val = argv[++i]
      if (k === '--fp') fps.push(val)
      else v[k] = val
    } else return null
  }
  return { v, fps, list }
}

export async function run(argv: string[], io: IO, env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): Promise<number> {
  const a = parseArgs(argv)
  if (!a) {
    io.err(`${USAGE}\n`)
    return 2
  }
  const refuse = (why: string) => {
    io.err(`refused: ${why}\n`)
    return 1
  }
  const envDir = env.KANBAN_DAY_DIR?.trim()
  const dir = a.v['--dir'] ?? (envDir || join(homedir(), '.claude-day'))
  if (!isDir(dir) || !isDir(join(dir, 'reports'))) return refuse(`${isDir(dir) ? 'the day dir has no reports folder' : 'no such day dir'} (set --dir or KANBAN_DAY_DIR)`)

  if (a.list) {
    for (const r of parseEvaluated(readDecisionsText(dir))) io.out(`${r.id}\t${r.verdict}\t${r.expires}\t${r.fps.join(',')}\n`)
    return 0
  }

  if (!a.fps.length) return refuse('no --fp given')
  for (const fp of a.fps) {
    if (fp.startsWith('check:')) return refuse('a check: fingerprint is the "check did not report" card and cannot be recorded')
    if (!FP.test(fp)) return refuse('a --fp is not a valid fingerprint')
  }
  const cause = (a.v['--cause'] ?? '').replace(/\s+/g, ' ').trim()
  if (!cause) return refuse('--cause is missing or empty: name the cause')
  if (cause.length > 200) return refuse('--cause is longer than 200 characters')
  const verdict = a.v['--verdict']
  if (!EVALUATED_VERDICTS.includes(verdict as EvaluatedVerdict)) return refuse('--verdict must be fixed, false or accepted')
  const expires = a.v['--expires']
  if (!expires) return refuse('--expires is missing: every record needs an expiry')
  if (!validDay(expires)) return refuse('--expires must be YYYY-MM-DD')
  const today = now().toISOString().slice(0, 10)
  if (expires <= today) return refuse('--expires must be in the future')
  if ((Date.parse(expires) - Date.parse(today)) / DAY_MS > MAX_AHEAD_DAYS) return refuse(`--expires is more than ${MAX_AHEAD_DAYS} days ahead`)
  let threshold: number | undefined
  if (a.v['--threshold'] !== undefined) {
    threshold = Number(a.v['--threshold'])
    if (a.v['--threshold'].trim() === '' || !Number.isFinite(threshold)) return refuse('--threshold must be a number')
  }
  const note = a.v['--note']?.replace(/\s+/g, ' ').trim()
  const fps = [...new Set(a.fps)]
  if (fps.length > MAX_EVALUATED_FPS) return refuse(`more than ${MAX_EVALUATED_FPS} --fp in one record`)

  try {
    const id = `ev-${randomUUID().slice(0, 12)}`
    const line = {
      kind: 'evaluated',
      id,
      fps,
      cause,
      verdict,
      expires,
      ...(threshold !== undefined ? { threshold } : {}),
      ...(note ? { note: note.slice(0, 500) } : {}),
    }
    // whatever the reader would drop, the writer refuses: never report success for a line that is ignored
    if (parseEvaluated(JSON.stringify({ ...line, at: now().toISOString() })).length !== 1) return refuse('the record would not be read back (check the lengths and formats)')
    await appendDecisionLines(dir, () => [line], now, { create: false })
    io.out(`recorded ${id} (${verdict}, until ${expires}, ${line.fps.length} ${line.fps.length === 1 ? 'fault' : 'faults'})\n`)
    return 0
  } catch (err) {
    io.err(`failed (${(err as NodeJS.ErrnoException)?.code ?? 'error'})\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }).then((code) => process.exit(code))
}
