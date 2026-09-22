#!/usr/bin/env node
/**
 * candidate-sweep.mjs — the candidate field is filtered by MEASURED METADATA,
 * never by reading titles.
 *
 * WHY THIS EXISTS (measured 2026-09-04, run `ai-power-remedies-c`). The selector
 * reported "every Yudkowsky source with reach predates the recency floor" and
 * swapped the founder's approved arguer out of position 3 on that basis. The
 * statement was FALSE. `1oS35oWWl28` — 785,823 views, 8,700 comments,
 * 2026-03-04, clearing every bar — had already been RETURNED BY THE SEARCH and
 * was discarded unread because its title says "AI Expert" rather than the
 * person's name. Re-running the identical searches and filtering on fetched
 * metadata surfaced SIX qualifying sources. The same defect fired twice more in
 * the same run: a source was chosen without re-running claim-match against the
 * file actually selected, and a second position was declared unfillable with no
 * sweep run at all.
 *
 * The defect is one move: substituting a cheap proxy (the title, the previous
 * verdict, the shape of the URL) for the measurement, then reporting the proxy's
 * answer as a finding. A title is evidence of nothing — uploaders name the
 * episode, not the speaker.
 *
 * SO THE PREDICATE IS ABOUT THE EXCLUSIONS, NOT THE ADMISSIONS. Deciding that a
 * candidate is admissible is already gated downstream (Gate 0, claim match).
 * Nothing anywhere gated the candidates that were silently dropped, which is why
 * this returns REFUSE when any candidate carries no metrics — including, and
 * especially, one already marked excluded. "We never measured it" and "it failed"
 * are different states and only one of them is a finding.
 */
export const id = 'candidate-sweep'

import { RULES, recencyFloors, ymd } from './standing-rules.mjs'

const num = v => (Number.isFinite(v) ? v : null)
const isEnglish = lang => typeof lang === 'string' && /^en(?:$|[-_])/i.test(lang.trim())
const today = () => new Date().toISOString().slice(0, 10).replaceAll('-', '')

/**
 * P1355 C2 — three standing rules moved from prose into this predicate, because
 * Clarity Night #2 showed prose rules are not loaded (English-only was asked
 * again; 6 to 8 results per query were taken against a documented 30):
 *   - every candidate carries `voice: ai | classic | lived`; recency applies per
 *     class and `classic` is exempt (older thinkers are the point of an
 *     "AI + X" evening, and their best talk is rarely recent);
 *   - `language` must be English;
 *   - every query records how many results it REQUESTED, and must request
 *     at least `results_per_query` (standing-rules.json). A query whose search
 *     returned fewer ids than requested is accepted and printed as such.
 * Floors and the recency years come from standing-rules.json when omitted.
 *
 * @param {{
 *   floor?: {minViews:number, minComments:number},  // default: standing-rules.json
 *   asOf?: string,                                   // YYYYMMDD run date; per-voice floors derived from it
 *   recencyFloor?: string,                           // explicit floor for ai/lived voices; overrides asOf
 *   queries: Array<{query: string, requested: number, ids: string[]}>,  // machine-captured, per query
 *   searched?: string[],                             // optional extra ids; unioned with queries[].ids
 *   candidates: Array<{
 *     id: string, title?: string, voice?: 'ai'|'classic'|'lived', language?: string|null,
 *     upload_date?: string|null, view_count?: number|null, comment_count?: number|null,
 *     excluded?: boolean, exclusion_reason?: string|null
 *   }>
 * }} input
 */
