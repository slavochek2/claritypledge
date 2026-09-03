#!/usr/bin/env node
/**
 * redact-run.mjs — derive the committed run-B fixture from the real run file.
 *
 * P1210 DW-23. The fixture is DERIVED, never authored: this script is the
 * derivation, `verify-fixture.mjs` re-runs it and asserts byte-for-byte
 * reproduction of `src/tests/fixtures/p1210/run-b-redacted.md`.
 *
 * WHAT THIS EMITS, FIELD BY FIELD, WITH THE TRANSFORM APPLIED TO EACH.
 * The fixture is specified by the fields the checkers read — never as "the
 * original except X" (§12 requirement 3).
 *
 *   positions_unfilled_field  <- header `positions_unfilled:` list, as a COUNT.
 *   audience_floor            <- header `audience_floor:`, verbatim numbers.
 *   cast                      <- `arguers:` list. Transform: each FILLED entry
 *                                keeps its position number and gains a code
 *                                A1..An assigned in cast order; the name,
 *                                subject_key, video URL/id/title, uploader and
 *                                every metric are DROPPED. An UNFILLED entry
 *                                keeps its position number and status and gets
 *                                NO code (the P1208 roster convention — see
 *                                DW-23; numbering by position instead would
 *                                shift every pair in DW-4's expectation).
 *   sentences                 <- `phase_0_note:`. Transform: the sentence TEXT
 *                                is DROPPED and replaced by its id (a|b|c);
 *                                only the asserter and denier survive, as codes,
 *                                or UNCAST for a person who is not in the cast.
 *                                A verbatim sentence carries the names it
 *                                mentions, so keeping it beside an A1..An
 *                                roster would reconnect them — the P1208 defect
 *                                (RD-2) reproduced in test data.
 *   points                    <- point ids from `### Point Pn` headings, each
 *                                with its `traces_to_sentence` (see TRACE_MAP)
 *                                and its positions. Statements, framing_origin,
 *                                arbiter tags and loss estimates are DROPPED.
 *   positions                 <- `position: Pn = <label> [<strength>]` lines
 *                                inside `### Filed quotes`, attributed to the
 *                                arguer whose `arguer:` line they follow.
 *                                Transform: the label becomes its signed value,
 *                                the arguer becomes their code, the quotes and
 *                                their timecodes are DROPPED entirely.
 *
 * The real run file is gitignored, so this script only runs where it is present.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')

/** Likert label -> signed value. The run file's own vocabulary. */
export const SIGN = {
  strongly_agree: 3, agree: 2, somewhat_agree: 1, unsure: 0,
  somewhat_disagree: -1, disagree: -2, strongly_disagree: -3,
}

/**
 * Which point traces to which written contradiction sentence.
 *
 * THIS IS AN ANALYST JUDGEMENT CARRIED FROM THE SPEC, NOT DERIVED FROM THE RUN
 * FILE — stated plainly because pretending otherwise is the defect §12 names.
 * Run B stores no trace field; P1210 §"What the run measures" reads the five
 * points against the three sentences and finds only P3 traces (to sentence a).
 * It is pinned here so the fixture DECLARES it and `run-scoring.mjs` only
 * COUNTS it — the checker never gets to decide its own oracle.
 */
export const TRACE_MAP = { P1: 'none', P2: 'none', P3: 'a', P4: 'none', P5: 'none' }

/**
 * Resolve the real run file. `.private/` is gitignored and therefore absent
 * from every worktree, so fall back to the main checkout that owns the shared
 * .git directory — the loop runs in a worktree, the run file lives in main.
 */
export function resolveRunFile() {
  const rel = '.private/points-runs/ai-power-remedies.run-B.md'
  const candidates = [path.join(REPO_ROOT, rel)]
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
    if (common) candidates.push(path.join(path.dirname(common), rel))
  } catch { /* not a git repo, or git absent: the first candidate stands alone */ }
  for (const c of candidates) if (existsSync(c)) return c
  return null
}

