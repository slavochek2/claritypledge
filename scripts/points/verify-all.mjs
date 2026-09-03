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
 *  the fixture verifier, the derivation) are not predicates and are not swept. */
export const PREDICATE_MODULES = [
  'admissibility.mjs', 'redundancy.mjs', 'unfilled.mjs', 'rule-present.mjs',
  'report-target.mjs', 'story-scan.mjs', 'store-inspection-scan.mjs',
  'store-reconcile.mjs', 'audience-floor.mjs', 'input-block-scan.mjs',
  'cast-controls.mjs', 'seal.mjs', 'verify-fixture.mjs',
]

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

  if (bad.length || !controlCaught) {
    console.log(`\nFAIL — ${bad.length} predicate(s) not OK${controlCaught ? '' : ', and the sweep failed its own control'}`)
    process.exit(1)
  }
  console.log(`\nPASS — ${rows.length} predicate(s), every must-pass passed and every must-fail failed`)
}
