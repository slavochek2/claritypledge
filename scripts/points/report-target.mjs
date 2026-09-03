#!/usr/bin/env node
/**
 * report-target.mjs — P1210 §3 / DW-8. The point target is a PLANNING figure,
 * never an optimisation target.
 *
 * A run that honestly yields 3 files 3 and reports `<filed> of <planned>`.
 * At or above target, nothing is printed: a shortfall line that always appears
 * is a banner, not a report.
 */
export const id = 'report-target'

/** @param {{filed: number, planned: number}} input */
export function run(input) {
  const { filed, planned } = input
  if (filed < planned) {
    return {
      ok: false, verdict: 'SHORT', line: `${filed} of ${planned}`,
      detail: `SHORTFALL: ${filed} of ${planned} points filed. File what the topic honestly yields — do NOT add an arguer except against a named new contradiction sentence, and do not relax Gate 0, the recency floor or the audience floor to reach the number.`,
    }
  }
  return { ok: true, verdict: 'AT-TARGET', line: '', detail: '' }
}

export const FIXTURES = {
  pass: { filed: 5, planned: 5 },
  fail: { filed: 3, planned: 7 },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [filed, planned] = process.argv.slice(2).map(Number)
  if (!Number.isFinite(filed) || !Number.isFinite(planned)) {
    console.error('usage: report-target.mjs <filed> <planned>'); process.exit(2)
  }
  const r = run({ filed, planned })
  if (r.detail) console.log(r.detail)
  process.exit(0)   // a shortfall is REPORTED, never a run-stopper (§3)
}
