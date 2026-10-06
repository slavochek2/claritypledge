import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { execFile } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { countPipeline, pipelineLine } from '../../scripts/day-pipeline'

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
  it('PIPELINE — counts each Pipeline column; closed is left out; a missing or invalid stage counts as contacted', () => {
    file('a.md', `name: ${NAME}\nstage: contacted`)
    file('b.md', 'stage: in-conversation')
    file('c.md', 'stage: in-conversation')
    file('d.md', 'stage: qualified')
    file('e.md', 'stage: active')
    file('f.md', 'stage: closed')
    file('g.md', 'name: no stage here')
    file('h.md', 'stage: banana')
    writeFileSync(join(dir, 'notes.txt'), 'stage: active') // not an opportunity file
    expect(countPipeline(dir)).toEqual({ contacted: 3, 'in-conversation': 2, qualified: 1, committed: 0, active: 1 })
    expect(pipelineLine(dir)).toBe('pipeline: contacted=3 in-conversation=2 qualified=1 committed=0 active=1')
  })

  it('PIPELINE — an empty folder is real zeros; a missing folder is "none"', () => {
    expect(pipelineLine(dir)).toBe('pipeline: contacted=0 in-conversation=0 qualified=0 committed=0 active=0')
    expect(pipelineLine(join(dir, 'nope'))).toBe('pipeline: none')
    expect(countPipeline(join(dir, 'nope'))).toBeNull()
  })

  it('PIPELINE — a file that cannot be parsed is left out, exactly as the board leaves it out', () => {
    writeFileSync(join(dir, 'bad.md'), '---\nstage: [unclosed\n---\n')
    file('ok.md', 'stage: active')
    expect(countPipeline(dir)).toEqual({ contacted: 0, 'in-conversation': 0, qualified: 0, committed: 0, active: 1 })
  })

  it('PIPELINE — the CLI prints exactly one line, no names, exits 0 (also for a missing folder)', async () => {
    file('a.md', `name: ${NAME}\nstage: committed`)
    const kanban = resolve(__dirname, '../..')
    const go = (d: string) =>
      new Promise<{ stdout: string; stderr: string }>((res, rej) =>
        execFile(join(kanban, 'node_modules/.bin/tsx'), ['scripts/day-pipeline.ts', '--dir', d], { cwd: kanban, env: { ...process.env, NODE_NO_WARNINGS: '1' } }, (err, stdout, stderr) =>
          err ? rej(err) : res({ stdout, stderr })),
      )
    const a = await go(dir)
    expect(a.stdout).toBe('pipeline: contacted=0 in-conversation=0 qualified=0 committed=1 active=0\n')
    expect(a.stdout + a.stderr).not.toContain(NAME)
    expect((await go(join(dir, 'missing'))).stdout).toBe('pipeline: none\n')
  }, 30_000)
})
