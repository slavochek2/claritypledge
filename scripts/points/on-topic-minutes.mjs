#!/usr/bin/env node
/**
 * on-topic-minutes.mjs — P1355 C3. How much of the ARGUER'S OWN SPEECH is on the
 * topic, as one reproducible number.
 *
 * WHY THIS EXISTS (Clarity Night #2, 2026-09-22). Minutes on topic were read by
 * eye. One source was recorded at 7, 3 and 1.5 minutes by three readings in the
 * same run; another at 12 and 3. A floor ("at least 5 minutes on topic",
 * standing-rules.json) is meaningless when the measurement moves by a factor of
 * four depending on who reads.
 *
 * WHAT IT COUNTS. Inputs are the arguer's speaker-labelled turns (a Step 2c
 * diarize JSON per window, with the label->person mapping made per window
 * because labels are not stable across windows), or a single-speaker caption
 * track; the proposed on-topic ranges; and the position's source-binding terms.
 * Inside each proposed range, an arguer turn counts only if it contains a term,
 * or lies within `on_topic_context_seconds` (standing-rules.json) of a turn that
 * does. The range BOUNDS the count; it never supplies it. (P1355 review: when a
 * single hit let a whole range count, drawing Harari's ranges as the two full
 * windows with the term "AI" moved his result from 92.6s to 353.9s — the
 * number depended on who drew the ranges, which is the failure this file exists
 * to remove.) Seconds are the UNION of the counted intervals — a union, not a
 * sum, because rolling auto-captions repeat each line with overlapping
 * timestamps and a sum would double-count them.
 *
 * WHAT IT REFUSES. A multi-speaker source without labels is REFUSE, never
 * counted: the host's words would otherwise count as the guest's (select.md,
 * "Measure claim match... on the ARGUER'S OWN WORDS"). A "single-speaker" track
 * that carries turn markers (`>>`, `&gt;&gt;`) inside a counted range is
 * REFUSE too — the basis claim is contradicted by the artefact.
 *
 * SCOPE, stated so it is not oversold. It cannot judge whether the ranges are
 * the right ranges or the terms the right terms; those are proposed (by the
 * delegated pre-screen or the orchestrator) and shown at the gate. It removes
 * the eyeballed number, not the judgement. A term hit is tested against the
 * WHOLE text of a turn that overlaps the range, so a long turn that straddles a
 * range edge can lend the range a hit it did not earn — keep ranges on turn
 * boundaries.
 */
import { RULES } from './standing-rules.mjs'

export const id = 'on-topic-minutes'

const round1 = n => Math.round(n * 10) / 10
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `123`, `"2:03"`, `"1:02:03"`, `"2:03.5"` -> seconds; anything else -> null. */
export function toSeconds(v) {
  if (Number.isFinite(v)) return v
  if (typeof v !== 'string' || !v.trim()) return null
  const parts = v.trim().split(':')
  if (parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return null
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0)
}

/** A term matches as a whole word; a trailing `*` makes it a prefix (`job*`). */
export function termRegex(term) {
  const t = term.trim()
  const prefix = t.endsWith('*')
  const body = esc(prefix ? t.slice(0, -1) : t).replace(/\s+/g, '\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'giu')
}

const MARKER = /(?:>>|&gt;&gt;)/

/** A term must carry at least 3 letters or digits: `*`, `AI`, `a*` match nearly everything. */
export function weakTerm(term) {
  return (term.replace(/\*$/, '').match(/[\p{L}\p{N}]/gu) ?? []).length < 3
}

/** Length of the union of intervals, each clipped to [lo, hi]. */
function unionLength(intervals, lo, hi) {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let cur = null
  for (const [a, b] of clipped) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b] } else cur[1] = Math.max(cur[1], b)
  }
  if (cur) total += cur[1] - cur[0]
  return total
}

function refuse(detail, extra = {}) {
  return { ok: false, verdict: 'REFUSE', on_topic_seconds: null, ranges: [], detail: `REFUSE — ${detail}`, ...extra }
}

/**
 * @param {{
 *   arguer?: string,
 *   basis: 'speaker-labelled' | 'single-speaker',
 *   windows?: Array<{label?: string, speaker: string|string[], start?: number, duration?: number,
 *                    turns: Array<{start:number, end:number, speaker?:string, text:string}>}>,
 *   cues?: Array<{start:number, end:number, text:string}>,
 *   ranges: Array<[number|string, number|string] | {start:number|string, end:number|string}>,
 *   terms: string[],
 *   sensitive?: Array<[number|string, number|string] | {start, end}>,  // never counted (select.md S2)
 *   minSeconds?: number,
 * }} input
 */
