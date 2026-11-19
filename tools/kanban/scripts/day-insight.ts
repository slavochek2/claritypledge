// P1707: the fixing agent records its verdict on a weekly insight it was sent from the Day page.
//
//   npx tsx scripts/day-insight.ts --fp insight:<16 hex> --decision confirm|dismiss [--dir <analytics dir>]
//       confirm = a real user problem, dismiss = not one. Writes one line to the P1640 insight ledger.
//       Refused (exit 1, one line on stderr): a fingerprint that is not an undecided insight of the
//       latest weekly read (unknown, or already decided: one decision per insight, P1673), or a ledger
//       that cannot be read. Usage errors exit 2.
//
// The insight is named by its card fingerprint, never by its ledger key: the key is analytics text
// and may hold spaces, so it never goes into a command the prompt asks the agent to run. The analytics
// dir defaults to $KANBAN_ANALYTICS_DIR, else ~/.claude-analytics; the Day page server passes --dir.
// Nothing read from the analytics dir is printed.

import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { INSIGHT_CONFIRM, INSIGHT_DISMISS, INSIGHT_FP_RE, insightIssue } from '../src/lib/day'
import { analyticsDir, recordInsightDecision, undecidedInsights } from '../server/analyticsStore'

export interface IO {
  out: (s: string) => void
  err: (s: string) => void
}

const USAGE = 'usage: --fp insight:<id> --decision confirm|dismiss [--dir DIR]'
const VALUED = ['--fp', '--decision', '--dir']

function parseArgs(argv: string[]): Record<string, string> | null {
  const v: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!VALUED.includes(k) || argv[i + 1] === undefined || v[k] !== undefined) return null
    v[k] = argv[++i]
  }
  return v
}

export async function run(argv: string[], io: IO, now: () => Date = () => new Date()): Promise<number> {
  const a = parseArgs(argv)
  const decision = a?.['--decision']
  if (!a || !a['--fp'] || (decision !== INSIGHT_CONFIRM && decision !== INSIGHT_DISMISS)) {
    io.err(`${USAGE}\n`)
    return 2
  }
  const refuse = (why: string) => {
    io.err(`refused: ${why}\n`)
    return 1
  }
  const fp = a['--fp']
  // P1712 review: the same exact shape day-evaluated.ts uses (16 hex characters after insight:)
  if (!INSIGHT_FP_RE.test(fp)) return refuse('--fp is not an insight fingerprint')
  const dir = resolve(a['--dir'] ?? analyticsDir())
  const open = undecidedInsights(dir)
  if (open.error) return refuse('the insight ledger could not be read')
  const insight = open.insights.find((i) => insightIssue(i).fp === fp)
  if (!insight) return refuse('not an undecided insight of the latest weekly read (unknown, or already decided)')
  try {
    const r = await recordInsightDecision(dir, insight.key, decision, now())
    if (r === 'unreadable') return refuse('the insight ledger could not be read')
    if (r === 'not-undecided') return refuse('already decided')
    io.out(`recorded ${decision} for ${fp}\n`)
    return 0
  } catch (err) {
    io.err(`failed (${(err as NodeJS.ErrnoException)?.code ?? 'error'})\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }).then((code) => process.exit(code))
}
