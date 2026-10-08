import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { execFile } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { execFileSync } from 'child_process'
import { dirname } from 'path'
import { countPipeline, conversationTarget, defaultOpportunitiesDir, detailLine, pipelineLine, summaryLine } from '../../scripts/day-pipeline'

/**
 * P1399 Phase D (founder decision 3A): the outreach funnel is the cp board's own Pipeline
 * columns, counted from the opportunity files. Synthetic files in a temp dir only.
 */

const NAME = 'PRIVATE-NAME-MARKER-PIPELINE'
let dir: string
const file = (n: string, front: string) => writeFileSync(join(dir, n), `---\n${front}\n---\n\n# ${NAME} ${n}\n`)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'day-pipeline-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('day-pipeline: one line per run, counts only', () => {
  it('PIPELINE — counts each Pipeline column; closed is left out; a missing or invalid stage counts as unknown', () => {
    file('a.md', `name: ${NAME}\nstage: contacted`)
    file('b.md', 'stage: in-conversation')
    file('c.md', 'stage: in-conversation')
    file('d.md', 'stage: qualified')
    file('e.md', 'stage: active')
    file('f.md', 'stage: closed')
    file('g.md', 'name: no stage here')
    file('h.md', 'stage: banana')
    writeFileSync(join(dir, 'notes.txt'), 'stage: active') // not an opportunity file
    expect(countPipeline(dir)).toEqual({ contacted: 1, 'in-conversation': 2, qualified: 1, committed: 0, active: 1, unknown: 2 })
    expect(pipelineLine(dir)).toBe('pipeline: contacted=1 in-conversation=2 qualified=1 committed=0 active=1 unknown=2')
  })

  it('PIPELINE — an empty folder is real zeros; a missing folder is "none"', () => {
    expect(pipelineLine(dir)).toBe('pipeline: contacted=0 in-conversation=0 qualified=0 committed=0 active=0 unknown=0')
    expect(pipelineLine(join(dir, 'nope'))).toBe('pipeline: none')
    expect(countPipeline(join(dir, 'nope'))).toBeNull()
  })

  it('PIPELINE — a file that cannot be parsed is counted as unknown, never dropped (the board drops it)', () => {
    writeFileSync(join(dir, 'bad.md'), '---\nstage: [unclosed\n---\n')
    file('ok.md', 'stage: active')
    expect(countPipeline(dir)).toEqual({ contacted: 0, 'in-conversation': 0, qualified: 0, committed: 0, active: 1, unknown: 1 })
  })

  it('PIPELINE — the CLI prints exactly three lines; only the detail line may name, exits 0 (also for a missing folder)', async () => {
    file('a.md', `name: ${NAME}\nstage: committed`)
    file(`${NAME}-late.md`, `name: ${NAME}\nstage: contacted\nnext_date: 2000-01-01`)
    file(`${NAME}-typo.md`, 'stage: banana')
    const kanban = resolve(__dirname, '../..')
    const go = (d: string) =>
      new Promise<{ stdout: string; stderr: string }>((res, rej) =>
        execFile(join(kanban, 'node_modules/.bin/tsx'), ['scripts/day-pipeline.ts', '--dir', d], { cwd: kanban, env: { ...process.env, NODE_NO_WARNINGS: '1' } }, (err, stdout, stderr) =>
          err ? rej(err) : res({ stdout, stderr })),
      )
    const a = await go(dir)
    const lines = a.stdout.split('\n')
    expect(lines[0]).toBe('pipeline: contacted=1 in-conversation=0 qualified=0 committed=1 active=0 unknown=1')
    expect(lines[0]).not.toContain(NAME) // the stored counts line never carries a name
    expect(lines[1]).toMatch(/^PIPELINE {2}1 conversation \(1 committed\) · 1 contacted · 1 booked/)
    expect(lines[1]).not.toContain(NAME) // the board-note line: no name, no filename
    expect(lines[2]).toMatch(/^PIPELINE detail \(terminal only/)
    expect(lines[2]).toContain(`${NAME} (2000-01-01)`) // the founder still sees who is overdue
    expect(lines[2]).toContain(`${NAME}-typo: stage "banana"`)
    expect(lines).toHaveLength(4) // three lines and the trailing newline
    expect(a.stdout).not.toMatch(/[<>|]/) // relayed lines: no redirect characters
    expect((await go(join(dir, 'missing'))).stdout.split('\n')[0]).toBe('pipeline: none')
  }, 30_000)
})