export function run(input) {
  const who = input.arguer ?? 'arguer'
  // A floor may be raised for a run, never lowered: a lower one would print CLEARS for a source the
  // standing rule rejects.
  const minSeconds = Math.max(Number.isFinite(input.minSeconds) ? input.minSeconds : 0, RULES.min_on_topic_seconds)
  const context = RULES.on_topic_context_seconds
  const terms = (input.terms ?? []).filter(t => typeof t === 'string' && t.trim())
  if (!terms.length) return refuse('no source-binding terms supplied. A range is on topic only if the arguer says one of the position\'s terms in it; with no terms nothing can be counted.')
  const weak = terms.filter(weakTerm)
  if (weak.length) return refuse(`term(s) ${weak.map(t => JSON.stringify(t)).join(', ')} carry fewer than 3 letters — they match nearly every turn. Use the position's own source-binding terms.`)

  // --- ranges ---------------------------------------------------------------
  const rawRanges = input.ranges ?? []
  if (!rawRanges.length) return refuse('no proposed on-topic ranges supplied.')
  const ranges = []
  for (const r of rawRanges) {
    const [a, b] = Array.isArray(r) ? r : [r?.start, r?.end]
    const s = toSeconds(a), e = toSeconds(b)
    if (s === null || e === null || e <= s) return refuse(`malformed range ${JSON.stringify(r)}: needs start < end, as seconds or "MM:SS".`)
    ranges.push([s, e])
  }
  // Ranges are judged ONE AT A TIME and never merged first: merging two touching
  // ranges lets an off-topic range borrow its neighbour's term hit (caught by this
  // file's own must-pass fixture). Overlap is handled at the end, by taking the
  // union of the counted speech, so no second is counted twice.
  ranges.sort((x, y) => x[0] - y[0])
  const merged = ranges

  // Sensitive passages (room constraints, P1355 S2) never count toward the floor:
  // a source qualifies on the minutes it has OUTSIDE them. They are subtracted,
  // not used to exclude the source.
  const sensitive = []
  for (const r of input.sensitive ?? []) {
    const [a, b] = Array.isArray(r) ? r : [r?.start, r?.end]
    const s = toSeconds(a), e = toSeconds(b)
    if (s === null || e === null || e <= s) return refuse(`malformed sensitive passage ${JSON.stringify(r)}: needs start < end.`)
    sensitive.push([s, e])
  }

  // --- the arguer's own turns, and the spans actually covered by evidence -----
  let turns = []        // [{start, end, text}] — the arguer's only
  let covered = []      // [[a, b]] — time spans the evidence covers at all
  if (input.basis === 'speaker-labelled') {
    const windows = input.windows ?? []
    if (!windows.length) return refuse('basis is speaker-labelled but no diarized windows were supplied.')
    for (const [i, w] of windows.entries()) {
      const name = w.label ?? `window ${i + 1}`
      const labels = [].concat(w.speaker ?? []).filter(Boolean)
      if (!labels.length) return refuse(`${name}: no speaker label is mapped to ${who}. Labels are not stable across windows, so each window names its own mapping (select.md Step 2c).`)
      const wt = w.turns ?? []
      if (!wt.length) return refuse(`${name}: no turns.`)
      const unlabelled = wt.filter(t => !t.speaker)
      if (unlabelled.length) return refuse(`${name}: ${unlabelled.length} turn(s) carry no speaker label. A multi-speaker source without labels is never counted — the host's words would count as ${who}'s.`)
      const present = new Set(wt.map(t => t.speaker))
      const absent = labels.filter(l => !present.has(l))
      if (absent.length) return refuse(`${name}: mapped label(s) ${absent.join(', ')} never speak in this window (labels present: ${[...present].join(', ')}). The mapping is wrong for this window.`)
      // Diarization over-splits one person across labels (select.md Step 2c), so several labels may
      // map to one arguer — but only with the content line that proves it, or the host counts too.
      if (labels.length > 1 && !(typeof w.mapping_evidence === 'string' && w.mapping_evidence.trim())) {
        return refuse(`${name}: ${labels.length} labels (${labels.join(', ')}) mapped to ${who} with no mapping_evidence. Consolidating labels needs the in-transcript line that fixes each one to the person (select.md Step 2c).`)
      }
      const lo = Number.isFinite(w.start) ? w.start : Math.min(...wt.map(t => t.start))
      const hi = Number.isFinite(w.start) && Number.isFinite(w.duration) ? w.start + w.duration : Math.max(...wt.map(t => t.end))
      covered.push([lo, hi])
      for (const t of wt) if (labels.includes(t.speaker)) turns.push({ start: t.start, end: t.end, text: t.text ?? '' })
    }
  } else if (input.basis === 'single-speaker') {
    const cues = input.cues ?? []
    if (!cues.length) return refuse('basis is single-speaker but no caption cues were supplied.')
    turns = cues.map(c => ({ start: c.start, end: c.end, text: c.text ?? '' }))
    covered = [[Math.min(...cues.map(c => c.start)), Math.max(...cues.map(c => c.end))]]
    const marked = turns.filter(t => MARKER.test(t.text) && merged.some(([a, b]) => t.end > a && t.start < b))
    if (marked.length) {
      return refuse(`basis is single-speaker, but ${marked.length} cue(s) inside the proposed ranges carry a turn marker (">>" / "&gt;&gt;"), first at ${round1(marked[0].start)}s. The artefact contradicts the basis; diarize it (select.md Step 2c).`)
    }
  } else {
    return refuse(`basis must be "speaker-labelled" or "single-speaker" (got ${JSON.stringify(input.basis)}). A multi-speaker source without labels is never counted.`)
  }

  // --- count ------------------------------------------------------------------
  const res = []
  const countedIntervals = []
  for (const [a, b] of merged) {
    const inside = turns.filter(t => t.end > a && t.start < b)
    const hits = {}
    const hitTurns = new Set()
    for (const term of terms) {
      const re = termRegex(term)
      for (const t of inside) {
        const n = t.text.match(re)?.length ?? 0
        if (n) { hits[term] = (hits[term] ?? 0) + n; hitTurns.add(t) }
      }
    }
    // A turn counts if it hit, or sits within `context` seconds of a turn that did.
    const near = t => [...hitTurns].some(h => t.start <= h.end + context && t.end >= h.start - context)
    const countedTurns = inside.filter(t => hitTurns.has(t) || near(t))
    const coveredSecs = unionLength(covered, a, b)
    const uncovered = round1((b - a) - coveredSecs)
    const speech = unionLength(inside.map(t => [t.start, t.end]), a, b)
    const onTopic = Object.keys(hits).length > 0
    const clipped = countedTurns.map(t => [Math.max(t.start, a), Math.min(t.end, b)])
    if (onTopic) countedIntervals.push(...clipped)
    const sens = onTopic
      ? unionLength(clipped.flatMap(([x, y]) => sensitive.map(([p, q]) => [Math.max(x, p), Math.min(y, q)])), -Infinity, Infinity)
      : 0
    res.push({
      start: a, end: b, hits, uncovered_seconds: uncovered,
      arguer_speech_seconds: round1(speech),
      counted_seconds: onTopic ? round1(unionLength(clipped, a, b) - sens) : 0,
      sensitive_seconds: round1(sens),
      status: onTopic ? 'COUNTED' : (inside.length ? 'NO-TERM-HIT' : 'NO-ARGUER-SPEECH'),
    })
  }
  const gross = unionLength(countedIntervals, -Infinity, Infinity)
  // The part of the counted speech that falls inside a sensitive passage — the
  // union of pairwise intersections, so overlapping passages are not subtracted twice.
  const overlapSens = unionLength(
    countedIntervals.flatMap(([a, b]) => sensitive.map(([x, y]) => [Math.max(a, x), Math.min(b, y)])),
    -Infinity, Infinity)
  const excluded = round1(overlapSens)
  const total = round1(gross - overlapSens)
  const ok = total >= minSeconds
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
  const lines = res.map(r =>
    `    ${mmss(r.start)}-${mmss(r.end)}: ${r.status} — ${r.counted_seconds}s counted of ${r.arguer_speech_seconds}s ${who} speech` +
    `${Object.keys(r.hits).length ? `; hits ${Object.entries(r.hits).map(([t, n]) => `${t}×${n}`).join(', ')}` : ''}` +
    `${r.sensitive_seconds > 0 ? `; ${r.sensitive_seconds}s inside a sensitive passage, not counted` : ''}` +
    `${r.uncovered_seconds > 0 ? `; ${r.uncovered_seconds}s of this range lie outside the supplied evidence and were NOT counted` : ''}`)
  const verdict = ok ? 'CLEARS' : 'BELOW-FLOOR'
  return {
    basis: input.basis,
    ok, verdict, on_topic_seconds: total, min_seconds: minSeconds, ranges: res,
    excluded_sensitive_seconds: excluded,
    detail: `${verdict} — ${who}: ${total}s (${round1(total / 60)} min) of the arguer's own speech on topic, against a floor of ${minSeconds}s (${input.basis})${excluded ? `; ${excluded}s inside sensitive passages NOT counted` : ''}.\n${lines.join('\n')}`,
  }
}

