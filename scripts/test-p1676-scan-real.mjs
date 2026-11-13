// P1676 Done-When 2: the process scan against REAL vitest processes (spec risk row: "the scan
// pattern drifts from vitest's real argv after an upgrade"). Not in the default unit suite because it
// starts three real coordinators that stay alive ~25s each.
//
//   node scripts/test-p1676-scan-real.mjs
//
// Starts, against a trivial sleeping test in a scratch dir:
//   A  `vitest run`                 no TTY      -> counts
//   B  `vitest` (flagless)          no TTY      -> counts (vitest runs once without a terminal)
//   C  `vitest related <file>`      on a pty    -> a watch session, NOT counted
//   D  `npm exec vitest run`        no TTY      -> only its child coordinator counts
// A..D each have forks workers. The scan sees the WHOLE machine, so other sessions' runs are removed
// by keeping only rows that belong to this test (marker in argv, or a descendant of such a row).
// Expected: exactly 3 others (A, B, D's coordinator). Exit 0 pass, 1 fail.

import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { countOthers, isCoordinator, isProbableWatch, parsePs } from './lib/test-worker-share.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = path.join(repo, 'node_modules/.bin/vitest')
const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'p1676-scan-')))
mkdirSync(path.join(dir, 't'))
// globals + a config file in the scratch dir: no `import 'vitest'` (the dir has no node_modules), and
// vitest must not pick up the repo's own config.
writeFileSync(path.join(dir, 'vitest.config.mjs'), 'export default { test: { globals: true } }\n')
writeFileSync(
  path.join(dir, 't/a.test.ts'),
  "test('sleep', async () => { await new Promise((r) => setTimeout(r, 25000)) }, 60000)\n",
)
const testFile = path.join(dir, 't/a.test.ts')
const common = ['--maxWorkers=1', '--root', dir, '--config', path.join(dir, 'vitest.config.mjs')]
const children = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const launch = (cmd, args, opts = {}) => {
  const c = spawn(cmd, args, { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'], detached: true, ...opts })
  children.push(c)
  return c
}

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`)
  if (!ok) failed++
}

try {
  launch('node', [bin, 'run', ...common]) // A
  launch('node', [bin, ...common]) // B
  launch('script', ['-q', '/dev/null', 'node', bin, 'related', testFile, ...common]) // C (pty)
  launch('npm', ['exec', '--prefix', repo, 'vitest', '--', 'run', ...common]) // D
  await sleep(12000)

  const text = execFileSync('ps', ['-axo', 'pid=,ppid=,tty=,args='], { encoding: 'utf8', maxBuffer: 64 << 20 })
  const all = parsePs(text)
  const ours = new Set(all.filter((r) => r.args.includes(dir)).map((r) => r.pid))
  for (let grew = true; grew; ) {
    grew = false
    for (const r of all) if (!ours.has(r.pid) && ours.has(r.ppid)) (ours.add(r.pid), (grew = true))
  }
  const rows = all.filter((r) => ours.has(r.pid))
  console.log(`rows belonging to this test: ${rows.length}`)
  for (const r of rows) console.log(`  ${r.pid} ppid=${r.ppid} tty=${r.tty} ${r.args.slice(0, 150)}`)

  const coordinators = rows.filter(isCoordinator)
  const workers = rows.filter((r) => r.args.includes('vitest/dist/workers/'))
  const watchers = coordinators.filter(isProbableWatch)
  check('four coordinators visible (A, B, C, D child)', coordinators.length === 4, `got ${coordinators.length}`)
  check('fork workers are present and none is counted as a coordinator', workers.length >= 1 && !workers.some(isCoordinator), `workers=${workers.length}`)
  check('the pty `vitest related` session is a probable watch session', watchers.length === 1 && watchers[0].args.includes(' related '), `watchers=${watchers.length}`)
  check('npm exec wrapper is not a coordinator', !rows.some((r) => /^npm\b/.test(r.args) && isCoordinator(r)))

  // The observer (this process) is outside every row's ancestry; ours.pid excluded anyway.
  const others = countOthers(rows, process.pid)
  check('scan counts exactly 3 others (A, B, D coordinator; C is a watcher)', others === 3, `got ${others}`)
  const noTty = coordinators.filter((r) => r.tty === '??').length
  check('the three counted runs have no TTY', noTty === 3, `no-tty coordinators=${noTty}`)
} finally {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  await sleep(1500)
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  rmSync(dir, { recursive: true, force: true })
}
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
