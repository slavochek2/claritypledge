#!/usr/bin/env node
/**
 * run-file-check.mjs — P1355 C4. The approvals block cannot be sealed while it
 * breaks a standing rule.
 *
 * WHY THIS EXISTS. No check can observe an agent READING a rule. What code can
 * do is refuse the OUTPUT a run must produce when that output violates one.
 * `select` Phase 5 seals the approvals block; this runs immediately before the
 * seal, over exactly the span the seal will cover, and refuses when:
 *   - an arguer lacks `voice`, `why_in_the_room`, `on_topic_seconds` (from
 *     on-topic-minutes.mjs), `upload_date` or `language`;
 *   - a source is not English (never overridable, rule 1);
 *   - a source is below the view/comment floor, below the on-topic minutes, or
 *     older than its voice's recency line, WITHOUT a per-arguer `override`
 *     whose reason covers that floor (standing-rules.json `override_covers`);
 *   - the header `audience_floor` is missing, or lower than standing-rules.json.
 *
 * WHY THE OVERRIDE MUST BE INSIDE THE BLOCK. The block is sealed; the header
 * above it is not. An exception written in the header could be edited after
 * Gate 2 without breaking any seal, which makes it a relaxed floor with a
 * paper trail of zero. So this reads overrides from inside the span only, and a
 * header floor LOWER than the standing rule is refused outright (decisions.md
 * 2026-08-28 [process]: floors are never relaxed to manufacture a disagreement).
 */
import { RULES, recencyFloors, ymd, parseOverride } from './standing-rules.mjs'

export const id = 'run-file-check'

const END = '<!-- end-approvals-block -->'

