// P1468: the Day page's Goals — the open `## Next Steps` items of docs/goals.md, in plain words. One
// parser, two callers: day-render.ts snapshots its result into every report (so the board needs no
// /day data section), and day-cp.md Step 3 runs this file to file `goals:unparseable` when it fails.
//
//   npx tsx scripts/day-goals.ts [--goals <goals.md>]
//
// Prints `goals: N open` and one line per goal (`<label>  <text>`), exit 0. When `## Next Steps` is
// missing, or nothing in it is open, prints `goals: unparseable — <why>` and exits 3: the goals.md
// structure has drifted from the parser (P1008), and the board shows "No open goals found".
//
// Rules (derived here, documented once):
//   - an item is a line `<label>. [ ] …` or `- [ ] …` inside `## Next Steps` (up to the next `## `);
//     `[x]` is done. Only open items count, in file order, at most 3.
//   - the text is the item's bold title when the item STARTS with `**…**`; otherwise its first
//     sentence. A bold word in the middle of an item is emphasis, not a title.
//   - markdown links keep their text, code marks and bold marks are dropped; the step label is the
//     row's id and never part of the text.
//   - a label that appears twice keeps its first item, so the report never carries a duplicate row
//     (a duplicate would fail the report's validation and nothing would be written).

import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { MAX_GOAL, type DayGoal } from '../src/lib/day'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
/** goals.md is tracked, so this checkout's own copy is the one to read. */
export const defaultGoalsFile = () => join(REPO_ROOT, 'docs', 'goals.md')

export const GOALS_CAP = 3

export type GoalsParse = { kind: 'ok'; goals: DayGoal[] } | { kind: 'no-section' } | { kind: 'none-open' }

const ITEM = /^\s*(?:([0-9][0-9A-Za-z.+_-]{0,18})\.|[-*])\s+\[([ xX])\]\s+(.+)$/

/** Links keep their text; code and bold marks go. */
const plain = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function textOf(body: string): string {
  const bold = /^\*\*(.+?)\*\*/.exec(body.trim())
  const t = bold ? plain(bold[1]) : plain(body).split(/(?<=[.!?])\s/)[0]
  return t.length > MAX_GOAL ? `${t.slice(0, MAX_GOAL - 1)}…` : t
}

export function parseGoals(md: string, cap = GOALS_CAP): GoalsParse {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => /^## Next Steps\s*$/.test(l))
  if (start < 0) return { kind: 'no-section' }
  const goals: DayGoal[] = []
  const seen = new Set<string>()
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i]); i++) {
    const m = ITEM.exec(lines[i])
    if (!m) continue
    const id = m[1] ?? `item-${i - start}`
    if (seen.has(id)) continue
    seen.add(id)
    if (m[2] !== ' ') continue
    const text = textOf(m[3])
    if (text) goals.push({ id, text })
    if (goals.length >= cap) break
  }
  return goals.length ? { kind: 'ok', goals } : { kind: 'none-open' }
}

/** What day-render snapshots: the goals, or `[]` when the file cannot be read or parsed. */
export function readGoals(file: string): DayGoal[] {
  try {
    const g = parseGoals(readFileSync(file, 'utf-8'))
    return g.kind === 'ok' ? g.goals : []
  } catch {
    return []
  }
}

function main() {
  const i = process.argv.indexOf('--goals')
  const file = i > 0 ? process.argv[i + 1] : defaultGoalsFile()
  let g: GoalsParse
  try {
    g = parseGoals(readFileSync(file, 'utf-8'))
  } catch {
    process.stdout.write('goals: unparseable — docs/goals.md could not be read\n')
    process.exitCode = 3
    return
  }
  if (g.kind === 'ok') {
    process.stdout.write(`goals: ${g.goals.length} open\n${g.goals.map((x) => `  ${x.id}  ${x.text}`).join('\n')}\n`)
    return
  }
  process.stdout.write(g.kind === 'no-section' ? 'goals: unparseable — docs/goals.md has no "## Next Steps" heading\n' : 'goals: unparseable — "## Next Steps" has no open [ ] item\n')
  process.exitCode = 3
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