export function run(input) {
  const { candidates = [] } = input
  const notes = []

  // A CRASH IS NOT A VERDICT (found 2026-09-04, first real use: the documented
  // input omitted the floors and threw). Since P1355 an OMITTED floor is read
  // from standing-rules.json and said so out loud. A floor that is PRESENT but
  // malformed is still refused — it is a measurement standard someone typed
  // wrong, and silently coercing or replacing it would hide that.
  let floor = input.floor
  if (floor === undefined) {
    floor = { minViews: RULES.floors.min_views, minComments: RULES.floors.min_comments }
    notes.push(`floor from standing-rules.json: views >= ${floor.minViews}, comments >= ${floor.minComments}`)
  }
  const badFloor = !floor || num(floor.minViews) === null || num(floor.minComments) === null
  if (badFloor) {
    return {
      ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [],
      detail: 'REFUSE — no measurement standard supplied: floor {minViews, minComments} is present but not numeric. The floors are what "cleared" and "did not clear" mean; without them this sweep cannot classify anything and no field verdict may rest on it.',
    }
  }
  // A caller may make the floor STRICTER, never weaker (P1355 review: `floor: {minViews: 0}` admitted
  // a zero-view source). The standing rule is the minimum.
  if (floor.minViews < RULES.floors.min_views || floor.minComments < RULES.floors.min_comments) {
    notes.push(`floor raised to standing-rules.json (supplied views >= ${floor.minViews}, comments >= ${floor.minComments} is weaker)`)
    floor = { minViews: Math.max(floor.minViews, RULES.floors.min_views), minComments: Math.max(floor.minComments, RULES.floors.min_comments) }
  }

  let floorsByVoice
  if (input.recencyFloor !== undefined) {
    const f = ymd(input.recencyFloor)
    if (!f) {
      return { ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [], detail: `REFUSE — no measurement standard supplied: recencyFloor "${input.recencyFloor}" is not a YYYYMMDD date.` }
    }
    // Explicit floors may only be stricter than the standing rule as of today (or asOf).
    const std = recencyFloors(input.asOf ?? today())
    floorsByVoice = { ai: f > std.ai ? f : std.ai, lived: f > std.lived ? f : std.lived, classic: null }
    notes.push(`recency floor (explicit ${f}, never looser than standing-rules.json): ai >= ${floorsByVoice.ai}, lived >= ${floorsByVoice.lived}; classic exempt`)
  } else {
    const asOf = input.asOf ?? today()
    floorsByVoice = recencyFloors(asOf)
    if (!floorsByVoice) {
      return { ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [], detail: `REFUSE — no measurement standard supplied: asOf "${input.asOf}" is not a YYYYMMDD date.` }
    }
    notes.push(`recency floors from standing-rules.json as of ${ymd(asOf)}${input.asOf ? '' : ' (asOf defaulted to today)'}: ai >= ${floorsByVoice.ai}, lived >= ${floorsByVoice.lived}, classic exempt`)
  }

  if (!Array.isArray(candidates) || candidates.some(c => !c || typeof c !== 'object' || typeof c.id !== 'string')) {
    return { ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [], detail: 'REFUSE — malformed candidate list: every candidate must be an object with a string id.' }
  }
  if (!candidates.length) {
    return { ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [], detail: 'REFUSE — empty candidate list: a sweep that examined nothing cannot report a field as exhausted.' }
  }

  // THE PER-QUERY RECORD (P1355). The failure it closes: `select.md` documented
  // ytsearch30, and the Clarity Night #2 run took the top 6 to 8 results per
  // query. A flat id list cannot show that; a per-query record of what was
  // REQUESTED can. It cannot prove the ids were machine-captured rather than
  // typed — that limit is the same one the omission check below states.
  const queries = input.queries
  if (!Array.isArray(queries) || queries.length === 0) {
    return {
      ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [],
      detail: `REFUSE — no per-query search record (\`queries: [{query, requested, ids}]\`). Each query must record how many results it requested (at least ${RULES.results_per_query}) and the ids it returned, or the width of the search is unknowable and "the field is exhausted" rests on nothing.`,
    }
  }
  const narrow = []
  const queryLines = []
  for (const q of queries) {
    if (!q || typeof q !== 'object') { narrow.push(`a query record is not an object (${JSON.stringify(q)})`); continue }
    const ids = Array.isArray(q.ids) ? q.ids : null
    const label = q.query ?? '(unnamed query)'
    if (!ids) { narrow.push(`"${label}": no ids array`); continue }
    if (new Set(ids).size !== ids.length) { narrow.push(`"${label}": duplicate ids — a padded record is not a wider search`); continue }
    if (num(q.requested) === null) { narrow.push(`"${label}": requested count not recorded (${ids.length} ids)`); continue }
    if (q.requested < RULES.results_per_query) {
      narrow.push(`"${label}": requested ${q.requested} < ${RULES.results_per_query} (${ids.length} ids)`); continue
    }
    if (ids.length > q.requested) { narrow.push(`"${label}": ${ids.length} ids recorded against ${q.requested} requested — the record contradicts itself`); continue }
    queryLines.push(`    query "${label}": ${ids.length} of ${q.requested} requested${ids.length < q.requested ? ' (the search returned fewer)' : ''}`)
  }
  if (narrow.length) {
    return {
      ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [],
      detail: `REFUSE — ${narrow.length} query record(s) are narrower than the standing rule (${RULES.results_per_query} results per query, standing-rules.json):\n${narrow.map(n => `    ${n}`).join('\n')}`,
    }
  }
  const searched = [...new Set([...queries.flatMap(q => q.ids), ...(Array.isArray(input.searched) ? input.searched : [])])]

  // THE OMISSION HOLE — closed here, and it is the one that actually bit.
  // A candidate present-with-nulls is the LAZY failure. The REAL incident was an
  // id that never entered any tracked list at all: it was read off a search
  // result page and dropped unread, so no file ever mentioned it and nothing
  // downstream could miss it. A predicate that only inspects the array it is
  // handed cannot see that, and reports "Every candidate was measured" over a
  // hand-trimmed list. So the search's OWN OUTPUT is the ground truth, and the
  // candidate set is checked against it. Capture ids mechanically —
  // `yt --flat-playlist --print "%(id)s"` into a file — never by retyping them.
  const present = new Set(candidates.map(c => c.id))
  const dropped = searched.filter(id => !present.has(id))
  if (dropped.length) {
    return {
      ok: false, verdict: 'REFUSE', unmeasured: [], dropped,
      detail: `REFUSE — ${dropped.length} id(s) the search returned never reached the candidate set: ${dropped.join(', ')}. An id dropped before the file was written is indistinguishable from one filtered by its title. Add every returned id, measured, or the "field is exhausted" claim is unsupported.`,
    }
  }

  const badVoice = candidates.filter(c => c.voice !== undefined && c.voice !== null && !RULES.voices.includes(c.voice))
  if (badVoice.length) {
    return {
      ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [],
      detail: `REFUSE — ${badVoice.length} candidate(s) carry a voice outside ${RULES.voices.join(' | ')}: ${badVoice.map(c => `${c.id}="${c.voice}"`).join(', ')}.`,
    }
  }

  // UNMEASURED IS A PROPERTY OF THE VERDICT, NOT OF THE FIELD (refined 2026-09-04,
  // first real run, 150 candidates across 5 positions — epistemic gate 7c: a new
  // gate must let the workflows that already exist through).
  //
  // 20 of 150 candidates carried `comment_count: null` — YouTube simply does not
  // report it when comments are off. Refusing on all of them blocked FOUR of five
  // positions. But 19 of those 20 were ALREADY excluded by a field that WAS
  // measured: the missing number could not have changed their verdict.
  //
  // So refuse on the ONE case that is genuinely unknown — a candidate that clears
  // every floor we could measure and is missing a field that could still exclude
  // it. P1355 applies the same rule to the two new fields: a missing `language`
  // could exclude, and a missing `voice` matters only when the upload is older
  // than the ai/lived floor (then it could be a `classic` voice, which is exempt).
  //
  // This is NOT a relaxed floor. The floors are untouched; a determinately-failing
  // candidate is still reported as a reject, with the missing field named, so the
  // exclusion stays reviewable.
  const classify = c => {
    const failed = []
    const unknown = []
    // null is never compared against a floor — `null < 2000` is true in JS and
    // would report a MISSING number as a FAILING one, which is the exact
    // conflation this file exists to prevent.
    const date = ymd(c.upload_date ?? '')
    if (!date) unknown.push('upload_date')
    else {
      const vf = c.voice ? floorsByVoice[c.voice] : null
      if (c.voice) {
        if (vf && date < vf) failed.push(`stale ${c.voice} voice (${date} < ${vf})`)
      } else {
        // Every candidate carries a voice (P1355 C2). Missing is "unknown" like any unmeasured field:
        // a candidate that fails a measured floor is still a reject; one that clears everything is REFUSE.
        unknown.push('voice (every candidate must be classified ai | classic | lived)')
      }
    }
    if (num(c.view_count) === null) unknown.push('view_count')
    else if (c.view_count < floor.minViews) failed.push(`views ${c.view_count} < ${floor.minViews}`)
    if (num(c.comment_count) === null) unknown.push('comment_count')
    else if (c.comment_count < floor.minComments) failed.push(`comments ${c.comment_count} < ${floor.minComments}`)
    // yt prints `NA` when YouTube leaves the field unset: "not reported", never "not English".
    if (c.language === undefined || c.language === null || /^(|na|none|null)$/i.test(String(c.language).trim())) unknown.push('language')
    else if (!isEnglish(c.language)) failed.push(`language "${c.language}" is not English (standing rule: ${RULES.language} only)`)
    return { id: c.id, title: c.title, voice: c.voice, failed, unknown, admit: failed.length === 0 && unknown.length === 0 }
  }
  const rows = candidates.map(classify)

  const indeterminate = rows.filter(r => r.failed.length === 0 && r.unknown.length > 0)
  if (indeterminate.length) {
    const named = indeterminate.map(r => {
      const c = candidates.find(x => x.id === r.id)
      const how = c.excluded ? `ALREADY MARKED EXCLUDED${c.exclusion_reason ? ` ("${c.exclusion_reason}")` : ''} — ` : ''
      return `    ${r.id}${r.title ? ` — "${r.title}"` : ''}: ${how}missing ${r.unknown.join(', ')} — clears every floor that WAS measured, so the verdict is unknown`
    })
    return {
      ok: false, verdict: 'REFUSE',
      unmeasured: indeterminate.map(r => r.id), dropped: [],
      detail: `REFUSE — ${indeterminate.length} of ${candidates.length} candidate(s) clear every measured floor but carry a missing field that could still exclude them. "Never measured" and "failed" are different states, and a title is not a metric. Resolve these before any field verdict:\n${named.join('\n')}`,
    }
  }

  const admitted = rows.filter(r => r.admit)
  const lines = rows
    .sort((a, b) => Number(b.admit) - Number(a.admit))
    .map(r => {
      const v = r.voice ? ` [${r.voice}]` : ''
      if (r.admit) return `    ADMIT  ${r.id}${v}${r.title ? ` — "${r.title}"` : ''}`
      const missing = r.unknown.map(u => `${u.split(' ')[0]} not reported`)
      return `    reject ${r.id}${v}${r.title ? ` — "${r.title}"` : ''}: ${[...r.failed, ...missing].join('; ')}`
    })

  const verdict = admitted.length ? 'FIELD-NON-EMPTY' : 'FIELD-EMPTY'
  return {
    ok: true,
    verdict,
    admitted: admitted.map(r => r.id), dropped: [], unmeasured: [],
    detail: `${verdict} — ${admitted.length} of ${candidates.length} candidate(s) clear the floors, the recency line for their voice, and the language rule. Every candidate was measured.\n    standard: ${notes.join('; ')}\n${queryLines.join('\n')}\n${lines.join('\n')}`,
  }
}

