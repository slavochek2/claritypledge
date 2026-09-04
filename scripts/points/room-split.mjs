#!/usr/bin/env node
/**
 * room-split.mjs — a candidate point must name WHO IN THE ROOM takes each side.
 *
 * WHY THIS EXISTS (measured 2026-09-04, run `ai-power-remedies-d`, Gate 1).
 * The pipeline's objective is a point "the room does not already agree about,
 * such that the per-point re-stake can move" (points-process.md §0.5), and that
 * section says in bold: DO NOT SUBSTITUTE ARGUER SPLIT FOR ROOM SPLIT.
 *
 * The orchestrator did exactly that anyway, and it was not carelessness — the
 * rung was missing. Measured on select.md at the time of the failure:
 *   - "room" in the Ranking Axes section .................... 0
 *   - "room split" / "does not already agree" / "re-stake" ... 0 in the whole file
 *   - "room" anywhere in the file ........................... 6, ALL intake
 * The four ranking axes were insight, popularity, claim match and position
 * match. Every one scores the ARGUERS. None asks whether the named room divides.
 * Condition 6 (relevance to the room) is owned by `prepare` — a stage LATER —
 * while P1210 §4 moved candidate-POINT approval INTO select's Gate 2. So points
 * were approved at a gate with no room criterion, and the room arrived after.
 *
 * WHAT THIS CAN AND CANNOT DO, stated so it is not oversold. Whether a room
 * actually splits is conditions 8 and 9, which points-process.md deliberately
 * leaves UNMEASURED rather than proxied, and no predicate may pretend otherwise.
 * This checks only that the judgement was MADE and has a room-shaped basis:
 * two DIFFERENT groups inside the room, named, one per side. A basis that cannot
 * name two groups is an arguer split wearing a room split's name — which is the
 * failure above, in its structural form rather than by reading prose (P1244: a
 * scanner that reads prose reads a sentence about a thing as the thing).
 */
export const id = 'room-split'

const txt = v => (typeof v === 'string' ? v.trim() : '')
const norm = s => txt(s).toLowerCase().replace(/\s+/g, ' ')

export function run(input) {
  const room = txt(input?.room)
  const points = Array.isArray(input?.points) ? input.points : null

  if (!room) {
    return { ok: false, verdict: 'REFUSE', offenders: [], detail: 'REFUSE — no room supplied. The room is what "already agree" is measured against; without it every split claim is unanchored.' }
  }
  if (!points || !points.length) {
    return { ok: false, verdict: 'REFUSE', offenders: [], detail: 'REFUSE — no candidate points supplied; an empty room-split check confirms nothing.' }
  }

  const offenders = []
  const lines = []
  for (const p of points) {
    const label = p?.id ?? p?.statement ?? '(unlabelled point)'
    const rs = p?.room_split
    if (!rs) {
      offenders.push(label)
      lines.push(`    ${label}: UNASSESSED — no room_split recorded. The arguers disagreeing is condition 1a, not the objective.`)
      continue
    }
    const a = txt(rs.for_who)
    const b = txt(rs.against_who)
    if (!a || !b) {
      offenders.push(label)
      const which = !a && !b ? 'neither side' : (!a ? 'for_who' : 'against_who')
      lines.push(`    ${label}: ONE-SIDED — ${which} names a group in the room. A point only one group in the room holds a view on cannot split it.`)
      continue
    }
    if (norm(a) === norm(b)) {
      offenders.push(label)
      lines.push(`    ${label}: SAME-GROUP — both sides name "${a}". That is one group, so this is an arguer split relabelled.`)
      continue
    }
    lines.push(`    ${label}: assessed — "${a}" vs "${b}"${rs.lean ? ` (lean: ${rs.lean})` : ''}`)
  }

  if (offenders.length) {
    return {
      ok: false, verdict: 'REFUSE', offenders,
      detail: `REFUSE — ${offenders.length} of ${points.length} candidate point(s) carry no room-shaped split basis. Name which group in "${room}" takes each side, or say the point is a backup rather than a lead:\n${lines.join('\n')}`,
    }
  }

  const leans = points.map(p => txt(p.room_split.lean)).filter(Boolean)
  const allLopsided = leans.length === points.length && new Set(leans.map(norm)).size === 1 && leans.length > 1
  return {
    ok: true,
    verdict: allLopsided ? 'ASSESSED-ALL-LOPSIDED' : 'ASSESSED',
    offenders: [],
    detail: `${allLopsided ? 'ASSESSED-ALL-LOPSIDED' : 'ASSESSED'} — ${points.length} point(s) name two groups in "${room}".${allLopsided ? ` FINDING for the founder: every point leans the same way ("${leans[0]}"), so the evening may not divide at all. Not an auto-drop — conditions 8 and 9 are unmeasured by design.` : ''}\n${lines.join('\n')}`,
  }
}

export const FIXTURES = {
  // must-pass: a real Gate-2 shape — two named groups inside the registered room
  pass: {
    room: 'people interested in AI safety among expats and digital nomads in Chiang Mai',
    points: [
      { id: 'P1', statement: 'Frontier model weights should be released openly',
        room_split: { for_who: 'the Zuzalu / crypto-adjacent builders who ship on open models', against_who: 'the AI-safety-interested slice', lean: 'divided' } },
      { id: 'P2', statement: 'AI compute and its returns should be brought under public ownership',
        room_split: { for_who: 'redistribution-sympathetic attendees', against_who: 'founders and nomads who are structurally anti-state', lean: 'leans against' } },
    ],
  },
  // must-fail: THE ACTUAL FAILURE — the split is described, but only about the ARGUERS
  fail: {
    room: 'people interested in AI safety among expats and digital nomads in Chiang Mai',
    points: [
      { id: 'P1', statement: 'Safety engineering can make continued building acceptable',
        room_split: { for_who: 'the room', against_who: 'the room', lean: 'divided' } },
      { id: 'P2', statement: 'Frontier development should be halted by international agreement' },
    ],
  },
}
