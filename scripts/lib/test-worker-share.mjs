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
import { readFileSync, realpathSync } from 'node:fs'
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
  const tokens = row.args.split(/\s+/)
  // vitest's subcommand is the token right after its entry; every later word is a filter or an
  // option value (`vitest run dev`, `--project dev`), never a mode (P1676 review, round 2).
  const entry = tokens.findIndex((t) => t.endsWith('node_modules/.bin/vitest') || t.endsWith('vitest/vitest.mjs'))
  const sub = entry === -1 ? undefined : tokens[entry + 1]
  const flags = tokens.slice(entry + 1)
  // A one-shot marker wins.
  if (sub === 'run' || flags.includes('--run') || flags.includes('--run=true')) return false
  // Asked for watch mode explicitly: a watcher with or without a terminal (background watchers
  // were otherwise counted all day).
  if (sub === 'watch' || sub === 'dev') return true
  if (flags.includes('--watch') || flags.includes('--watch=true') || flags.includes('-w')) return true
  if (flags.includes('--no-watch') || flags.includes('--watch=false')) return false
  return row.tty !== '??' && row.tty !== '?'
}

/**
 * Count other active runs: every coordinator except `selfPid`. An ANCESTOR coordinator still
 * counts: a suite that starts another vitest keeps its own workers busy (P1676 review). Wrappers
 * above the caller (npm, sh, the hook's bash) are never coordinators, so they need no exclusion.
 */
export function countOthers(rows, selfPid) {
  return rows.filter((r) => r.pid !== selfPid && isCoordinator(r) && !isProbableWatch(r)).length
}

/**
 * A real `ps` table always contains the caller's own row. One without it (empty, truncated, or a
 * format change that parsePs cannot read) would count as "0 other runs" and hand out the largest
 * share, so it is treated as a failed scan instead.
 */
export function scanLooksValid(rows, selfPid) {
  return rows.length > 0 && rows.some((r) => r.pid === selfPid)
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

/**
 * The arithmetic. Always an integer >= 1 and <= ceiling, whatever it is fed: a non-integer, NaN or
 * non-positive budget or ceiling counts as 1, because NaN would reach vitest as "unset" (cores - 1).
 */
export function computeShare({ others, budget, ceiling }) {
  const o = Number.isInteger(others) && others >= 0 ? others : 0
  const b = positiveInt(budget) ?? 1
  const c = positiveInt(ceiling) ?? 1
  const share = Math.max(1, Math.floor(b / (o + 1)))
  return Math.max(1, Math.min(share, c))
}

/**
 * Should vite.config.ts size this vitest process? Only under vitest, never on CI, never inside a
 * fork worker, and never when the caller already chose a count (VITEST_MAX_WORKERS, or any spelling
 * of the --maxWorkers flag: vitest gives both precedence over config, so sizing would only print a
 * line that contradicts the count vitest uses).
 */
export function configShouldSize(env, argv) {
  if (!env.VITEST || env.GITHUB_ACTIONS === 'true' || env.VITEST_POOL_ID) return false
  // Only a VALID override makes the config step aside. An invalid one (0, 'abc') parses to a falsy
  // number inside vitest, which then uses cores - 1; vite.config.ts removes it and sizes instead.
  if (env.VITEST_MAX_WORKERS && !invalidMaxWorkersEnv(env)) return false
  return !argv.some(
    (a) => a === '--maxWorkers' || a.startsWith('--maxWorkers=') || a === '--max-workers' || a.startsWith('--max-workers='),
  )
}

/**
 * VITEST_MAX_WORKERS is set but is not a plain positive integer. vitest reads this variable with
 * Number.parseInt (never as a percentage): '0', 'abc' and '   ' become unset (cores - 1), and '50%'
 * becomes 50 workers. Only a plain positive integer is a real choice (P1676 review, round 2).
 */
export function invalidMaxWorkersEnv(env) {
  const v = env.VITEST_MAX_WORKERS
  return v !== undefined && v !== '' && positiveInt(v) === null
}

/**
 * Remove an invalid VITEST_MAX_WORKERS before vitest resolves its config (it is applied AFTER the
 * config and would beat the computed share). Only locally: CI and fork workers are untouched.
 * Returns the warning line it emitted, or null when it changed nothing.
 */
export function dropInvalidMaxWorkersEnv(env, warn = (s) => process.stderr.write(s + '\n')) {
  const local = Boolean(env.VITEST) && env.GITHUB_ACTIONS !== 'true' && !env.VITEST_POOL_ID
  if (!local || !invalidMaxWorkersEnv(env)) return null
  const line = `[P1676] ignoring invalid VITEST_MAX_WORKERS=${JSON.stringify(env.VITEST_MAX_WORKERS)}`
  Reflect.deleteProperty(env, 'VITEST_MAX_WORKERS')
  warn(line)
  return line
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
 * @param {{ceiling?: number|string, env?: object, pid?: number, psText?: string, requireSelfRow?: boolean, write?: (s:string)=>void, cores?: number}} [opts]
 */
export function sizeTestWorkers(opts = {}) {
  const write = opts.write ?? ((s) => process.stderr.write(s + '\n'))
  const env = opts.env ?? process.env
  try {
    const ceil = resolveCeiling(opts.ceiling)
    const budget = resolveBudget(env.TEST_WORKER_BUDGET, opts.cores ?? os.availableParallelism())
    const warnings = [ceil.warning, budget.warning].filter(Boolean)
    const pid = opts.pid ?? process.pid
    // The self-row check applies to a REAL scan. Injected text (unit tests, the canary's
    // TEST_WORKER_SHARE_PS_FILE) is a fixture describing other processes; callers can opt in.
    const injected = opts.psText !== undefined || Boolean(env.TEST_WORKER_SHARE_PS_FILE)
    const rows = parsePs(opts.psText ?? readPsText(env))
    if ((opts.requireSelfRow ?? !injected) && !scanLooksValid(rows, pid)) {
      throw new Error(`process scan unusable (${rows.length} rows, own pid ${pid} missing)`)
    }
    const others = countOthers(rows, pid)
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
  // A --ceiling with its value missing is invalid input, not "no ceiling": pass a value
  // resolveCeiling rejects, so it falls back to the default WITH its warning.
  if (i !== -1) ceiling = argv[i + 1] ?? '(missing)'
  else {
    const eq = argv.find((a) => a.startsWith('--ceiling='))
    if (eq) ceiling = eq.slice('--ceiling='.length)
  }
  process.stdout.write(`${sizeTestWorkers({ ceiling })}\n`)
}

// Compare real paths: import.meta.url is resolved through symlinks, process.argv[1] is not, and a
// mismatch would make the hook's call print nothing and fall back to 1 worker without a word.
const isCli = () => {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (isCli()) main(process.argv.slice(2))
