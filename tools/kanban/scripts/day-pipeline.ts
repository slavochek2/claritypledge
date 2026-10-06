// P1399 Phase D (founder decision 3A): the /day outreach funnel is the cp board's own Pipeline
// columns — Contacted → In conversation → Qualified → Committed → Active — counted from the
// opportunity files. No new logging.
//
//   npx tsx scripts/day-pipeline.ts [--dir <opportunities dir>]
//
// Prints exactly one line, counts only, never a name:
//   pipeline: contacted=N in-conversation=N qualified=N committed=N active=N
// A missing folder prints `pipeline: none` (exit 0). `closed` is not a funnel column and is left out.
//
// The stage rule is server/api.ts parseOpportunityFile's, restated here: extracting it would mean
// editing api.ts, which this change does not touch. A file with no or an unknown stage is
// `contacted`; a file whose frontmatter cannot be parsed is left out, as the board leaves it out.

import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { parseFrontmatter } from '../lib/frontmatter'

export const STAGES = ['contacted', 'in-conversation', 'qualified', 'committed', 'active'] as const
type Stage = (typeof STAGES)[number]

/** Same default as server/api.ts DEFAULT_OPPORTUNITIES_DIR. */
export const defaultOpportunitiesDir = () => join(process.env.KANBAN_PROJECT_ROOT ?? join(process.cwd(), '..', '..'), '.private', 'crm', 'opportunities')

export function countPipeline(dir: string): Record<Stage, number> | null {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const counts: Record<Stage, number> = { contacted: 0, 'in-conversation': 0, qualified: 0, committed: 0, active: 0 }
  for (const n of names.sort()) {
    if (!n.endsWith('.md')) continue
    let stage: unknown
    try {
      stage = parseFrontmatter(readFileSync(join(dir, n), 'utf-8')).data.stage
    } catch {
      continue
    }
    if (stage === 'closed') continue
    counts[(STAGES as readonly unknown[]).includes(stage) ? (stage as Stage) : 'contacted']++
  }
  return counts
}

export function pipelineLine(dir: string): string {
  const c = countPipeline(dir)
  return c ? `pipeline: ${STAGES.map((s) => `${s}=${c[s]}`).join(' ')}` : 'pipeline: none'
}

function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--dir')
  const dir = i >= 0 && argv[i + 1] ? argv[i + 1] : defaultOpportunitiesDir()
  process.stdout.write(`${pipelineLine(dir)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
