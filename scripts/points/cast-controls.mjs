#!/usr/bin/env node
/**
 * cast-controls.mjs — P1210 §3 / DW-17. Cast-level controls, because per-pair
 * edges do not catch a star cast.
 *
 * ONE of the three has a verdict, and only one, stated honestly rather than
 * implied:
 *   - per-person concentration — one arguer carrying MORE THAN HALF the filed
 *     points is a FINDING presented to the founder. Not an auto-drop.
 *   - distinct verified axes and pair coverage are PRINTED VALUES WITH NO
 *     THRESHOLD. No denominator or axis-identity rule exists yet, and inventing
 *     one here would be a number nothing supports.
 */
import { canonicalPair } from './run-scoring.mjs'

export const id = 'cast-controls'

/** @param {{cast: string[], points: Array<{id: string, axis?: string, positions: Array<{arguer:string,value:number,strength:string}>}>}} input */
export function run(input) {
  const filed = input.points ?? []
  const pairs = filed.map(p => ({ id: p.id, ...canonicalPair(p) }))

  // Concentration: on how many filed points does each arguer carry a canonical-pair seat?
  const seats = new Map(input.cast.map(c => [c, 0]))
  for (const p of pairs) {
    if (p.verdict !== 'PAIR') continue
    for (const who of p.pair) seats.set(who, (seats.get(who) ?? 0) + 1)
  }
  const scored = pairs.filter(p => p.verdict === 'PAIR').length
  const concentration = [...seats.entries()]
    .map(([who, n]) => ({ arguer: who, points: n, share: scored ? n / scored : 0 }))
    .sort((a, b) => b.points - a.points)

  // Printed, no threshold.
  const axes = [...new Set(filed.map(p => p.axis).filter(Boolean))]
  const coveredPairs = [...new Set(pairs.filter(p => p.verdict === 'PAIR').map(p => [...p.pair].sort().join('↔')))]

  const over = concentration.filter(c => c.share > 0.5)
  const values = {
    distinctVerifiedAxes: axes.length,
    pairCoverage: coveredPairs,
    concentration: concentration.map(c => `${c.arguer}:${c.points}/${scored}`),
  }
  const printed = [
    `  distinct verified axes (printed, no threshold): ${axes.length}${axes.length ? ` — ${axes.join(', ')}` : ''}`,
    `  pair coverage (printed, no threshold): ${coveredPairs.join(', ') || '—'}`,
    `  per-person concentration: ${values.concentration.join(', ') || '—'}`,
  ]
  if (over.length) {
    return {
      ok: false, verdict: 'FLAG', values,
      detail: [`FLAG — star cast: ${over.map(c => `${c.arguer} carries ${c.points} of ${scored} filed points (${Math.round(c.share * 100)}%)`).join('; ')}. FINDING for the founder, not an auto-drop.`, ...printed].join('\n'),
    }
  }
  return { ok: true, verdict: 'CLEAR', values, detail: ['CLEAR — no arguer carries more than half the filed points.', ...printed].join('\n') }
}

const pos = (a, v, s = 'close') => ({ arguer: a, value: v, strength: s })

export const FIXTURES = {
  // Balanced: every arguer holds two seats out of four points.
  pass: {
    cast: ['A1', 'A2', 'A3', 'A4'],
    points: [
      { id: 'P1', axis: 'openness', positions: [pos('A1', 3), pos('A2', -3)] },
      { id: 'P2', axis: 'governance', positions: [pos('A3', 3), pos('A4', -3)] },
      { id: 'P3', axis: 'pace', positions: [pos('A1', -3), pos('A3', 3)] },
      { id: 'P4', axis: 'legitimacy', positions: [pos('A2', 3), pos('A4', -3)] },
    ],
  },
  // Star: A1 contradicts everyone, nobody else opposes anyone.
  fail: {
    cast: ['A1', 'A2', 'A3', 'A4'],
    points: [
      { id: 'P1', axis: 'openness', positions: [pos('A1', 3), pos('A2', -3)] },
      { id: 'P2', axis: 'governance', positions: [pos('A1', 3), pos('A3', -3)] },
      { id: 'P3', axis: 'pace', positions: [pos('A1', 3), pos('A4', -3)] },
      { id: 'P4', axis: 'legitimacy', positions: [pos('A1', -3), pos('A2', 3)] },
    ],
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: cast-controls.mjs <cast.json>'); process.exit(2) }
  const { readFileSync } = await import('node:fs')
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(0)   // §3: a concentration FINDING is presented, never an auto-drop
}