describe('day-pipeline: the PIPELINE summary line (goals.md outreach goal)', () => {
  let goalsDir: string
  beforeEach(() => {
    goalsDir = mkdtempSync(join(tmpdir(), 'day-pipeline-goals-'))
  })
  afterEach(() => rmSync(goalsDir, { recursive: true, force: true }))
  const goals = () => {
    const g = join(goalsDir, 'goals.md')
    writeFileSync(g, '4. [ ] Outreach until one group books a dated session. 7 conversations with 0 bookings ⟹ change the pitch.\n')
    return g
  }

  it('SUMMARY — conversations exclude contacted, closed and unknown (each shown on its own); booked = committed|active, target from goals.md', () => {
    file('a.md', 'name: Ann Example — Org\nstage: contacted')
    file('a2.md', 'stage: contacted')
    file('i.md', 'stage: in-conversation')
    file('b.md', 'stage: qualified')
    file('c.md', 'stage: committed')
    file('d.md', 'stage: active')
    file('e.md', 'stage: closed')
    file('u.md', 'stage: banana')
    expect(summaryLine(dir, goals(), '2026-10-08')).toBe(
      'PIPELINE  4 conversations (1 in-conversation · 1 qualified · 1 committed · 1 active) · 2 contacted · 1 closed · 2 booked — target: 7 conversations → 1 booking; overdue next_date: 0; 1 unknown stage (see detail)',
    )
  })

  it('SUMMARY — unanswered outreach is not a conversation: 5 contacted reads 0 conversations', () => {
    for (const i of [1, 2, 3, 4, 5]) file(`c${i}.md`, 'stage: contacted')
    expect(summaryLine(dir, goals(), '2026-10-08')).toMatch(/^PIPELINE {2}0 conversations · 5 contacted · 0 booked — /)
  })

  it('SUMMARY — overdue lists open, unbooked opportunities whose next_date is before today (person, not org)', () => {
    file('a.md', 'name: Ann Example — Org\nstage: contacted\nnext_date: 2026-10-01')
    file('b.md', 'name: Bob\nstage: qualified\nnext_date: "2026-10-08"') // today is not overdue
    file('c.md', 'name: Cat\nstage: committed\nnext_date: 2026-09-01') // booked: not chased
    file('d.md', 'name: Dan\nstage: closed\nnext_date: 2026-09-01') // closed: not chased
    file('e.md', 'name: Eve\nstage: in-conversation\nnext_date:') // empty: not overdue
    expect(summaryLine(dir, goals(), '2026-10-08')).toMatch(/overdue next_date: 1$/)
    expect(summaryLine(dir, goals(), '2026-10-08')).not.toContain('Ann')
    expect(detailLine(dir, '2026-10-08')).toMatch(/: overdue: Ann Example \(2026-10-01\)$/)
  })

  it('SUMMARY — an unknown stage is counted AND named with its reason, never silently dropped', () => {
    writeFileSync(join(dir, 'broken.md'), '---\nstage: qualified\nnext_step: Agenda: x\n---\n')
    file('typo.md', 'stage: qualifed')
    file('none.md', 'name: N')
    expect(summaryLine(dir, goals(), '2026-10-08')).toMatch(/^PIPELINE {2}0 conversations · 0 contacted · 0 booked — .*; 3 unknown stage \(see detail\)$/)
    const line = detailLine(dir, '2026-10-08')
    expect(line).toContain('broken: frontmatter does not parse')
    expect(line).toContain('typo: stage "qualifed" is not a Pipeline stage')
    expect(line).toContain('none: no stage')
  })

  it('SUMMARY — a goals.md that no longer states the falsifier says so; the real goals.md does state it', () => {
    const g = join(goalsDir, 'g.md')
    writeFileSync(g, '# Goals\nnothing here\n')
    expect(conversationTarget(g)).toBeNull()
    expect(summaryLine(dir, g, '2026-10-08')).toContain('target: unparseable')
  })

  // The real doc must still state it — or the day report would read "unparseable". Skipped only in a
  // throwaway copy of tools/kanban (day-mutation-controls.sh), which carries no docs/.
  const realGoals = resolve(__dirname, '../../../../docs/goals.md')
  it.skipIf(!existsSync(realGoals))('SUMMARY — the real docs/goals.md states the falsifier', () => {
    expect(conversationTarget(realGoals)).toBeGreaterThan(0)
  })

  it('SUMMARY — a multi-line YAML name or stage cannot break the one-line contract', () => {
    file('a.md', 'name: |\n  Ann\n  forged line\nstage: contacted\nnext_date: 2026-10-01')
    file('b.md', 'stage: |\n  x\n  y')
    writeFileSync(join(dir, 'ann\nFORGED.md'), '---\nstage: banana\n---\n') // a filename is input too
    for (const line of [summaryLine(dir, goals(), '2026-10-08'), detailLine(dir, '2026-10-08')]) expect(line).not.toContain('\n')
    expect(detailLine(dir, '2026-10-08')).toContain('Ann forged line (2026-10-01)')
    expect(detailLine(dir, '2026-10-08')).toContain('ann FORGED: stage "banana"')
  })

  it('SUMMARY — empty, comment-only or null frontmatter is unknown, never a crash; an org-only name falls back to the file', () => {
    writeFileSync(join(dir, 'empty.md'), '---\n---\n')
    writeFileSync(join(dir, 'nul.md'), '---\nnull\n---\n')
    writeFileSync(join(dir, 'comment.md'), '---\n# note\n---\n')
    file('org.md', 'name: " — Acme"\nstage: contacted\nnext_date: 2026-10-01')
    expect(summaryLine(dir, goals(), '2026-10-08')).toMatch(/^PIPELINE {2}0 conversations · 1 contacted · 0 booked — .*; 3 unknown stage/)
    expect(detailLine(dir, '2026-10-08')).toContain('overdue: org (2026-10-01)')
  })

  it('SUMMARY — a folder that exists but cannot be read throws, never reads as "none"', () => {
    const notADir = join(goalsDir, 'file-not-folder')
    writeFileSync(notADir, 'x')
    expect(() => summaryLine(notADir, goals(), '2026-10-08')).toThrow()
  })

  it('SUMMARY — a missing folder is "none", not zero conversations', () => {
    expect(summaryLine(join(dir, 'nope'), goals(), '2026-10-08')).toMatch(/^PIPELINE {2}none — /)
  })
})

