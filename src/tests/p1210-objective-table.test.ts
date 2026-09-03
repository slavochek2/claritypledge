/**
 * P1210 DW-1 — the objective and its ten conditions have real referents.
 *
 * SCOPE, STATED HONESTLY. This checks that every condition names an owner file
 * that exists and a stage-output token that occurs in it. It does NOT check
 * that a run emits any of them — no test can observe a run.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const DOC = path.join(ROOT, 'docs/points-process.md')
const SKILLS = path.join(ROOT, '.claude/commands/slava/disagreement')

const OWNER_FILES: Record<string, string> = {
  select: path.join(SKILLS, 'select.md'),
  prepare: path.join(SKILLS, 'prepare.md'),
  positions: path.join(SKILLS, 'positions.md'),
  'story-draft': path.join(SKILLS, 'story-draft.md'),
  'events/clarity-practice-event.md': path.join(ROOT, 'docs/events/clarity-practice-event.md'),
}

type Row = { id: string; condition: string; owner: string; output: string }

export function parseConditionTable(text: string): Row[] {
  const rows: Row[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim())
    if (cells.length < 6) continue
    const id = cells[1].replace(/`/g, '')
    if (!/^(1a|1b|[2-9])$/.test(id)) continue
    rows.push({ id, condition: cells[2], owner: cells[3].replace(/`/g, ''), output: cells[4].replace(/`/g, '') })
  }
  return rows
}

/** Resolve every owner and every stage-output token. */
export function resolveTable(rows: Row[]): string[] {
  const problems: string[] = []
  for (const row of rows) {
    const file = OWNER_FILES[row.owner]
    if (!file) { problems.push(`row ${row.id}: owner "${row.owner}" is not a pipeline file`); continue }
    if (!existsSync(file)) { problems.push(`row ${row.id}: owner file missing — ${file}`); continue }
    if (row.output === '—' || row.output === '') continue          // rows 8 and 9 by design
    const body = readFileSync(file, 'utf8')
    if (!body.includes(row.output)) {
      problems.push(`row ${row.id}: stage-output token "${row.output}" does not occur in ${path.basename(file)}`)
    }
  }
  return problems
}

describe('P1210 DW-1 — objective + ten-condition table', () => {
  const doc = readFileSync(DOC, 'utf8')

  it('carries the objective paragraph and its provenance paragraph', () => {
    expect(doc).toContain('The pipeline\'s objective: hand the host, per point, two positions framable from published quotes')
    expect(doc).toContain('Provenance of that sentence')
    // The provenance must keep the derived half separate from the bet.
    expect(doc).toMatch(/\*\*is\*\*\s+entailed by the event contract/)
    expect(doc).toMatch(/not an entailment/)
  })

  it('has exactly the ten row ids 1a, 1b, 2..9 — identity, never a count', () => {
    const rows = parseConditionTable(doc)
    expect(rows.map(r => r.id)).toEqual(['1a', '1b', '2', '3', '4', '5', '6', '7', '8', '9'])
  })

  it('MUST-PASS: every owner resolves to a real file and every stage-output token occurs in it', () => {
    expect(resolveTable(parseConditionTable(doc))).toEqual([])
  })

  it('MUST-FAIL: a table whose row 5 owner names a non-existent stage is REJECTED', () => {
    const bad = readFileSync(path.join(ROOT, 'src/tests/fixtures/p1210/objective-table/bad-owner.md'), 'utf8')
    const rows = parseConditionTable(bad)
    expect(rows.map(r => r.id)).toEqual(['1a', '1b', '2', '3', '4', '5', '6', '7', '8', '9'])
    const problems = resolveTable(rows)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain('row 5')
  })

  it('states that conditions 8 and 9 stay unmeasured rather than proxied', () => {
    expect(doc).toContain('do not substitute arguer split for room split')
  })
})
