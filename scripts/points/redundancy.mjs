#!/usr/bin/env node
/**
 * redundancy.mjs — P1210 §2 / DW-3. Two points whose contradiction sentences
 * are the same proposition are one point.
 *
 * NARROWED TO WHAT IT CAN ACTUALLY DO. Only the deterministic half is decided
 * here (DW-3a): a proposition repeated verbatim, normalised for whitespace,
 * case and terminal punctuation, is a duplicate. The reworded near-miss is
 * PRINTED and left undecided (DW-3b, RD-7) — §2 rules that exact-string
 * identity cannot decide it, and §12's non-goal forbids tuning a similarity
 * threshold until its own three fixtures pass. So this module refuses to
 * pretend: NEAR-MISS is a third verdict, not a rounded PASS or FAIL.
 */
import { readFileSync } from 'node:fs'

export const id = 'redundancy'

export const normalise = s => s.toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim()

/** Cheap, printed-only overlap. Never a threshold that decides anything. */
function overlap(a, b) {
  const wa = new Set(normalise(a).split(' ')), wb = new Set(normalise(b).split(' '))
  const inter = [...wa].filter(w => wb.has(w)).length
  return inter / Math.max(wa.size, wb.size)
}

/** @param {{statements: string[], nearMissThreshold?: number}} input */
export function run(input) {
  const stmts = input.statements ?? []
  const dupes = []
  const nearMisses = []
  for (let i = 0; i < stmts.length; i++) {
    for (let j = i + 1; j < stmts.length; j++) {
      if (normalise(stmts[i]) === normalise(stmts[j])) { dupes.push([i, j]); continue }
      const o = overlap(stmts[i], stmts[j])
      // Reported for the founder to judge at /ship. Not a verdict (RD-7).
      if (o >= 0.5) nearMisses.push({ pair: [i, j], overlap: Number(o.toFixed(2)) })
    }
  }
  const lines = []
  for (const nm of nearMisses) {
    lines.push(`  NEAR-MISS (undecided, founder judges at /ship): statements ${nm.pair[0]} and ${nm.pair[1]}, word overlap ${nm.overlap}`)
  }
  if (dupes.length) {
    return {
      ok: false,
      verdict: 'FAIL',
      detail: [`FAIL — ${dupes.length} duplicate proposition(s): ${dupes.map(d => `${d[0]}≡${d[1]}`).join(', ')}`, ...lines].join('\n'),
      dupes, nearMisses,
    }
  }
  return {
    ok: true,
    verdict: 'PASS',
    detail: [`PASS — ${stmts.length} distinct proposition(s)`, ...lines].join('\n'),
    dupes, nearMisses,
  }
}

export const FIXTURES = {
  pass: {
    statements: [
      'Publishing frontier model weights openly does more against concentrated power than regulation will.',
      'How fast people actually adopt a technology is a better guide than what they say they want.',
    ],
  },
  fail: {
    statements: [
      'Publishing frontier model weights openly does more against concentrated power than regulation will.',
      'Publishing frontier model weights openly does more against concentrated power than regulation will.',
    ],
  },
  /** DW-3b: printed by this same harness, judged by the founder at /ship. */
  nearMiss: {
    statements: [
      'Publishing frontier model weights openly does more against concentrated power than regulation will.',
      'Releasing frontier model weights openly achieves more against concentrated power than regulation does.',
    ],
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: redundancy.mjs <statements.json>'); process.exit(2) }
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
