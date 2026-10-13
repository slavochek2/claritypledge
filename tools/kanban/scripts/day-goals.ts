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
//     `[x]` is done. Only open items count, in file order, at most 3. Lines inside a fenced code
//     block (``` or ~~~) are not markdown: no heading, no item, no section end. \r\n reads as \n.
//   - the text is the item's bold title when the item STARTS with `**…**`; otherwise its first
//     sentence: up to a . ! or ? that is followed by a space and a capital letter, outside
//     parentheses ("e.g. sales", "(incl. A …)" do not end it); with no such end, the whole line.
//     A bold word in the middle of an item is emphasis, not a title.
//   - markdown links keep their text, code marks and bold marks are dropped; the step label is the
//     row's id and never part of the text. The length is not clipped here: the report's reader does
//     that, once (MAX_GOAL in src/lib/day.ts).
//   - an open label that appears twice keeps its first open item, so the report never carries a
//     duplicate row (a duplicate would fail the report's validation and nothing would be written);
//     a done `[x]` item never hides a reopened one with the same label.

import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { MAX_GOALS, type DayGoal } from '../src/lib/day'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
/** goals.md is tracked, so this checkout's own copy is the one to read. */
export const defaultGoalsFile = () => join(REPO_ROOT, 'docs', 'goals.md')

export const GOALS_CAP = MAX_GOALS

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

/** The first sentence: up to a . ! ? followed by a space and a capital, outside parentheses; else all of it. */
function firstSentence(t: string): string {
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && /[.!?]/.test(c) && /^\s\p{Lu}/u.test(t.slice(i + 1, i + 3))) return t.slice(0, i + 1)
  }
  return t
}

function textOf(body: string): string {
  const bold = /^\*\*(.+?)\*\*/.exec(body.trim())
  return bold ? plain(bold[1]) : firstSentence(plain(body))
}

const FENCE = /^\s{0,3}(```|~~~)/

/** The lines that are markdown: a fenced code block's lines (fences included) become ''. */
function markdownLines(md: string): string[] {
  let fence: string | null = null
  return md.split(/\r?\n/).map((l) => {
    const f = FENCE.exec(l)?.[1]
    if (fence) {
      if (f === fence) fence = null
      return ''
    }
    if (f) {
      fence = f
      return ''
    }
    return l
  })
}

export function parseGoals(md: string, cap = GOALS_CAP): GoalsParse {
  const lines = markdownLines(md)
  const start = lines.findIndex((l) => /^## Next Steps\s*$/.test(l))
  if (start < 0) return { kind: 'no-section' }
  const goals: DayGoal[] = []
  const seen = new Set<string>()
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i]); i++) {
    const m = ITEM.exec(lines[i])
    if (!m || m[2] !== ' ') continue
    const id = m[1] ?? `item-${i - start}`
    if (seen.has(id)) continue
    seen.add(id)
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
