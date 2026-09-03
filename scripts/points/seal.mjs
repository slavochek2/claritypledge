#!/usr/bin/env node
/**
 * seal.mjs — P1210 §11 / DW-19, RD-1 KEEP. The two-artifact seal model.
 *
 * "Implemented" is defined by DW-19 and this module is that definition:
 *
 *   CONSTRUCTION seal — the original prediction block plus its hash. Immutable.
 *     Construction accuracy scores against THIS one.
 *   ELIGIBILITY seal — measured-position eligibility plus its hash. Immutable.
 *     The publication version is sealed separately AGAINST this one, and
 *     audience responses score against it.
 *
 * The point of two artifacts: a revised point set does not retro-fit the
 * prediction it was supposed to be scored against.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const id = 'seal'

export const SEALS = ['construction', 'eligibility']

const canonical = body => JSON.stringify(body, Object.keys(body).sort())
export const hashBody = body => createHash('sha256').update(canonical(body)).digest('hex')

/** Emit an immutable sealed block. */
export function emit(kind, body) {
  if (!SEALS.includes(kind)) throw new Error(`seal: unknown seal kind "${kind}"`)
  return { kind, body, hash: hashBody(body) }
}

/**
 * Seal a publication version AGAINST the eligibility seal — its hash covers the
 * eligibility hash, so a publication cannot be re-pointed at a different
 * eligibility block without breaking.
 */
export function sealPublication(eligibility, version) {
  if (eligibility.kind !== 'eligibility') throw new Error('seal: publication must be sealed against the eligibility seal')
  const body = { version, eligibility_hash: eligibility.hash }
  return { kind: 'publication', body, hash: hashBody(body) }
}

/** @param {{seals: Array<{kind:string, body:object, hash:string}>}} input */
export function run(input) {
  const broken = []
  for (const s of input.seals ?? []) {
    const actual = hashBody(s.body)
    if (actual !== s.hash) broken.push({ kind: s.kind, recorded: s.hash, actual })
  }
  const present = new Set((input.seals ?? []).map(s => s.kind))
  for (const required of SEALS) {
    if (!present.has(required)) broken.push({ kind: required, recorded: '(absent)', actual: '(absent)' })
  }
  if (broken.length) {
    return {
      ok: false, verdict: 'TAMPERED', broken,
      detail: `TAMPERED — ${broken.map(b => b.kind).join(', ')} seal(s) broken\n` +
        broken.map(b => `    ${b.kind}: recorded ${b.recorded.slice(0, 16)}… actual ${b.actual.slice(0, 16)}…`).join('\n'),
    }
  }
  return { ok: true, verdict: 'VERIFIES', broken: [], detail: `VERIFIES — ${input.seals.length} seal(s) intact` }
}

const construction = emit('construction', {
  run: 'B',
  predictions: { P1: '40%', P2: '20%', P3: '70%', P4: '45%', P5: '35%' },
  band_disclosed_to_pass: false,
})
const eligibility = emit('eligibility', { run: 'B', eligible: ['P3', 'P5'], measured_at: '2026-08-31T00:00:00Z' })

export const FIXTURES = {
  pass: { seals: [construction, eligibility, sealPublication(eligibility, 1)] },
  // One character changed inside the eligibility body, hash left as recorded.
  fail: {
    seals: [
      construction,
      { ...eligibility, body: { ...eligibility.body, measured_at: '2026-08-31T00:00:01Z' } },
      sealPublication(eligibility, 1),
    ],
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: seal.mjs <seals.json>'); process.exit(2) }
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