describe('day-pipeline: the default folder comes from the script, not the working directory', () => {
  // .private is gitignored, so it exists only in the MAIN checkout: from a worktree, the main root.
  // Outside git (a throwaway copy, as day-mutation-controls.sh makes) it falls back to the script's repo root.
  const repoRoot = (() => {
    try {
      return dirname(
        execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
      )
    } catch {
      return resolve(__dirname, '../../../..')
    }
  })()
  const saved = process.env.KANBAN_PROJECT_ROOT
  afterEach(() => {
    if (saved === undefined) delete process.env.KANBAN_PROJECT_ROOT
    else process.env.KANBAN_PROJECT_ROOT = saved
  })

  it('PIPELINE — run from a different cwd, the repo root is still found', () => {
    delete process.env.KANBAN_PROJECT_ROOT
    const before = process.cwd()
    try {
      process.chdir(tmpdir())
      expect(defaultOpportunitiesDir()).toBe(join(repoRoot, '.private', 'crm', 'opportunities'))
      process.chdir(repoRoot)
      expect(defaultOpportunitiesDir()).toBe(join(repoRoot, '.private', 'crm', 'opportunities'))
    } finally {
      process.chdir(before)
    }
  })

  it('PIPELINE — KANBAN_PROJECT_ROOT still wins', () => {
    process.env.KANBAN_PROJECT_ROOT = dir
    expect(defaultOpportunitiesDir()).toBe(join(dir, '.private', 'crm', 'opportunities'))
  })
})