/** Surname -> code, built from the cast. Returns UNCAST for anyone not cast. */
function codeForPerson(name, roster) {
  const surname = name.trim().split(/\s+/).pop().toLowerCase()
  for (const entry of roster) {
    if (!entry.name) continue
    if (entry.name.toLowerCase().split(/\s+/).includes(surname)) return entry.code
  }
  return 'UNCAST'
}

export function parseRun(src) {
  const lines = src.split('\n')

  // --- header fields -------------------------------------------------------
  const unfilledLine = lines.find(l => /^positions_unfilled:/.test(l)) ?? ''
  const unfilledRaw = unfilledLine.replace(/^positions_unfilled:\s*/, '').trim()
  const unfilledField = unfilledRaw === '[]' ? 0
    : unfilledRaw.replace(/^\[|\]$/g, '').split(',').filter(s => s.trim()).length

  const floorLine = lines.find(l => /^audience_floor:/.test(l)) ?? ''
  const minViews = Number((floorLine.match(/min_views:\s*(\d+)/) ?? [])[1] ?? 0)
  const minComments = Number((floorLine.match(/min_comments:\s*(\d+)/) ?? [])[1] ?? 0)

  // --- cast ----------------------------------------------------------------
  // `arguers:` is a YAML list of blocks; each starts `  - position: <n>`.
  const roster = []
  let inArguers = false
  let current = null
  for (const line of lines) {
    if (/^arguers:\s*$/.test(line)) { inArguers = true; continue }
    if (!inArguers) continue
    if (/^[a-z_]+:/.test(line)) break              // next top-level key ends the list
    const posM = line.match(/^\s*-\s*position:\s*(\d+)/)
    if (posM) {
      current = { position: Number(posM[1]), name: null, status: 'FILLED' }
      roster.push(current)
      continue
    }
    if (!current) continue
    const nameM = line.match(/^\s*name:\s*"(.+)"\s*$/)
    if (nameM) current.name = nameM[1]
    if (/^\s*status:\s*UNFILLED\s*$/.test(line)) current.status = 'UNFILLED'
  }
  let n = 0
  for (const e of roster) e.code = e.status === 'FILLED' ? `A${++n}` : null

  // --- contradiction sentences --------------------------------------------
  // Only the roles survive; the sentence text is dropped here and never emitted.
  const noteLine = lines.find(l => /^phase_0_note:/.test(l)) ?? ''
  const sentences = []
  for (const m of noteLine.matchAll(/\(([a-z])\)\s*'[^']*'\s*—\s*([A-Za-z]+)\s+asserts,\s*([A-Za-z]+)\s+denies/g)) {
    sentences.push({ id: m[1], asserts: codeForPerson(m[2], roster), denies: codeForPerson(m[3], roster) })
  }

  // --- points --------------------------------------------------------------
  const points = []
  for (const line of lines) {
    const m = line.match(/^###\s+Point\s+(P\d+)\s*$/)
    if (m) points.push({ id: m[1], traces_to_sentence: TRACE_MAP[m[1]] ?? 'none', positions: [] })
  }

  // --- positions, inside `### Filed quotes` only ---------------------------
  const fqStart = lines.findIndex(l => /^###\s+Filed quotes\s*$/.test(l))
  if (fqStart === -1) throw new Error('redact-run: no "### Filed quotes" section in the run file')
  let who = null
  for (let i = fqStart + 1; i < lines.length; i++) {
    const line = lines[i]
    const argM = line.match(/^arguer:\s*([^|]+?)\s*\|/)
    if (argM) { who = codeForPerson(argM[1], roster); continue }
    const posM = line.match(/^position:\s*(P\d+)\s*=\s*([a-z_]+)\s*\[([a-z]+)\]/)
    if (!posM || !who) continue
    const [, pid, label, strength] = posM
    if (!(label in SIGN)) throw new Error(`redact-run: unknown position label "${label}"`)
    const point = points.find(p => p.id === pid)
    if (!point) throw new Error(`redact-run: position for unknown point ${pid}`)
    point.positions.push({ arguer: who, value: SIGN[label], strength })
  }

  return { roster, sentences, points, unfilledField, floor: { minViews, minComments } }
}

const signed = v => (v > 0 ? `+${v}` : `${v}`)

export function render(run) {
  const out = []
  out.push('# Derived fixture — run B, redacted (GENERATED — DO NOT HAND-EDIT)')
  out.push('#')
  out.push('# Produced by scripts/points/redact-run.mjs from the gitignored run file.')
  out.push('# P1210 DW-23. Every field below is listed in that script with the transform')
  out.push('# applied to it. Names, statements, quotes, timecodes, video ids, metrics and')
  out.push('# the contradiction sentence TEXT are dropped at the source, not masked here.')
  out.push('')
  out.push(`positions_unfilled_field: ${run.unfilledField}`)
  out.push(`audience_floor: min_views=${run.floor.minViews} min_comments=${run.floor.minComments}`)
  out.push('')
  out.push('## Contradiction sentences')
  for (const s of run.sentences) out.push(`- id: ${s.id} | asserts: ${s.asserts} | denies: ${s.denies}`)
  out.push('')
  out.push('## Cast')
  for (const e of run.roster) {
    out.push(`- position: ${e.position} | code: ${e.code ?? '--'} | status: ${e.status}`)
  }
  out.push('')
  out.push('## Points')
  for (const p of run.points) {
    out.push(`- point: ${p.id} | traces_to_sentence: ${p.traces_to_sentence}`)
    for (const q of p.positions) out.push(`  position: ${q.arguer} = ${signed(q.value)} [${q.strength}]`)
  }
  out.push('')
  return out.join('\n')
}

export function deriveFixture() {
  const src = resolveRunFile()
  if (!src) return null
  return render(parseRun(readFileSync(src, 'utf8')))
}

/**
 * The digests `verify-fixture.mjs` scans against. Emitted from the gitignored run
 * file so the committed list carries NO name and NO sentence text — putting the
 * names into a public file is the thing the scan exists to prevent.
 */
export function emitForbidden() {
  const src = resolveRunFile()
  if (!src) return null
  const text = readFileSync(src, 'utf8')
  const { roster } = parseRun(text)
  const sha = s => createHash('sha256').update(s).digest('hex')
  const out = [
    '# Forbidden-token digests for P1210 DW-23 — GENERATED by redact-run.mjs --emit-forbidden.',
    '# sha256 of each real arguer surname (lowercased, letters only) and of each',
    '# contradiction sentence (lowercased, alphanumeric, single-spaced). No plaintext here:',
    '# a committed list of the names would put them in the file the scan protects.',
  ]
  const words = new Set()
  for (const e of roster) {
    if (!e.name) continue
    for (const part of e.name.split(/\s+/)) {
      const w = part.toLowerCase().replace(/[^a-z]/g, '')
      if (w.length >= 3) words.add(w)
    }
  }
  // Anyone named in phase_0_note but never cast (their surname must not leak either).
  const noteLine = text.split('\n').find(l => /^phase_0_note:/.test(l)) ?? ''
  for (const m of noteLine.matchAll(/—\s*([A-Za-z]+)\s+asserts,\s*([A-Za-z]+)\s+denies/g)) {
    for (const n of [m[1], m[2]]) {
      const w = n.toLowerCase().replace(/[^a-z]/g, '')
      if (w.length >= 3) words.add(w)
    }
  }
  for (const w of [...words].sort()) out.push(`word ${sha(w)}`)
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const sentences = []
  for (const m of noteLine.matchAll(/\(([a-z])\)\s*'([^']*)'/g)) sentences.push(norm(m[2]))
  for (const s of sentences.sort()) out.push(`sentence ${sha(s)}`)
  return out.join('\n') + '\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--emit-forbidden')) {
    const list = emitForbidden()
    if (list === null) { console.error('redact-run: source run file absent — cannot emit digests'); process.exit(3) }
    process.stdout.write(list); process.exit(0)
  }
  const text = deriveFixture()
  if (text === null) {
    console.error('redact-run: source run file absent (gitignored) — nothing to derive')
    process.exit(3)
  }
  process.stdout.write(text)
}
