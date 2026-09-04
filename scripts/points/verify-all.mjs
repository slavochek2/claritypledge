#!/usr/bin/env node
/**
 * verify-all.mjs — P1210 DW-20. The completeness sweep.
 *
 * Runs EVERY predicate against its must-pass AND its must-fail fixture through
 * the identical code path, prints both results beside each other, and exits
 * non-zero if any predicate has no must-fail fixture (epistemic.md gates 7, 7c).
 *
 * THIS DOES NOT SUBSTITUTE FOR THE PER-LINE CONTROLS, and saying so is part of
 * the row. A generic end-of-run sweep is what let earlier versions of this work
 * ship gates whose false-positive rate was never measured: every Done-When line
 * names its own must-fail fixture, and this sweep only checks that none is
 * missing and that each one still bites.
 *
 * The last section runs this gate's OWN failure path — a module with no
 * must-fail fixture — and prints the exit code it would produce, so the sweep is
 * never trusted on a green run alone.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** The predicates. Harness modules (this file, the vacuity scan, two-callers,
 *  the derivation) are not predicates and are not swept.
 *
 *  `verify-fixture.mjs` IS swept, and the list below is the authority on that —
 *  it carries a must-pass and a must-fail fixture like any other predicate, so
 *  the sweep can check that it still bites. It is separately named in
 *  `two-callers.mjs`'s HARNESS set, which is a DIFFERENT list answering a
 *  DIFFERENT question (must a pipeline stage invoke it? — no). Corrected
 *  2026-09-03: this comment previously claimed it was not swept, contradicting
 *  the array three lines below it. */
export const PREDICATE_MODULES = [
  'admissibility.mjs', 'redundancy.mjs', 'unfilled.mjs', 'rule-present.mjs',
  'report-target.mjs', 'story-scan.mjs', 'store-inspection-scan.mjs',
  'store-reconcile.mjs', 'audience-floor.mjs', 'input-block-scan.mjs',
  'cast-controls.mjs', 'seal.mjs', 'verify-fixture.mjs', 'candidate-sweep.mjs',
  'source-binding.mjs',
  'room-split.mjs',
]

/** Modules that are harness, not predicates — the ONLY sanctioned reason for a
 *  file under scripts/points/ to be absent from PREDICATE_MODULES. */
export const HARNESS_MODULES = [
  'verify-all.mjs', 'two-callers.mjs', 'no-vacuous-tests.mjs', 'redact-run.mjs',
  'run-scoring.mjs', 'md-spans.mjs', 'build-rule-fixtures.mjs',
]

/**
 * The list above is hand-maintained, so a NEW predicate is invisible to this
 * sweep until someone remembers to add it — and an omitted module looks exactly
 * like a passing one. Measured 2026-09-04: `candidate-sweep.mjs` shipped with
 * both fixtures and a green test file, and this sweep reported 13 predicates all
 * passing without ever loading it. DW-20 exists to catch a predicate with no
 * must-fail fixture; it could not catch a predicate it had never heard of.
 *
 * So the divergence is now itself an error: every .mjs under this directory must
 * be on exactly one of the two lists.
 */
export async function checkCoverage() {
  const { readdirSync } = await import('node:fs')
  const onDisk = readdirSync(HERE).filter(f => f.endsWith('.mjs'))
  const known = new Set([...PREDICATE_MODULES, ...HARNESS_MODULES])
  const unlisted = onDisk.filter(f => !known.has(f))
  const missing = [...known].filter(f => !onDisk.includes(f))
  return { ok: unlisted.length === 0 && missing.length === 0, unlisted, missing }
}

export async function loadPredicates(names = PREDICATE_MODULES) {
  const out = []
  for (const name of names) {
    const mod = await import(path.join(HERE, name))
    out.push({ name, mod })
  }
  return out
}

/**
 * @param {Array<{name: string, mod: {run: Function, FIXTURES?: object}}>} predicates
 */
export function sweep(predicates) {
  const rows = []
  for (const { name, mod } of predicates) {
    const fx = mod.FIXTURES
    if (!fx || !('fail' in fx)) {
      rows.push({ name, status: 'NO-MUST-FAIL', pass: null, fail: null })
      continue
    }
    if (!('pass' in fx)) { rows.push({ name, status: 'NO-MUST-PASS', pass: null, fail: null }); continue }
    let p, f
    try { p = mod.run(fx.pass) } catch (e) { p = { ok: false, verdict: 'THREW', detail: String(e) } }
    try { f = mod.run(fx.fail) } catch (e) { f = { ok: false, verdict: 'THREW', detail: String(e) } }
    let status = 'OK'
    if (!p.ok) status = 'MUST-PASS DID NOT PASS'
    else if (f.ok) status = 'MUST-FAIL DID NOT FAIL'
    rows.push({ name, status, pass: p, fail: f })
  }
  return rows
}

export function format(rows) {
  const out = []
  for (const r of rows) {
    if (!r.pass) { out.push(`  ${r.name.padEnd(28)} ${r.status}`); continue }
    out.push(`  ${r.name.padEnd(28)} must-pass: ${r.pass.verdict.padEnd(14)} must-fail: ${r.fail.verdict.padEnd(14)} ${r.status === 'OK' ? '' : '<<< ' + r.status}`)
  }
  return out.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = sweep(await loadPredicates())
  console.log(`verify-all — ${rows.length} predicate(s), each against its must-pass AND its must-fail, identical code path\n`)
  console.log(format(rows))
  const bad = rows.filter(r => r.status !== 'OK')

  // This gate's own failure path, exercised rather than asserted (epistemic.md gate 7).
  const control = sweep([{ name: 'control-no-must-fail.mjs', mod: { run: () => ({ ok: true, verdict: 'PASS' }), FIXTURES: { pass: {} } } }])
  const controlCaught = control[0].status === 'NO-MUST-FAIL'
  console.log(`\n  self-control: a predicate with no must-fail fixture -> ${control[0].status}` +
              ` (${controlCaught ? 'CAUGHT — this sweep exits non-zero on it' : 'NOT CAUGHT — the sweep is blind'})`)

  // A module absent from both lists is invisible to everything above.
  const cov = await checkCoverage()
  if (!cov.ok) {
    console.log('\n  coverage: FAIL — every .mjs here must be on PREDICATE_MODULES or HARNESS_MODULES')
    if (cov.unlisted.length) console.log(`    on disk but on neither list: ${cov.unlisted.join(', ')}`)
    if (cov.missing.length) console.log(`    listed but not on disk: ${cov.missing.join(', ')}`)
  } else {
    console.log('\n  coverage: OK — no module under scripts/points/ is absent from both lists')
  }

  if (bad.length || !controlCaught || !cov.ok) {
    console.log(`\nFAIL — ${bad.length} predicate(s) not OK${controlCaught ? '' : ', and the sweep failed its own control'}${cov.ok ? '' : ', and a module is unaccounted for'}`)
    process.exit(1)
  }
  console.log(`\nPASS — ${rows.length} predicate(s), every must-pass passed and every must-fail failed`)
}
