// P1676: size one unit-test run to the machine at start.
//
//   share  = max(1, floor(budget / (others + 1)))      result = min(share, ceiling)
//   others = other active vitest runs, from ONE `ps` scan (stateless: nothing stored, so a crashed
//            run or a reused PID cannot hold a share).
//
// Used by vite.config.ts (every flagless run) and, through the CLI below, by the pre-commit hook
// (scripts/lib/precommit-tests.sh, which passes its own ceiling).
//
// INVARIANTS (spec P1676):
//   - never queues, sleeps or locks: sizing is one `ps` call and arithmetic;
//   - ALWAYS returns an integer >= 1. vitest treats a maxWorkers of 0 / NaN / undefined as unset and
//     falls back to cores - 1, so every failure path (bad input, ps failure, exception) returns 1
//     with a one-line warning, never "unset";
//   - nothing here can skip a test: only the NUMBER of workers changes.
//
// CLI:  node scripts/lib/test-worker-share.mjs --ceiling <n>
//       stdout: the bare integer. stderr: one line saying how it was chosen.
//
// TEST-ONLY seam: env TEST_WORKER_SHARE_PS_FILE=<path> reads the `ps` text from that file instead of
// running ps. It can only change the count of others; a missing file is a scan failure (-> 1).

import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const DEFAULT_CEILING = 4

// argv[0] basenames of wrappers around vitest: they hold the same argv text but are not the run.
const WRAPPERS = new Set(['npm', 'npx', 'sh', 'bash', 'zsh'])

const positiveInt = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 ? v : null
  if (typeof v !== 'string' || !/^\s*[0-9]+\s*$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 ? n : null
}

/** Parse `ps -axo pid=,ppid=,tty=,args=` text into rows. Unparseable lines are dropped. */
export function parsePs(text) {
  const rows = []
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*\S)\s*$/.exec(line)
    if (!m) continue
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), tty: m[3], args: m[4] })
  }
  return rows
}

const argv0Base = (args) => (args.split(/\s+/)[0] || '').split('/').pop()

/** A process that runs vitest's own entry: not a fork worker, not a wrapper around it. */
export function isCoordinator(row) {
  const a = row.args
  if (!a.includes('node_modules/.bin/vitest') && !a.includes('vitest/vitest.mjs')) return false
  if (a.includes('vitest/dist/workers/')) return false
  const base = argv0Base(a)
  if (WRAPPERS.has(base)) return false
  // The run is a node process. Any other argv[0] merely carries vitest's path in its args: a pty
  // wrapper (`script -q /dev/null node .../vitest related ...`, seen in the real-process test),
  // an editor, a pager. Only its child node process is the run.
  return /^node(js)?$/.test(base)
}

/** Attached to a terminal and no one-shot marker: vitest watches there. An idle watcher uses no CPU. */
export function isProbableWatch(row) {
  const hasTty = row.tty !== '??' && row.tty !== '?'
  if (!hasTty) return false
  const tokens = row.args.split(/\s+/)
  return !tokens.includes('run') && !tokens.includes('--run')
}

/** Count other active runs. Excludes `selfPid` and every ancestor of it found in the table. */
export function countOthers(rows, selfPid) {
  const byPid = new Map(rows.map((r) => [r.pid, r]))
  const skip = new Set([selfPid])
  for (let p = byPid.get(selfPid)?.ppid, guard = 0; p && !skip.has(p) && guard < 64; guard++) {
    skip.add(p)
    p = byPid.get(p)?.ppid
  }
  return rows.filter((r) => !skip.has(r.pid) && isCoordinator(r) && !isProbableWatch(r)).length
}

/** Budget: env TEST_WORKER_BUDGET, else max(1, cores - 3). Invalid env -> default + warning. */
export function resolveBudget(envValue, cores) {
  const dflt = Math.max(1, (positiveInt(cores) ?? 1) - 3)
  if (envValue === undefined || envValue === '') return { value: dflt }
  const n = positiveInt(envValue)
  if (n === null) return { value: dflt, warning: `TEST_WORKER_BUDGET=${JSON.stringify(envValue)} is not a positive integer, using ${dflt}` }
  return { value: n }
}

/** Ceiling: a positive integer, else the default + warning. */
export function resolveCeiling(value, dflt = DEFAULT_CEILING) {
  if (value === undefined) return { value: dflt }
  const n = positiveInt(value)
  if (n === null) return { value: dflt, warning: `ceiling ${JSON.stringify(value)} is not a positive integer, using ${dflt}` }
  return { value: n }
}

/** The arithmetic. Always an integer >= 1 and <= ceiling. */
export function computeShare({ others, budget, ceiling }) {
  const o = Number.isInteger(others) && others >= 0 ? others : 0
  const share = Math.max(1, Math.floor(budget / (o + 1)))
  return Math.max(1, Math.min(share, ceiling))
}

export function readPsText(env = process.env) {
  const file = env.TEST_WORKER_SHARE_PS_FILE
  if (file) return readFileSync(file, 'utf8')
  return execFileSync('ps', ['-axo', 'pid=,ppid=,tty=,args='], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * Choose a worker count and say how on stderr (exactly one line). Never throws, never returns
 * anything but an integer >= 1.
 * @param {{ceiling?: number|string, env?: object, pid?: number, psText?: string, write?: (s:string)=>void, cores?: number}} [opts]
 */
export function sizeTestWorkers(opts = {}) {
  const write = opts.write ?? ((s) => process.stderr.write(s + '\n'))
  const env = opts.env ?? process.env
  try {
    const ceil = resolveCeiling(opts.ceiling)
    const budget = resolveBudget(env.TEST_WORKER_BUDGET, opts.cores ?? os.availableParallelism())
    const warnings = [ceil.warning, budget.warning].filter(Boolean)
    const rows = parsePs(opts.psText ?? readPsText(env))
    const others = countOthers(rows, opts.pid ?? process.pid)
    const workers = computeShare({ others, budget: budget.value, ceiling: ceil.value })
    const noun = others === 1 ? 'other run' : 'other runs'
    write(
      `test workers: ${workers} (${others} ${noun}, budget ${budget.value}, ceiling ${ceil.value})` +
        (warnings.length ? ` [${warnings.join('; ')}]` : ''),
    )
    return workers
  } catch (err) {
    write(`test workers: 1 (sizing failed: ${String(err?.message ?? err).split('\n')[0]})`)
    return 1
  }
}

function main(argv) {
  let ceiling
  const i = argv.indexOf('--ceiling')
  if (i !== -1) ceiling = argv[i + 1]
  else {
    const eq = argv.find((a) => a.startsWith('--ceiling='))
    if (eq) ceiling = eq.slice('--ceiling='.length)
  }
  process.stdout.write(`${sizeTestWorkers({ ceiling })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2))