/** A YAML-subset scalar: "quoted" (JSON escapes), 'quoted', number, or bare text (trailing # comment dropped). */
export function scalar(raw) {
  const v = raw.trim()
  if (v.startsWith('"')) {
    let i = 1
    while (i < v.length && !(v[i] === '"' && v[i - 1] !== '\\')) i++
    try { return JSON.parse(v.slice(0, i + 1)) } catch { return v.slice(1, i) }
  }
  if (v.startsWith("'")) { const j = v.indexOf("'", 1); return v.slice(1, j === -1 ? undefined : j) }
  const bare = v.replace(/\s+#.*$/, '').trim()
  if (/^-?\d+(\.\d+)?$/.test(bare)) return Number(bare)
  if (bare === 'null' || bare === '~' || bare === '') return null
  return bare
}

/** Split a run file into {header, block, arguers}; header = top-level keys above the block. */
export function parseRunFile(text) {
  const lines = text.split('\n')
  const start = lines.findIndex(l => /^###\s+Approvals Block/.test(l))
  const end = lines.findIndex((l, i) => i > start && l.includes(END))
  if (start === -1 || end === -1) return null
  const header = {}
  for (const l of lines.slice(0, start)) {
    const m = l.match(/^([a-z_0-9]+):\s*(.*)$/)
    if (m) header[m[1]] = m[2].trim()
  }
  const blockLines = lines.slice(start, end + 1)
  const block = {}
  const arguers = []
  let inArguers = false
  let cur = null
  for (const l of blockLines.slice(1)) {
    if (l.includes(END)) break
    if (/^arguers:\s*$/.test(l)) { inArguers = true; continue }
    const top = l.match(/^([a-z_0-9]+):\s*(.*)$/)
    if (top) { inArguers = false; block[top[1]] = scalar(top[2]); continue }
    if (!inArguers) continue
    const item = l.match(/^\s*-\s+([a-z_0-9]+):\s*(.*)$/)
    if (item) { cur = { [item[1]]: scalar(item[2]) }; arguers.push(cur); continue }
    const kv = l.match(/^\s{3,}([a-z_0-9]+):\s*(.*)$/)
    if (kv && cur) cur[kv[1]] = scalar(kv[2])
  }
  return { header, block, arguers, span: blockLines.join('\n') }
}

function floorFromHeader(raw) {
  if (!raw) return null
  const v = Number((raw.match(/min_views:\s*(\d+)/) ?? [])[1])
  const c = Number((raw.match(/min_comments:\s*(\d+)/) ?? [])[1])
  return Number.isFinite(v) && Number.isFinite(c) ? { minViews: v, minComments: c } : null
}

const isEnglish = lang => typeof lang === 'string' && /^en(?:$|[-_])/i.test(lang.trim())

/**
 * @param {{text: string, asOf?: string}} input — `asOf` defaults to the block's
 *   `gate_2_approved_at`, the date the founder approved this set.
 */
export function run(input) {
  const parsed = parseRunFile(input.text ?? '')
  if (!parsed) {
    return { ok: false, verdict: 'REFUSE', offenders: [], detail: `REFUSE — no "### Approvals Block" ending in "${END}". The seal is taken over exactly that span; there is nothing to check or seal.` }
  }
  const { header, block, arguers } = parsed
  const problems = []   // run-level
  const offenders = []
  const lines = []

  const headerFloor = floorFromHeader(header.audience_floor)
  const std = { minViews: RULES.floors.min_views, minComments: RULES.floors.min_comments }
  if (!headerFloor) {
    problems.push(`header audience_floor is missing or unreadable — it is mandatory (standing-rules.json default: { min_views: ${std.minViews}, min_comments: ${std.minComments} })`)
  } else if (headerFloor.minViews < std.minViews || headerFloor.minComments < std.minComments) {
    problems.push(`header audience_floor { min_views: ${headerFloor.minViews}, min_comments: ${headerFloor.minComments} } is LOWER than standing-rules.json { ${std.minViews}, ${std.minComments} }. A floor is never relaxed in the header; an exception is a per-arguer override inside this sealed block`)
  }
  const floor = headerFloor
    ? { minViews: Math.max(headerFloor.minViews, std.minViews), minComments: Math.max(headerFloor.minComments, std.minComments) }
    : std

  const asOf = ymd(input.asOf ?? block.gate_2_approved_at ?? '')
  const recency = asOf ? recencyFloors(asOf) : null
  if (!recency) problems.push('no run date: gate_2_approved_at is missing from the block and no asOf was given, so recency cannot be measured')
  if (!arguers.length) problems.push('the block carries no arguers')

  for (const a of arguers) {
    const who = `position ${a.position ?? '?'}${a.name ? ` (${a.name})` : ''}`
    const missing = ['voice', 'why_in_the_room', 'on_topic_seconds', 'upload_date', 'language']
      .filter(k => a[k] === undefined || a[k] === null || a[k] === '')
    const fails = []
    if (missing.length) fails.push(`missing ${missing.join(', ')}`)
    if (a.voice != null && !RULES.voices.includes(a.voice)) fails.push(`voice "${a.voice}" is not one of ${RULES.voices.join(' | ')}`)
    if (a.on_topic_seconds != null && !Number.isFinite(a.on_topic_seconds)) fails.push(`on_topic_seconds "${a.on_topic_seconds}" is not a number`)
    if (a.language != null && a.language !== '' && !isEnglish(a.language)) fails.push(`language "${a.language}" is not English — never overridable`)

    // Floors that a covering override may lift.
    const below = []
    if (!(Number.isFinite(a.view_count) && a.view_count >= floor.minViews)) below.push(['views', `views ${a.view_count ?? 'unrecorded'} < ${floor.minViews}`])
    if (!(Number.isFinite(a.comment_count) && a.comment_count >= floor.minComments)) below.push(['comments', `comments ${a.comment_count ?? 'unrecorded'} < ${floor.minComments}`])
    if (Number.isFinite(a.on_topic_seconds) && a.on_topic_seconds < RULES.min_on_topic_seconds) below.push(['minutes', `on topic ${a.on_topic_seconds}s < ${RULES.min_on_topic_seconds}s`])
    const up = ymd(String(a.upload_date ?? ''))
    if (a.upload_date != null && a.upload_date !== '' && !up) fails.push(`upload_date "${a.upload_date}" is not a date`)
    if (up && recency && RULES.voices.includes(a.voice) && recency[a.voice] && up < recency[a.voice]) {
      below.push(['recency', `stale ${a.voice} voice (${up} < ${recency[a.voice]})`])
    }

    let covered = []
    if (a.override != null && a.override !== '') {
      const o = parseOverride(a.override)
      if (!o.ok) fails.push(`override rejected: ${o.problem}`)
      else covered = RULES.override_covers[o.reason] ?? []
    }
    const uncovered = below.filter(([k]) => !covered.includes(k))
    for (const [, msg] of uncovered) fails.push(`${msg} and no override covers it`)
    const lifted = below.filter(([k]) => covered.includes(k)).map(([, msg]) => msg)

    if (fails.length) {
      offenders.push(who)
      lines.push(`    ${who}: REFUSE — ${fails.join('; ')}`)
    } else {
      lines.push(`    ${who}: ok${lifted.length ? ` — below floor, lifted by override "${a.override}": ${lifted.join('; ')}` : ''}`)
    }
  }

  const ok = problems.length === 0 && offenders.length === 0
  const head = ok
    ? `SEALABLE — ${arguers.length} arguer(s) meet the standing rules (standing-rules.json) or carry a covering override inside the block.`
    : `REFUSE — ${problems.length ? `${problems.length} run-level problem(s)` : ''}${problems.length && offenders.length ? ' and ' : ''}${offenders.length ? `${offenders.length} of ${arguers.length} arguer(s) break a standing rule` : ''}. Do not seal.`
  return {
    ok, verdict: ok ? 'SEALABLE' : 'REFUSE', offenders, problems,
    detail: [head, ...problems.map(p => `    run: ${p}`), ...lines].join('\n'),
  }
}

// --- fixtures: minimal run files ------------------------------------------------
const runFile = arguerBlocks => `# Points Run: fixture

## Header & Approvals
topic: "fixture topic"
audience_floor: { min_views: 100000, min_comments: 50 }

### Approvals Block (SEALED)
gate_2_approved_at: "2026-09-22T12:00:00Z"
arguers:
${arguerBlocks}
${END}
`

const ARGUER = `  - position: 1
    name: "Speaker One"
    voice: "ai"
    why_in_the_room: "the builder's case that AI hands one person a company's leverage"
    upload_date: "2026-08-06"
    language: "en"
    view_count: 103240
    comment_count: 191
    on_topic_seconds: 1800`

export const FIXTURES = {
  pass: { text: runFile(ARGUER) },
  // must-fail: the same arguer with no `why_in_the_room`
  fail: { text: runFile(ARGUER.replace(/\n\s+why_in_the_room:.*/, '')) },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: run-file-check.mjs <.private/points-runs/<slug>.md> [asOf YYYYMMDD]'); process.exit(2) }
  const { readFileSync } = await import('node:fs')
  const r = run({ text: readFileSync(file, 'utf8'), asOf: process.argv[3] })
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