// Fixture helper: a real query records 30 requested. The ids listed are the
// search's own output, so a query that returned fewer is recorded as fewer.
const q = (query, ids) => ({ query, requested: 30, ids })

export const FIXTURES = {
  // must-pass: every candidate measured; the field is correctly reported non-empty
  pass: {
    floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127',
    queries: [q('yudkowsky ai risk', ['1oS35oWWl28', 'nRvAt4H7d7E'])],
    candidates: [
      { id: '1oS35oWWl28', title: 'AI Expert Tells Bernie: "The Humans will be Discarded"', voice: 'ai', language: 'en', upload_date: '20260304', view_count: 785823, comment_count: 8700 },
      { id: 'nRvAt4H7d7E', title: 'Why Superhuman AI Would Kill Us All', voice: 'ai', language: 'en', upload_date: '20251025', view_count: 296423, comment_count: 1900 },
    ],
  },
  // must-fail: the real defect — a candidate set aside on its TITLE, never measured
  fail: {
    floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127',
    queries: [q('yudkowsky ai risk', ['nRvAt4H7d7E', '1oS35oWWl28'])],
    candidates: [
      { id: 'nRvAt4H7d7E', title: 'Why Superhuman AI Would Kill Us All', voice: 'ai', language: 'en', upload_date: '20251025', view_count: 296423, comment_count: 1900 },
      { id: '1oS35oWWl28', title: 'AI Expert Tells Bernie: "The Humans will be Discarded"', excluded: true, exclusion_reason: "title does not carry the arguer's name" },
    ],
  },
  // the ACTUAL incident shape: the qualifying id never reached the file at all
  omitted: {
    floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127',
    queries: [q('yudkowsky ai risk', ['nRvAt4H7d7E', '1oS35oWWl28'])],
    candidates: [
      { id: 'nRvAt4H7d7E', title: 'Why Superhuman AI Would Kill Us All', voice: 'ai', language: 'en', upload_date: '20251025', view_count: 296423, comment_count: 1900 },
    ],
  },
  // P1355 must-fail: an AI voice older than the standing rule's 2 years
  staleAi: {
    asOf: '20260922',
    queries: [q('harari ai meaning', ['aiOld000001'])],
    candidates: [{ id: 'aiOld000001', voice: 'ai', language: 'en', upload_date: '20230105', view_count: 2500000, comment_count: 9000 }],
  },
  // P1355 must-fail: a non-English source, however popular
  nonEnglish: {
    asOf: '20260922',
    queries: [q('ikigai ai', ['deSource001'])],
    candidates: [{ id: 'deSource001', voice: 'lived', language: 'de', upload_date: '20260301', view_count: 400000, comment_count: 800 }],
  },
  // P1355 must-fail: the Clarity Night #2 shape — the top 7 results, not 30
  sevenIdQuery: {
    asOf: '20260922',
    queries: [{ query: 'naval happiness', requested: 7, ids: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'] }],
    candidates: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'].map(id => ({ id, voice: 'classic', language: 'en', upload_date: '20240101', view_count: 500000, comment_count: 900 })),
  },
  // P1355 mixed field: a stale AI voice fails, an old classic passes (Watts, 2022)
  mixedVoices: {
    asOf: '20260922',
    queries: [q('meaning of work', ['staleAi0001', 'dx4yW0mjezw'])],
    candidates: [
      { id: 'staleAi0001', voice: 'ai', language: 'en', upload_date: '20231010', view_count: 900000, comment_count: 4000 },
      { id: 'dx4yW0mjezw', title: 'The Benefit of Living With No Purpose', voice: 'classic', language: 'en', upload_date: '20220816', view_count: 1752705, comment_count: 3000 },
    ],
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: candidate-sweep.mjs <candidates.json>'); process.exit(2) }
  const { readFileSync } = await import('node:fs')
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