// --- fixtures -----------------------------------------------------------------
// A two-person interview window: the host asks about work, the guest answers.
const INTERVIEW = {
  label: 'fixture window 0-600s', speaker: 'spk:1', start: 0, duration: 600,
  turns: [
    { start: 0, end: 20, speaker: 'spk:0', text: 'So does meaning come from your job? Is purpose in work?' },
    { start: 20, end: 200, speaker: 'spk:1', text: 'Meaning does not come from the job title. Purpose is something you build.' },
    { start: 200, end: 230, speaker: 'spk:0', text: 'And the economy?' },
    { start: 230, end: 400, speaker: 'spk:1', text: 'Interest rates are a separate matter entirely.' },
    { start: 400, end: 560, speaker: 'spk:1', text: 'Which is why I say your purpose is not your paycheck.' },
  ],
}

export const FIXTURES = {
  // must-pass: 180s + 160s of the guest's own on-topic speech clears 300s;
  // the host's question (which also says "meaning") counts for nothing, and the
  // interest-rates range — which TOUCHES the next range — has no term hit of its own.
  pass: {
    arguer: 'Guest', basis: 'speaker-labelled', windows: [INTERVIEW],
    ranges: [[0, 200], [230, 400], [400, 560]], terms: ['meaning', 'purpose'],
  },
  // must-fail: the same audio with its labels stripped — unlabelled multi-speaker
  // speech is never counted.
  fail: {
    arguer: 'Guest', basis: 'speaker-labelled',
    windows: [{ ...INTERVIEW, turns: INTERVIEW.turns.map(({ speaker, ...t }) => t) }],
    ranges: [[0, 200]], terms: ['meaning', 'purpose'],
  },
}

