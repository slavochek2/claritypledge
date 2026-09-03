#!/usr/bin/env node
/**
 * no-vacuous-tests.mjs — P1210 DW-21. A green run over zero assertions is not green.
 *
 * MEASURED, not assumed: a file whose every test is `it.skip` / `it.todo` exits 0
 * under vitest — *1 skipped, 1 todo*, exit 0. So whole-file contract rows do NOT
 * close the exit-0 hole; all 16 rows of an earlier contract could have been green
 * with zero assertions executed, and neither goal-gate CHECK 1 nor CHECK 2 reads
 * for it. This is the row that does.
 *
 * TWO HALVES, both required:
 *   static  — the suite's SOURCES carry no `.skip`, `.todo` or `.only`
 *   dynamic — vitest's JSON reporter reports zero pending and a NON-ZERO
 *             executed count
 * The static half alone would miss a runtime-skipped test; the dynamic half alone
 * would miss a `.only` that silently narrows the suite to one green file.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const id = 'no-vacuous-tests'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')

export const VACUOUS = /^\s*(?:\/\/\s*)?(?:it|test|describe)\s*\.\s*(skip|todo|only|skipIf|runIf)\b/gm
export const CONCURRENT_ONLY = /^\s*(?:it|test|describe)\s*\.\s*concurrent\s*\.\s*only\b/gm

/** Static half. @param {{files: string[]}} input */
export function scanSources(input) {
  const hits = []
  for (const file of input.files) {
    if (!existsSync(file)) { hits.push({ file, line: 0, marker: 'file not found' }); continue }
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const re of [VACUOUS, CONCURRENT_ONLY]) {
        re.lastIndex = 0
        const m = re.exec(line)
        if (m) hits.push({ file: path.basename(file), line: i + 1, marker: m[0].trim() })
      }
    })
  }
  if (hits.length) {
    return {
      ok: false, verdict: 'VACUOUS', hits,
      detail: `VACUOUS — ${hits.length} skipped/todo/only marker(s):\n` +
        hits.map(h => `    ${h.file}:${h.line} — ${h.marker}`).join('\n'),
    }
  }
  return { ok: true, verdict: 'CLEAN', hits: [], detail: `CLEAN — zero skip/todo/only markers across ${input.files.length} source file(s)` }
}

export function suiteFiles(prefix, root = REPO_ROOT) {
  const dir = path.join(root, 'src/tests')
  return readdirSync(dir)
    .filter(f => f.startsWith(`${prefix}-`) && /\.test\.tsx?$/.test(f))
    .sort()
    .map(f => path.join(dir, f))
}

/** Dynamic half: vitest's own JSON reporter, read for counts rather than summary text. */
export function runSuite(prefix, root = REPO_ROOT) {
  let raw
  try {
    raw = execFileSync('npx', ['vitest', 'run', '--reporter=json', `src/tests/${prefix}-`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    })
  } catch (e) {
    raw = (e.stdout ?? '') + ''
    if (!raw.trim()) return { ok: false, verdict: 'NO-REPORT', detail: `NO-REPORT — vitest produced no JSON: ${String(e.stderr ?? e).slice(0, 400)}` }
  }
  const start = raw.indexOf('{')
  let report
  try { report = JSON.parse(raw.slice(start)) } catch { return { ok: false, verdict: 'NO-REPORT', detail: 'NO-REPORT — vitest JSON could not be parsed' } }
  const total = report.numTotalTests ?? 0
  const passed = report.numPassedTests ?? 0
  const pending = report.numPendingTests ?? 0
  const todo = report.numTodoTests ?? 0
  const failed = report.numFailedTests ?? 0
  const problems = []
  if (total === 0) problems.push('zero tests executed')
  if (pending > 0) problems.push(`${pending} pending/skipped`)
  if (todo > 0) problems.push(`${todo} todo`)
  if (failed > 0) problems.push(`${failed} failed`)
  const counts = `${total} total, ${passed} passed, ${pending} pending, ${todo} todo, ${failed} failed`
  if (problems.length) return { ok: false, verdict: 'VACUOUS', counts: report, detail: `VACUOUS — ${problems.join('; ')} (${counts})` }
  return { ok: true, verdict: 'EXECUTED', counts: report, detail: `EXECUTED — ${counts}` }
}

export function run(input = {}) {
  const prefix = input.prefix ?? 'p1210'
  const files = input.files ?? suiteFiles(prefix, input.root)
  const stat = scanSources({ files })
  if (input.staticOnly) return stat
  const dyn = runSuite(prefix, input.root)
  return { ok: stat.ok && dyn.ok, verdict: stat.ok && dyn.ok ? 'OK' : 'VACUOUS', static: stat, dynamic: dyn, detail: `${stat.detail}\n${dyn.detail}` }
}

const VDIR = path.join(REPO_ROOT, 'src/tests/fixtures/p1210/vacuous')
export const FIXTURES = {
  // Static-only so the controls stay cheap and deterministic; the dynamic half
  // runs against the real suite in the CLI path below.
  pass: { staticOnly: true, files: [path.join(VDIR, 'executed.fixture.ts')] },
  fail: { staticOnly: true, files: [path.join(VDIR, 'skipped.fixture.ts')] },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run({ prefix: process.argv[2] ?? 'p1210' })
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
