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

const num = v => (Number.isFinite(v) ? v : null)

/**
 * @param {{
 *   floor: {minViews:number, minComments:number},
 *   recencyFloor: string,                       // YYYYMMDD, inclusive
 *   searched: string[],                         // EVERY id the search returned, machine-captured
 *   candidates: Array<{
 *     id: string, title?: string,
 *     upload_date?: string|null, view_count?: number|null, comment_count?: number|null,
 *     excluded?: boolean, exclusion_reason?: string|null
 *   }>
 * }} input
 */
export function run(input) {
  const { floor, recencyFloor, searched, candidates = [] } = input
  if (!candidates.length) {
    return { ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [], detail: 'REFUSE — empty candidate list: a sweep that examined nothing cannot report a field as exhausted.' }
  }

  // THE OMISSION HOLE — closed here, and it is the one that actually bit.
  // A candidate present-with-nulls is the LAZY failure. The REAL incident was an
  // id that never entered any tracked list at all: it was read off a search
  // result page and dropped unread, so no file ever mentioned it and nothing
  // downstream could miss it. A predicate that only inspects the array it is
  // handed cannot see that, and reports "Every candidate was measured" over a
  // hand-trimmed list. So the search's OWN OUTPUT is the ground truth, and the
  // candidate set is checked against it. Capture `searched` mechanically —
  // `yt --flat-playlist --print "%(id)s"` into a file — never by retyping ids.
  if (!Array.isArray(searched)) {
    return {
      ok: false, verdict: 'REFUSE', unmeasured: [], dropped: [],
      detail: 'REFUSE — no `searched` list supplied. The sweep cannot confirm the candidate set covers what the search returned, which is the exact hole this predicate exists to close. Capture the raw id list from the search and pass it.',
    }
  }
  const present = new Set(candidates.map(c => c.id))
  const dropped = searched.filter(id => !present.has(id))
  if (dropped.length) {
    return {
      ok: false, verdict: 'REFUSE', unmeasured: [], dropped,
      detail: `REFUSE — ${dropped.length} id(s) the search returned never reached the candidate set: ${dropped.join(', ')}. An id dropped before the file was written is indistinguishable from one filtered by its title. Add every returned id, measured, or the "field is exhausted" claim is unsupported.`,
    }
  }

  // An unmeasured candidate is the defect this module exists to catch.
  const unmeasured = candidates.filter(c =>
    !c.upload_date || num(c.view_count) === null || num(c.comment_count) === null)

  if (unmeasured.length) {
    const named = unmeasured.map(c => {
      const missing = [
        !c.upload_date ? 'upload_date' : null,
        num(c.view_count) === null ? 'view_count' : null,
        num(c.comment_count) === null ? 'comment_count' : null,
      ].filter(Boolean).join(', ')
      const how = c.excluded ? `ALREADY MARKED EXCLUDED${c.exclusion_reason ? ` ("${c.exclusion_reason}")` : ''} — ` : ''
      return `    ${c.id}${c.title ? ` — "${c.title}"` : ''}: ${how}missing ${missing}`
    })
    return {
      ok: false, verdict: 'REFUSE',
      unmeasured: unmeasured.map(c => c.id), dropped: [],
      detail: `REFUSE — ${unmeasured.length} of ${candidates.length} candidate(s) carry no measurement. Fetch metadata for EVERY candidate before setting any aside; a title is not a metric:\n${named.join('\n')}`,
    }
  }

  const classify = c => {
    const failed = []
    if (c.upload_date < recencyFloor) failed.push(`stale (${c.upload_date} < ${recencyFloor})`)
    if (c.view_count < floor.minViews) failed.push(`views ${c.view_count} < ${floor.minViews}`)
    if (c.comment_count < floor.minComments) failed.push(`comments ${c.comment_count} < ${floor.minComments}`)
    return { id: c.id, title: c.title, admit: failed.length === 0, failed }
  }
  const rows = candidates.map(classify)
  const admitted = rows.filter(r => r.admit)

  const lines = rows
    .sort((a, b) => Number(b.admit) - Number(a.admit))
    .map(r => r.admit
      ? `    ADMIT  ${r.id}${r.title ? ` — "${r.title}"` : ''}`
      : `    reject ${r.id}${r.title ? ` — "${r.title}"` : ''}: ${r.failed.join('; ')}`)

  return {
    ok: true,
    verdict: admitted.length ? 'FIELD-NON-EMPTY' : 'FIELD-EMPTY',
    admitted: admitted.map(r => r.id), dropped: [], unmeasured: [],
    detail: `${admitted.length ? 'FIELD-NON-EMPTY' : 'FIELD-EMPTY'} — ${admitted.length} of ${candidates.length} candidate(s) clear both floors and the recency line. Every candidate was measured.\n${lines.join('\n')}`,
  }
}

export const FIXTURES = {
  // must-pass: every candidate measured; the field is correctly reported non-empty
  pass: {
    floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127',
    searched: ['1oS35oWWl28', 'nRvAt4H7d7E'],
    candidates: [
      { id: '1oS35oWWl28', title: 'AI Expert Tells Bernie: "The Humans will be Discarded"', upload_date: '20260304', view_count: 785823, comment_count: 8700 },
      { id: 'nRvAt4H7d7E', title: 'Why Superhuman AI Would Kill Us All', upload_date: '20251025', view_count: 296423, comment_count: 1900 },
    ],
  },
  // must-fail: the real defect — a candidate set aside on its TITLE, never measured
  fail: {
    floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127',
    searched: ['nRvAt4H7d7E', '1oS35oWWl28'],
    candidates: [
      { id: 'nRvAt4H7d7E', title: 'Why Superhuman AI Would Kill Us All', upload_date: '20251025', view_count: 296423, comment_count: 1900 },
      { id: '1oS35oWWl28', title: 'AI Expert Tells Bernie: "The Humans will be Discarded"', excluded: true, exclusion_reason: "title does not carry the arguer's name" },
    ],
  },
  // the ACTUAL incident shape: the qualifying id never reached the file at all
  omitted: {
    floor: { minViews: 2000, minComments: 50 }, recencyFloor: '20251127',
    searched: ['nRvAt4H7d7E', '1oS35oWWl28'],
    candidates: [
      { id: 'nRvAt4H7d7E', title: 'Why Superhuman AI Would Kill Us All', upload_date: '20251025', view_count: 296423, comment_count: 1900 },
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