// --- CLI ------------------------------------------------------------------------
/** Parse a WebVTT caption file into cues. */
export function parseVtt(text) {
  const cues = []
  const blocks = text.replace(/\r/g, '').split(/\n\n+/)
  for (const b of blocks) {
    const lines = b.split('\n')
    const i = lines.findIndex(l => l.includes('-->'))
    if (i === -1) continue
    const [s, e] = lines[i].split('-->').map(x => toSeconds(x.trim().split(/\s+/)[0]))
    if (s === null || e === null) continue
    const txt = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (txt) cues.push({ start: s, end: e, text: txt })
  }
  return cues
}

/**
 * Load a C3 input file the way the CLI does: resolve ~ and $VAR paths relative to the file, read the
 * diarize JSON windows or the raw VTT. Exported so run-file-check.mjs re-runs the SAME measurement
 * from the file the run file names, instead of trusting a typed number.
 * @returns {object} an input for run(); throws with a readable message on a missing file or variable.
 */
export async function loadInput(file) {
  const { readFileSync } = await import('node:fs')
  const path = await import('node:path')
  const inp = JSON.parse(readFileSync(file, 'utf8'))
  // Paths may use ~ and $VAR / ${VAR} (select.md documents $DIARIZE_STORE). An unset variable is a
  // usage error named as such, never a literal "$DIARIZE_STORE" directory and an ENOENT crash.
  const rel = p => {
    const expanded = p.replace(/^~(?=\/)/, process.env.HOME).replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (m, name) => {
      if (process.env[name] === undefined) {
        throw new Error(`${name} is not set (docs/points-process.md §0.6 names the store paths). Export it or write the path out.`)
      }
      return process.env[name]
    })
    return path.resolve(path.dirname(file), expanded)
  }
  if (Array.isArray(inp.windows)) {
    inp.windows = inp.windows.map(w => {
      if (!w.file) return w
      const d = JSON.parse(readFileSync(rel(w.file), 'utf8'))
      return { label: w.label ?? path.basename(w.file), speaker: w.speaker, mapping_evidence: w.mapping_evidence, start: d.start, duration: d.duration, turns: d.turns }
    })
  }
  if (inp.vtt) inp.cues = parseVtt(readFileSync(rel(inp.vtt), 'utf8'))
  return inp
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: on-topic-minutes.mjs <input.json>\n' +
      '  {arguer, basis:"speaker-labelled", windows:[{file:"<diarize.json>", speaker:"spk:0"}], ranges:[["38:30","40:00"]], terms:[...]}\n' +
      '  {arguer, basis:"single-speaker", vtt:"<raw en.vtt>", ranges:[...], terms:[...]}')
    process.exit(2)
  }
  let inp
  try { inp = await loadInput(file) } catch (e) { console.error(`on-topic-minutes: ${e.message}`); process.exit(2) }
  const r = run(inp)
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
