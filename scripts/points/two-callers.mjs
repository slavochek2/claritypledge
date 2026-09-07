#!/usr/bin/env node
/**
 * two-callers.mjs — P1210 §12 / DW-22. ONE implementation, TWO callers.
 *
 * Every predicate under `scripts/points/` must be
 *   (a) invoked by at least one of the six pipeline skill files, as
 *       `node scripts/points/<name>.mjs`, whose exit code the stage reads, AND
 *   (b) imported by at least one p1210 test.
 *
 * A check that exists as code nothing calls is prose with a file extension —
 * the exact defect §12 was written to end. A module reachable only from tests
 * proves the code runs; it proves nothing about the pipeline running it.
 *
 * THE HARNESS EXEMPTION IS EXPLICIT AND SMALL, and it is named here rather than
 * inferred, so that adding to it is a visible edit. These are not predicates —
 * they are the sweep, the vacuity scan, this check, the fixture verifier and the
 * fixture builders. Their callers are the verification contract and CI, not a
 * pipeline stage; requiring a stage to invoke them would put verification
 * plumbing into the run-of-show.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { commandSpans } from './md-spans.mjs'
import { fileURLToPath } from 'node:url'

export const id = 'two-callers'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')
const SKILL_DIR = '.claude/commands/slava/disagreement'

export const HARNESS = new Set([
  'verify-all.mjs',           // DW-20 — the completeness sweep
  'no-vacuous-tests.mjs',     // DW-21 — the vacuity scan
  'two-callers.mjs',          // DW-22 — this check
  'verify-fixture.mjs',       // DW-23 — the fixture verifier
  'redact-run.mjs',           // the derivation behind the run-B fixture
  'build-rule-fixtures.mjs',  // the must-fail fixture builder for rule-present
  'md-spans.mjs',             // P1244 — the markdown parser two scanners share
])

/**
 * @param {{modulesDir?: string, skillFiles?: string[], testFiles?: string[], harness?: Set<string>}} input
 */
export function run(input = {}) {
  const root = input.root ?? REPO_ROOT
  const modulesDir = input.modulesDir ?? path.join(root, 'scripts/points')
  const harness = input.harness ?? HARNESS
  const skillFiles = input.skillFiles ?? readdirSync(path.join(root, SKILL_DIR))
    .filter(f => f.endsWith('.md')).map(f => path.join(root, SKILL_DIR, f))
  const testDir = path.join(root, 'src/tests')
  const testFiles = input.testFiles ?? (existsSync(testDir)
    ? readdirSync(testDir).filter(f => /^p1210-.*\.test\.tsx?$/.test(f)).map(f => path.join(testDir, f))
    : [])

  const skillText = skillFiles.map(f => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n')
  // P1244 — an invocation must appear in a COMMAND SPAN, not in prose that merely
  // names the module. The old raw substring test over whole files could not tell
  // `node scripts/points/store-reconcile.mjs …` inside a runnable stanza from the
  // same string quoted inside a `>` blockquote explaining what the stage does.
  // No current false pass — both affected modules are genuinely invoked elsewhere —
  // but a future predicate that is only ever MENTIONED would have read as wired,
  // which is precisely the defect this check exists to catch, one level up.
  const skillCommandText = skillFiles
    .filter(f => existsSync(f))
    .map(f => commandSpans(readFileSync(f, 'utf8')).units.map(u => u.text).join('\n'))
    .join('\n')
  const testText = testFiles.map(f => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n')

  const modules = existsSync(modulesDir)
    ? readdirSync(modulesDir).filter(f => f.endsWith('.mjs')).sort()
    : []
  const findings = []
  const wired = []
  for (const m of modules) {
    if (harness.has(m)) continue
    const invoked = skillCommandText.includes(`node scripts/points/${m}`)
    const imported = new RegExp(`points/${m.replaceAll('.', '\\.')}`).test(testText)
    // A CLI CALLER THAT CANNOT RUN IS NOT A CALLER (added 2026-09-04, on the first
    // predicate that had this defect). This check verified that a skill file
    // REFERENCES the module and a test IMPORTS it — both true of room-split.mjs,
    // which had no `import.meta.url === file://process.argv[1]` block at all. The
    // documented command therefore exited 0 printing nothing: a gate wired into
    // Gate 2 that could never fail. Tests exercised the module; nothing exercised
    // the command. Epistemic gate 7 — an artifact you have not watched FAIL is
    // unproven, and the CLI path had never been run.
    const src = existsSync(path.join(modulesDir, m)) ? readFileSync(path.join(modulesDir, m), 'utf8') : ''
    const hasCli = src.includes('import.meta.url') && src.includes('process.argv')
    if (invoked && imported && hasCli) { wired.push(m); continue }
    const missing = [
      !invoked && 'no skill file invokes it',
      !imported && 'no p1210 test imports it',
      invoked && !hasCli && 'a skill invokes it as a command but it has NO CLI entry point — the command exits 0 printing nothing',
    ].filter(Boolean)
    findings.push({ module: m, missing })
  }

  if (findings.length) {
    return {
      ok: false, verdict: 'FLAG', findings, wired,
      detail: `FLAG — ${findings.length} module(s) without two callers:\n` +
        findings.map(f => `    ${f.module}: ${f.missing.join('; ')}`).join('\n'),
    }
  }
  return {
    ok: true, verdict: 'PASS', findings: [], wired,
    detail: `PASS — ${wired.length} predicate(s) each invoked by a skill file and imported by a test; ${harness.size} harness module(s) exempt by the named allowlist`,
  }
}

const FX = path.join(REPO_ROOT, 'src/tests/fixtures/p1210/two-callers')
export const FIXTURES = {
  pass: { modulesDir: path.join(FX, 'wired'), skillFiles: [path.join(FX, 'skill.md')], testFiles: [path.join(FX, 'test.ts')], harness: new Set() },
  fail: { modulesDir: path.join(FX, 'test-only'), skillFiles: [path.join(FX, 'skill.md')], testFiles: [path.join(FX, 'test.ts')], harness: new Set() },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run({})
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
