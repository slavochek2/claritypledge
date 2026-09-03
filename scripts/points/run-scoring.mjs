#!/usr/bin/env node
/**
 * run-scoring.mjs — score a run file against P1210's pair rule.
 *
 * DW-4. Reads a DERIVED run fixture (see redact-run.mjs) and reports:
 *   - how many written contradiction sentences the cast does not span
 *   - each point's canonical pair, under RD-6's total order
 *   - whether that pair itself carries a written contradiction sentence
 *   - how many points trace to no sentence, counted from the fixture's own
 *     declared `traces_to_sentence` field — this module never decides a trace
 *
 * The expectations live in the spec and are pinned there. This module computes;
 * if it disagrees with the pinned values, this module is wrong until the
 * derivation is shown to be (DW-4).
 */
import { readFileSync } from 'node:fs'

/**
 * RD-6: a total order over inference-strength labels, sorted-descending
 * lexicographic. `close` > `derived` > `stretch`. A pair's strength is its two
 * labels sorted descending and compared position by position; still equal
 * means AMBIGUOUS-PAIR, never a pick.
 */
export const STRENGTH_RANK = { close: 3, derived: 2, stretch: 1 }

export function parseFixture(text) {
  const run = { sentences: [], cast: [], points: [], unfilledField: 0, floor: {} }
  let point = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('#')) continue

    let m
    if ((m = line.match(/^positions_unfilled_field:\s*(\d+)/))) { run.unfilledField = Number(m[1]); continue }
    if ((m = line.match(/^audience_floor:\s*min_views=(\d+)\s+min_comments=(\d+)/))) {
      run.floor = { minViews: Number(m[1]), minComments: Number(m[2]) }; continue
    }
    if ((m = line.match(/^- id:\s*(\w+)\s*\|\s*asserts:\s*(\S+)\s*\|\s*denies:\s*(\S+)/))) {
      run.sentences.push({ id: m[1], asserts: m[2], denies: m[3] }); continue
    }
    if ((m = line.match(/^- position:\s*(\d+)\s*\|\s*code:\s*(\S+)\s*\|\s*status:\s*(\S+)/))) {
      run.cast.push({ position: Number(m[1]), code: m[2] === '--' ? null : m[2], status: m[3] }); continue
    }
    if ((m = line.match(/^- point:\s*(\S+)\s*\|\s*traces_to_sentence:\s*(\S+)/))) {
      point = { id: m[1], tracesToSentence: m[2] === 'none' ? null : m[2], positions: [] }
      run.points.push(point); continue
    }
    if ((m = line.match(/^\s+position:\s*(\S+)\s*=\s*([+-]?\d+)\s*\[(\w+)\]/))) {
      if (!point) throw new Error('run-scoring: a position line before any point')
      point.positions.push({ arguer: m[1], value: Number(m[2]), strength: m[3] }); continue
    }
  }
  return run
}

export function loadFixture(file) { return parseFixture(readFileSync(file, 'utf8')) }

/** A pair's strength key: its two ranks sorted descending (RD-6). */
export function strengthKey(a, b) {
  return [STRENGTH_RANK[a.strength] ?? 0, STRENGTH_RANK[b.strength] ?? 0].sort((x, y) => y - x)
}

function compareKeys(k1, k2) {
  for (let i = 0; i < Math.max(k1.length, k2.length); i++) {
    const d = (k2[i] ?? 0) - (k1[i] ?? 0)   // higher rank sorts first
    if (d !== 0) return d
  }
  return 0
}

/**
 * The canonical pair of a legacy point: the two positioned arguers with the
 * largest absolute difference in signed position; ties break by RD-6's order;
 * a tie surviving both steps is AMBIGUOUS-PAIR and is reported, never resolved.
 * Fewer than two positioned arguers is UNPAIRABLE.
 *
 * A pair is always DERIVED where two positioned arguers exist — including when
 * they agree. "No opposed pair" is a RESULT, not an absence of a pair.
 */
export function canonicalPair(point) {
  const pos = point.positions
  if (pos.length < 2) return { verdict: 'UNPAIRABLE', pair: null }
  const pairs = []
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      pairs.push({ a: pos[i], b: pos[j], diff: Math.abs(pos[i].value - pos[j].value) })
    }
  }
  const maxDiff = Math.max(...pairs.map(p => p.diff))
  let best = pairs.filter(p => p.diff === maxDiff)
  if (best.length > 1) {
    best.sort((p, q) => compareKeys(strengthKey(p.a, p.b), strengthKey(q.a, q.b)))
    const top = strengthKey(best[0].a, best[0].b)
    const tied = best.filter(p => compareKeys(strengthKey(p.a, p.b), top) === 0)
    if (tied.length > 1) return { verdict: 'AMBIGUOUS-PAIR', pair: null, candidates: tied.map(p => [p.a.arguer, p.b.arguer]) }
    best = [best[0]]
  }
  return { verdict: 'PAIR', pair: [best[0].a.arguer, best[0].b.arguer] }
}

/** Does some written contradiction sentence run between exactly these two? */
export function sentenceForPair(run, pair) {
  if (!pair) return null
  const [x, y] = pair
  const hit = run.sentences.find(s =>
    (s.asserts === x && s.denies === y) || (s.asserts === y && s.denies === x))
  return hit ? hit.id : null
}

/** A sentence is spanned when BOTH of its poles are cast. */
export function unspannedSentences(run) {
  const cast = new Set(run.cast.filter(c => c.code).map(c => c.code))
  return run.sentences.filter(s => !cast.has(s.asserts) || !cast.has(s.denies)).map(s => s.id)
}

export function scoreRun(run) {
  const points = run.points.map(p => {
    const cp = canonicalPair(p)
    return {
      id: p.id,
      verdict: cp.verdict,
      pair: cp.pair,
      candidates: cp.candidates ?? null,
      pairSentence: cp.verdict === 'PAIR' ? sentenceForPair(run, cp.pair) : null,
      tracesToSentence: p.tracesToSentence,
    }
  })
  return {
    sentences: run.sentences.length,
    unspanned: unspannedSentences(run),
    points,
    untraced: points.filter(p => !p.tracesToSentence).map(p => p.id),
    unscoreable: points.filter(p => p.verdict !== 'PAIR').map(p => p.id),
    noWrittenContradiction: points.filter(p => p.verdict === 'PAIR' && !p.pairSentence).map(p => p.id),
  }
}

export function formatScore(s) {
  const out = [`sentences: ${s.sentences}, unspanned: ${s.unspanned.length} (${s.unspanned.join(', ') || '—'})`]
  for (const p of s.points) {
    const pair = p.verdict === 'PAIR' ? `(${p.pair.join(', ')})` : p.verdict
    const sent = p.verdict !== 'PAIR' ? 'unscoreable'
      : p.pairSentence ? `sentence (${p.pairSentence})` : 'no written contradiction'
    out.push(`  ${p.id}: ${pair} — ${sent}; traces_to_sentence: ${p.tracesToSentence ?? 'none'}`)
  }
  out.push(`untraced: ${s.untraced.length} of ${s.points.length} (${s.untraced.join(', ') || '—'})`)
  return out.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: run-scoring.mjs <derived-run-fixture.md>'); process.exit(2) }
  console.log(formatScore(scoreRun(loadFixture(file))))
}
