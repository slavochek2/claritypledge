// P1440 A: the agent marks a story it handled, so it stops coming back in the hand-off prompt.
//
//   npx tsx scripts/day-story-done.ts --run <run_id> --target <rN> --hash <hex> --version <iso> --outcome acted|answered|declined [--note "..."] [--dir <day dir>]
//       writes one story_done line. Refused (exit 1, one line on stderr): an unknown (run, statement),
//       a hash + version that is not the story's current version (it was edited since, even back to
//       the same text), a story already done.
//   npx tsx scripts/day-story-done.ts --list [--show-text] [--dir <day dir>]
//       the stories still open / sent / stuck: run, statement id, hash, state. The story text only
//       with --show-text.
//   npx tsx scripts/day-story-done.ts --batch-close-before <ISO> [--dir <day dir>]
//       the one-time backfill: a batch-closed marker per story version not done whose latest edit is
//       before <ISO>. A rerun writes 0. Prints the count.
//
// The day dir defaults to $KANBAN_DAY_DIR, else ~/.claude-day, and must exist with a reports/
// folder: the CLI never creates one (a mistyped --dir fails instead). Writes go through the same locked
// append as the board (server/dayStore.ts) and the same checks as its route (server/dayStories.ts).
// PRIVACY: prints nothing from a story or a statement beyond the statement id, unless --show-text.

import { statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { validateStoryRequest } from '../src/lib/day'
import { appendDecisionLines, parseLines, readDecisionsText, Refusal } from '../server/dayStore'
import { batchCloseLines, ledgerOf, loadRunStatements, markLine } from '../server/dayStories'

export interface IO { out: (s: string) => void; err: (s: string) => void }

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

const USAGE =
  'usage: --run <run_id> --target <id> --hash <hex> --version <iso> --outcome acted|answered|declined [--note "..."] [--dir DIR] | --list [--show-text] [--dir DIR] | --batch-close-before <ISO> [--dir DIR]'
const VALUED = ['--run', '--target', '--hash', '--version', '--outcome', '--note', '--dir', '--batch-close-before']
const FLAGS = ['--list', '--show-text']

function parseArgs(argv: string[]): Record<string, string | true> | null {
  const a: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (FLAGS.includes(k)) a[k] = true
    else if (VALUED.includes(k) && argv[i + 1] !== undefined) a[k] = argv[++i]
    else return null
  }
  return a
}

export async function run(argv: string[], io: IO, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const a = parseArgs(argv)
  if (!a) {
    io.err(`${USAGE}\n`)
    return 2
  }
  const envDir = env.KANBAN_DAY_DIR?.trim()
  const dir = typeof a['--dir'] === 'string' ? a['--dir'] : envDir || join(homedir(), '.claude-day')
  if (!isDir(dir) || !isDir(join(dir, 'reports'))) {
    io.err(`refused: ${isDir(dir) ? 'the day dir has no reports folder' : 'no such day dir'} (set --dir or KANBAN_DAY_DIR)\n`)
    return 1
  }
  try {
    const runs = loadRunStatements(dir)

    if (a['--list']) {
      const ledger = ledgerOf(parseLines(readDecisionsText(dir)), runs)
      for (const e of ledger.filter((x) => x.state !== 'done')) {
        io.out(`${e.run_id}\t${e.target}\t${e.hash}\t${e.state}${a['--show-text'] ? `\t${e.story}` : ''}\n`)
      }
      return 0
    }

    if (typeof a['--batch-close-before'] === 'string') {
      const cutoff = Date.parse(a['--batch-close-before'])
      if (!/^\d{4}-\d{2}-\d{2}/.test(a['--batch-close-before']) || !Number.isFinite(cutoff)) {
        io.err('refused: --batch-close-before needs an ISO date or time\n')
        return 2
      }
      const written = await appendDecisionLines(dir, (existing) => batchCloseLines(ledgerOf(existing, runs), cutoff), undefined, { create: false })
      io.out(`batch-closed ${written.length}\n`)
      return 0
    }

    const v = validateStoryRequest('done', {
      run_id: a['--run'],
      target: a['--target'],
      story_hash: a['--hash'],
      version: a['--version'],
      outcome: a['--outcome'],
      ...(typeof a['--note'] === 'string' ? { note: a['--note'] } : {}),
    })
    if (!v.ok) {
      io.err(`refused: bad ${v.problem}\n${USAGE}\n`)
      return 2
    }
    await appendDecisionLines(dir, (existing) => [markLine(ledgerOf(existing, runs), v.input)], undefined, { create: false })
    io.out(`marked ${v.input.target} done (${v.input.outcome})\n`)
    return 0
  } catch (err) {
    if (err instanceof Refusal) {
      io.err(`refused: ${err.message}\n`)
      return 1
    }
    io.err(`failed (${(err as NodeJS.ErrnoException)?.code ?? 'error'})\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }).then((code) => process.exit(code))
}
