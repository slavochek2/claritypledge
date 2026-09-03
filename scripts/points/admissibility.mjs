#!/usr/bin/env node
/**
 * admissibility.mjs — P1210 §2 / DW-2. SOURCE-FIDELITY, the blocking predicate.
 *
 * A point is filed only when its own axis carries a quote-grounded ASSERT from
 * one arguer and a quote-grounded DENY from the other. This is a claim about
 * what two people said, not about who is right, so it needs no room data.
 *
 * PREDICTED-OPPOSITION (the agent's signed Likert reading) is REPORTED here and
 * never consulted for the verdict — §2's predicate table makes that separation
 * non-negotiable, and conflating the two is how this pipeline ended up
 * prescribing opposite verdicts for the same input.
 */
import { readFileSync } from 'node:fs'

export const id = 'admissibility'

/**
 * @param {{point: string, pair: [string,string], quotes: Array<{arguer: string, stance: 'assert'|'deny', quote: string, seconds: number}>, predicted?: object}} input
 */
export function run(input) {
  const [a, b] = input.pair
  const grounded = (input.quotes ?? []).filter(q => q.quote && q.quote.trim() && Number.isFinite(q.seconds))
  const asserts = grounded.filter(q => q.stance === 'assert').map(q => q.arguer)
  const denies = grounded.filter(q => q.stance === 'deny').map(q => q.arguer)

  const missing = []
  if (!asserts.length) missing.push('assert')
  if (!denies.length) missing.push('deny')
  // Both sides must come from the pair, and not from one and the same person.
  if (!missing.length) {
    const side = new Set([...asserts, ...denies])
    if (!asserts.some(x => x === a || x === b)) missing.push('assert (not from the pair)')
    if (!denies.some(x => x === a || x === b)) missing.push('deny (not from the pair)')
    if (!missing.length && side.size < 2) missing.push('deny (both sides are the same arguer)')
  }

  const predicted = input.predicted ? ` [PREDICTED-OPPOSITION reported, not used: ${JSON.stringify(input.predicted)}]` : ''
  if (missing.length) {
    return {
      ok: false,
      verdict: 'REFUSE',
      detail: `${input.point}: REFUSE — missing side: ${missing.join(', ')}${predicted}`,
      missing,
    }
  }
  return {
    ok: true,
    verdict: 'FILE',
    detail: `${input.point}: FILE — assert by ${asserts.join('/')}, deny by ${denies.join('/')}${predicted}`,
    missing: [],
  }
}

export const FIXTURES = {
  pass: {
    point: 'P-assert-and-deny',
    pair: ['A1', 'A2'],
    quotes: [
      { arguer: 'A1', stance: 'assert', quote: 'openness is the defence', seconds: 955 },
      { arguer: 'A2', stance: 'deny', quote: 'openness leaves no defence', seconds: 1973 },
    ],
    predicted: { A1: 2, A2: -2 },
  },
  // Must-fail: the deny side is absent. Watched to fail before the predicate is
  // trusted (epistemic.md gate 7) — a predicate with only good inputs has an
  // unmeasured false-positive rate.
  fail: {
    point: 'P-deny-only-missing',
    pair: ['A1', 'A2'],
    quotes: [
      { arguer: 'A1', stance: 'assert', quote: 'openness is the defence', seconds: 955 },
    ],
    predicted: { A1: 2, A2: -2 },
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: admissibility.mjs <point.json>'); process.exit(2) }
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
