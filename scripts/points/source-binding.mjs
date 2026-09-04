#!/usr/bin/env node
/**
 * source-binding.mjs — a claim-match verdict belongs to a FILE, never to a person.
 *
 * WHY (measured 2026-09-04, run `ai-power-remedies-c`). An arguer's position was
 * evidenced from one video and a DIFFERENT video was carried forward as that
 * arguer's source. Nothing re-ran the match against the file actually selected.
 * The carried file scored **0** on every term of the position it was supposed to
 * argue — "ownership stake", "sovereign wealth", "50%", "own and control" — while
 * the file the evidence came from scored 7 on one term alone. It reached a founder
 * gate and was caught by the adversarial judge downstream, not by the selector.
 *
 * The general shape: a verdict is computed against artifact A, artifact B is
 * swapped in, and the verdict silently travels. This binds the two together so the
 * swap cannot be silent.
 *
 * SCOPE, stated honestly: this checks that the match was measured against the
 * selected file and that the terms actually appear. It cannot check that the term
 * list is the RIGHT list for the position — that is judgement, and it stays at the
 * founder gate. What it removes is the case where nobody looked at all.
 */
export const id = 'source-binding'

/**
 * @param {{arguers: Array<{
 *   arguer: string,
 *   position: string,
 *   selected_source_id: string,
 *   claim_match?: { measured_against_source_id: string, terms: Record<string, number> } | null
 * }>}} input
 */
export function run(input) {
  const rows = input.arguers ?? []
  if (!rows.length) {
    return { ok: false, verdict: 'REFUSE', offenders: [], detail: 'REFUSE — no arguers supplied; an empty binding check confirms nothing.' }
  }
  const offenders = []
  const lines = []
  for (const a of rows) {
    const cm = a.claim_match
    if (!cm) {
      offenders.push(a.arguer)
      lines.push(`    ${a.arguer}: UNBOUND — no claim-match recorded for selected source ${a.selected_source_id}`)
      continue
    }
    if (cm.measured_against_source_id !== a.selected_source_id) {
      offenders.push(a.arguer)
      lines.push(`    ${a.arguer}: STALE — claim-match measured against ${cm.measured_against_source_id}, but the selected source is ${a.selected_source_id}. Re-measure against the file actually carried.`)
      continue
    }
    const terms = cm.terms ?? {}
    const hits = Object.values(terms).reduce((n, v) => n + (Number(v) || 0), 0)
    if (Object.keys(terms).length === 0) {
      offenders.push(a.arguer)
      lines.push(`    ${a.arguer}: UNBOUND — claim-match names the right file but records no terms`)
      continue
    }
    if (hits === 0) {
      offenders.push(a.arguer)
      lines.push(`    ${a.arguer}: ZERO — every term of "${a.position}" scores 0 in ${a.selected_source_id}. The source does not argue the position it is carried for.`)
      continue
    }
    lines.push(`    ${a.arguer}: bound — ${hits} hit(s) across ${Object.keys(terms).length} term(s) in ${a.selected_source_id}`)
  }
  const ok = offenders.length === 0
  return {
    ok, verdict: ok ? 'BOUND' : 'REFUSE', offenders,
    detail: `${ok ? 'BOUND' : 'REFUSE'} — ${rows.length - offenders.length} of ${rows.length} arguer(s) have a claim-match measured against the source actually selected.\n${lines.join('\n')}`,
  }
}

export const FIXTURES = {
  pass: {
    arguers: [{
      arguer: 'Arguer A', position: 'public ownership', selected_source_id: 'VN4b4UCWMKI',
      claim_match: { measured_against_source_id: 'VN4b4UCWMKI', terms: { 'sovereign wealth': 5, 'ownership stake': 1 } },
    }],
  },
  // the real incident: evidence from one file, a different file carried
  fail: {
    arguers: [{
      arguer: 'Arguer A', position: 'public ownership', selected_source_id: 'x1WdV6w2U7s',
      claim_match: { measured_against_source_id: 'VN4b4UCWMKI', terms: { 'sovereign wealth': 5, 'ownership stake': 1 } },
    }],
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: source-binding.mjs <arguers.json>'); process.exit(2) }
  const { readFileSync } = await import('node:fs')
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
