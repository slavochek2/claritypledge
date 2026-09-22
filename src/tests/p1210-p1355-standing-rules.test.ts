/**
 * P1355 — the disagreement pipeline's standing rules, moved from prose into the
 * predicates the gates already run (C1 standing-rules.json, C2 candidate-sweep,
 * C3 on-topic-minutes, C4 run-file-check, C5 redact-run).
 *
 * Incident this pins (Clarity Night #2, 2026-09-22): the founder had to repeat
 * rules that were already written down — English-only, 30 results per query —
 * because nothing loaded them, and one source's minutes on topic were read by
 * eye as 7, 3 and 1.5 in the same run.
 *
 * Prefixed p1210- so two-callers.mjs counts these imports (its test glob).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RULES, recencyFloors, parseOverride } from '../../scripts/points/standing-rules.mjs'
import { run as sweep, FIXTURES as SWEEP } from '../../scripts/points/candidate-sweep.mjs'
import { run as minutes, FIXTURES as MIN, parseVtt } from '../../scripts/points/on-topic-minutes.mjs'
import { run as runFileCheck, FIXTURES as RFC, parseRunFile } from '../../scripts/points/run-file-check.mjs'
import { parseRun } from '../../scripts/points/redact-run.mjs'
import { run as rulePresent, REPO_ROOT } from '../../scripts/points/rule-present.mjs'

describe('C1 — standing-rules.json is the one machine source', () => {
  it('carries the founder-decided values (P1355 Decided table, rules 1, 3, 4, 5)', () => {
    expect(RULES.floors).toEqual({ min_views: 100000, min_comments: 50 })
    expect(RULES.recency_years.ai).toBe(2)
    expect(RULES.recency_years.classic).toBeNull()
    expect(RULES.min_on_topic_seconds).toBe(300)
    expect(RULES.language).toBe('en')
    expect(RULES.results_per_query).toBe(30)
  })

  it('recency floors are derived per voice from the run date; classic has none', () => {
    expect(recencyFloors('2026-09-22')).toEqual({ ai: '20240922', lived: '20240922', classic: null })
    // 29 Feb minus two years is not a date; the day before is the honest floor
    expect(recencyFloors('20280229')?.ai).toBe('20260228')
    expect(recencyFloors('not a date')).toBeNull()
  })

  it('an override carries one reason from the fixed list; founder-named needs the founder\'s words', () => {
    expect(parseOverride('recognisable-figure-low-video-reach').ok).toBe(true)
    expect(parseOverride('founder-named: "keep him, he is the point"').ok).toBe(true)
    expect(parseOverride('founder-named').ok).toBe(false)
    expect(parseOverride('founder-seeded, recorded at Gate 2').ok).toBe(false)
  })
})

describe('C2 — candidate-sweep enforces voice-aware recency, English, and the 30-per-query width', () => {
  it('MUST-FAIL: an AI voice older than 2 years is rejected, however popular', () => {
    const r = sweep(SWEEP.staleAi)
    expect(r.admitted).toEqual([])
    expect(r.detail).toMatch(/stale ai voice \(20230105 < 20240922\)/)
  })

  it('MUST-FAIL: a non-English source is rejected', () => {
    const r = sweep(SWEEP.nonEnglish)
    expect(r.admitted).toEqual([])
    expect(r.detail).toMatch(/language "de" is not English/)
  })

  it('MUST-FAIL: a query that asked for 7 results (the Clarity Night #2 shape) is REFUSED', () => {
    const r = sweep(SWEEP.sevenIdQuery)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toContain('requested 7 < 30')
  })

  it('mixed field: the stale AI voice fails and the old classic passes', () => {
    const r = sweep(SWEEP.mixedVoices)
    expect(r.admitted).toEqual(['dx4yW0mjezw'])
    expect(r.detail).toMatch(/reject staleAi0001 \[ai\]: stale ai voice/)
  })

  it('a query that requested 30 and returned 12 is accepted and printed as such', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `id${i}`)
    const r = sweep({
      asOf: '20260922', queries: [{ query: 'q', requested: 30, ids }],
      candidates: ids.map(id => ({ id, voice: 'ai', language: 'en-US', upload_date: '20260101', view_count: 200000, comment_count: 80 })),
    })
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('12 of 30 requested (the search returned fewer)')
  })

  it('a record claiming more ids than it requested contradicts itself and is REFUSED', () => {
    const r = sweep({ asOf: '20260922', queries: [{ query: 'q', requested: 30, ids: Array.from({ length: 31 }, (_, i) => `x${i}`) }], candidates: [] })
    expect(r.verdict).toBe('REFUSE')
  })

  it('an old upload with no voice is indeterminate — it could be an exempt classic — so REFUSE', () => {
    const r = sweep({
      asOf: '20260922', queries: [{ query: 'q', requested: 30, ids: ['old'] }],
      candidates: [{ id: 'old', language: 'en', upload_date: '20200101', view_count: 900000, comment_count: 900 }],
    })
    expect(r.verdict).toBe('REFUSE')
    expect(r.unmeasured).toEqual(['old'])
    expect(r.detail).toMatch(/every candidate must be classified/)
  })

  it('review fix: every candidate carries a voice — a recent one without it is REFUSED too (Codex 2)', () => {
    const r = sweep({
      asOf: '20260922', queries: [{ query: 'q', requested: 30, ids: ['new'] }],
      candidates: [{ id: 'new', language: 'en', upload_date: '20260601', view_count: 900000, comment_count: 900 }],
    })
    expect(r.verdict).toBe('REFUSE')
  })

  it('review fix: a supplied floor or recency line can only be STRICTER (Opus M8, Codex 4)', () => {
    const r = sweep({
      floor: { minViews: 0, minComments: 0 }, recencyFloor: '19000101', asOf: '20260922',
      queries: [{ query: 'q', requested: 30, ids: ['z'] }],
      candidates: [{ id: 'z', voice: 'ai', language: 'en', upload_date: '20190101', view_count: 500, comment_count: 0 }],
    })
    expect(r.admitted).toEqual([])
    expect(r.detail).toContain('floor raised to standing-rules.json')
  })

  it('review fix: malformed and padded query records are refused, never thrown on (Codex 7, 1)', () => {
    expect(sweep({ asOf: '20260922', queries: [null], candidates: [{ id: 'a' }] } as never).verdict).toBe('REFUSE')
    expect(sweep({ asOf: '20260922', queries: [{ query: 'q', requested: 30, ids: ['a', 'a'] }], candidates: [{ id: 'a' }] } as never).verdict).toBe('REFUSE')
  })

  it('review fix: impossible dates are not dates (Codex 3)', () => {
    const r = sweep({ asOf: '0000-00-00', queries: [{ query: 'q', requested: 30, ids: ['a'] }], candidates: [{ id: 'a' }] } as never)
    expect(r.verdict).toBe('REFUSE')
  })

  it('a candidate clearing everything with no language is REFUSED — never measured is not English', () => {
    const r = sweep({
      asOf: '20260922', queries: [{ query: 'q', requested: 30, ids: ['nolang'] }],
      candidates: [{ id: 'nolang', voice: 'ai', upload_date: '20260601', view_count: 900000, comment_count: 900 }],
    })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/missing language/)
  })

  it('a voice outside ai | classic | lived is REFUSED, not guessed', () => {
    const r = sweep({
      asOf: '20260922', queries: [{ query: 'q', requested: 30, ids: ['v'] }],
      candidates: [{ id: 'v', voice: 'expert', language: 'en', upload_date: '20260601', view_count: 900000, comment_count: 900 }],
    } as never)
    expect(r.verdict).toBe('REFUSE')
  })
})

describe('C3 — on-topic-minutes counts the arguer\'s own speech, reproducibly', () => {
  it('MUST-PASS: the guest\'s on-topic speech clears 300s; the host\'s "meaning" counts for nothing', () => {
    const r = minutes(MIN.pass)
    expect(r.ok).toBe(true)
    expect(r.on_topic_seconds).toBe(340)
  })

  it('touching ranges never lend each other a term hit (found by the must-pass fixture itself)', () => {
    const r = minutes(MIN.pass)
    const rates = r.ranges.find(x => x.start === 230)!
    expect(rates.status).toBe('NO-TERM-HIT')
    expect(rates.counted_seconds).toBe(0)
  })

  it('MUST-FAIL: unlabelled multi-speaker speech is REFUSED, never counted', () => {
    const r = minutes(MIN.fail)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REFUSE')
    expect(r.on_topic_seconds).toBeNull()
    expect(r.detail).toMatch(/carry no speaker label/)
  })

  it('reproducible: the same input returns the same number, twice', () => {
    expect(minutes(MIN.pass)).toEqual(minutes(MIN.pass))
  })

  it('a label mapped to the arguer that never speaks in the window is a wrong mapping — REFUSE', () => {
    const w = { ...MIN.pass.windows[0], speaker: 'spk:7' }
    expect(minutes({ ...MIN.pass, windows: [w] }).verdict).toBe('REFUSE')
  })

  it('sensitive passages are subtracted, never used to exclude the source (S2)', () => {
    const r = minutes({ ...MIN.pass, sensitive: [[0, 100]] })
    expect(r.on_topic_seconds).toBe(260)
    expect(r.excluded_sensitive_seconds).toBe(80)
  })

  it('single-speaker captions: rolling duplicates are a union, not a sum', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:02:00.000
my purpose was never my job title

00:00:01.000 --> 00:02:01.000
my purpose was never my job title

00:02:01.000 --> 00:05:30.000
and meaning is something you build yourself
`
    const r = minutes({ basis: 'single-speaker', cues: parseVtt(vtt), ranges: [[0, 330]], terms: ['purpose', 'meaning'] })
    expect(r.on_topic_seconds).toBe(330)
    expect(r.ok).toBe(true)
  })

  it('a "single-speaker" track with a turn marker inside a range contradicts its basis — REFUSE', () => {
    const cues = [{ start: 0, end: 400, text: 'purpose is built &gt;&gt; so what about money' }]
    const r = minutes({ basis: 'single-speaker', cues, ranges: [[0, 400]], terms: ['purpose'] })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/turn marker/)
  })

  it('review fix: a range bounds the count, it never supplies it (Opus H1)', () => {
    // One hit at the start of a 40-minute range used to count all 40 minutes.
    const turns = [{ start: 0, end: 20, speaker: 'spk:1', text: 'my purpose matters' },
      ...Array.from({ length: 39 }, (_, i) => ({ start: 60 * (i + 1), end: 60 * (i + 1) + 55, speaker: 'spk:1', text: 'interest rates and inflation' }))]
    const r = minutes({ basis: 'speaker-labelled', windows: [{ speaker: 'spk:1', start: 0, duration: 2400, turns }], ranges: [[0, 2400]], terms: ['purpose'] })
    expect(r.on_topic_seconds).toBeLessThan(100)
    expect(r.ok).toBe(false)
  })

  it('review fix: wildcard or 2-letter terms, and unexplained label merges, are REFUSED (Opus H1, Codex 5)', () => {
    expect(minutes({ ...MIN.pass, terms: ['*'] }).verdict).toBe('REFUSE')
    expect(minutes({ ...MIN.pass, terms: ['AI'] }).verdict).toBe('REFUSE')
    const merged = { ...MIN.pass.windows[0], speaker: ['spk:0', 'spk:1'] }
    expect(minutes({ ...MIN.pass, windows: [merged] }).verdict).toBe('REFUSE')
    expect(minutes({ ...MIN.pass, windows: [{ ...merged, mapping_evidence: 'spk:0 and spk:1 both answer as the guest' }] }).verdict).not.toBe('REFUSE')
  })

  it('review fix: minSeconds can raise the floor, never lower it (Codex 4)', () => {
    expect(minutes({ ...MIN.pass, minSeconds: 0 }).min_seconds).toBe(300)
  })

  it('no terms, no ranges, or an unknown basis is REFUSE', () => {
    expect(minutes({ ...MIN.pass, terms: [] }).verdict).toBe('REFUSE')
    expect(minutes({ ...MIN.pass, ranges: [] }).verdict).toBe('REFUSE')
    expect(minutes({ ...MIN.pass, basis: 'turn-inferred' } as never).verdict).toBe('REFUSE')
  })
})

// A minimal run file whose approvals block holds the given arguer blocks.
const runFile = (arguers: string, floor = '{ min_views: 100000, min_comments: 50 }', extraHeader = '') => `# Points Run: t

## Header & Approvals
topic: "t"
audience_floor: ${floor}
${extraHeader}
### Approvals Block (SEALED)
gate_2_approved_at: "2026-09-22T12:00:00Z"
arguers:
${arguers}
<!-- end-approvals-block -->

## Points & Predictions
`
const arguer = (fields: Record<string, string | number>) =>
  '  - position: 1\n' + Object.entries(fields).map(([k, v]) => `    ${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`).join('\n')
const good = { name: 'A', voice: 'ai', why_in_the_room: 'why', upload_date: '2026-08-06', language: 'en', view_count: 150000, comment_count: 200, on_topic_seconds: 600, on_topic_input: 'm/p1.json' }
// What the CLI's re-run of on-topic-minutes.mjs returns for an input file (C4 compares against it).
const measured = (seconds: number, file = 'm/p1.json', basis = 'single-speaker') =>
  ({ [file]: { result: { verdict: seconds >= 300 ? 'CLEARS' : 'BELOW-FLOOR', on_topic_seconds: seconds, basis, detail: '' } } })
const check = (text: string, seconds = 600, extra: object = {}) => runFileCheck({ text, measured: measured(seconds), ...extra })

describe('C4 — run-file-check refuses an approvals block that breaks a standing rule', () => {
  it('MUST-PASS / MUST-FAIL fixtures (missing why_in_the_room)', () => {
    expect(runFileCheck(RFC.pass).verdict).toBe('SEALABLE')
    const r = runFileCheck(RFC.fail)
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toContain('missing why_in_the_room')
  })

  it('a below-floor arguer without an override is REFUSED; a covering override inside the block lifts it', () => {
    const low = { ...good, view_count: 8927 }
    expect(check(runFile(arguer(low))).detail).toMatch(/views 8927 < 100000 and no override covers it/)
    const lifted = check(runFile(arguer({ ...low, override: 'recognisable-figure-low-video-reach' })))
    expect(lifted.verdict).toBe('SEALABLE')
    expect(lifted.detail).toContain('lifted by override')
  })

  it('an override OUTSIDE the sealed block is ignored — the header is editable after Gate 2', () => {
    const low = { ...good, view_count: 8927 }
    const r = check(runFile(arguer(low), undefined, 'override: "recognisable-figure-low-video-reach"\n'))
    expect(r.verdict).toBe('REFUSE')
  })

  it('an override whose reason does not cover the failing floor does not lift it', () => {
    const r = check(runFile(arguer({ ...good, on_topic_seconds: 90, override: 'recognisable-figure-low-video-reach' })), 90)
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/on topic 90s < 300s and no override covers it/)
  })

  it('an override with an unlisted reason, or founder-named without words, is REFUSED', () => {
    expect(check(runFile(arguer({ ...good, view_count: 10, override: 'founder-seeded' }))).verdict).toBe('REFUSE')
    expect(check(runFile(arguer({ ...good, view_count: 10, override: 'founder-named' }))).verdict).toBe('REFUSE')
  })

  it('a non-English source is never overridable', () => {
    const r = check(runFile(arguer({ ...good, language: 'th', override: 'founder-named: "keep it"' })))
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/never overridable/)
  })

  it('a header floor lower than standing-rules.json is REFUSED — floors are not relaxed in the header', () => {
    const r = check(runFile(arguer(good), '{ min_views: 2000, min_comments: 50 }'))
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/LOWER than standing-rules.json/)
  })

  it('a stale ai voice is REFUSED; the same upload date on a classic voice passes', () => {
    expect(check(runFile(arguer({ ...good, upload_date: '2022-08-16' }))).verdict).toBe('REFUSE')
    expect(check(runFile(arguer({ ...good, voice: 'classic', classic_basis: 'died 1973', upload_date: '2022-08-16' }))).verdict).toBe('SEALABLE')
  })

  it('review fix: a typed on_topic_seconds that the re-run does not reproduce is REFUSED (Opus H2, Codex 6)', () => {
    expect(check(runFile(arguer(good)), 120).detail).toMatch(/on_topic_seconds 600 but re-running m\/p1.json gives 120/)
    expect(runFileCheck({ text: runFile(arguer(good)) }).detail).toMatch(/was not re-derived/)
    const { on_topic_input: _drop, ...noInput } = good
    expect(check(runFile(arguer(noInput))).detail).toMatch(/missing on_topic_input/)
  })

  it('review fix: whitespace is not a why_in_the_room; classic needs a basis; one person once (Codex 6, Opus M5, rule 2)', () => {
    expect(check(runFile(arguer({ ...good, why_in_the_room: ' ' }))).detail).toMatch(/missing why_in_the_room/)
    expect(check(runFile(arguer({ ...good, voice: 'classic' }))).detail).toMatch(/no classic_basis/)
    const two = arguer(good) + '\n' + arguer(good).replace('position: 1', 'position: 2')
    expect(check(runFile(two)).detail).toMatch(/two arguers share name "A"/)
  })

  it('review fix: minutes measured on a basis that contradicts gate_0_basis are REFUSED (Opus M2)', () => {
    const r = runFileCheck({ text: runFile(arguer({ ...good, gate_0_basis: 'speaker-labelled' })), measured: measured(600, 'm/p1.json', 'single-speaker') })
    expect(r.detail).toMatch(/measured as single-speaker but gate_0_basis is speaker-labelled/)
  })

  it('review fix: founder-named needs at least three quoted words (Opus M4)', () => {
    expect(check(runFile(arguer({ ...good, view_count: 10, override: 'founder-named: ok' }))).verdict).toBe('REFUSE')
    expect(check(runFile(arguer({ ...good, view_count: 10, override: 'founder-named: "keep him, he is the point"' }))).verdict).toBe('SEALABLE')
  })

  it('review fix: the schema doc\'s `arguers:   # comment` line still parses (Gemini finding 1)', () => {
    const text = runFile(arguer(good)).replace('arguers:\n', 'arguers:                              # REPEATABLE, 2..6 entries\n')
    expect(check(text).verdict).toBe('SEALABLE')
  })

  it('the REAL documented run-file template parses — built from docs/points-process.md, not a copy (gate 7d)', () => {
    // A hand-copied template line stays green when the doc changes; reading the doc does not.
    const doc = readFileSync(path.join(REPO_ROOT, 'docs/points-process.md'), 'utf8')
    const start = doc.indexOf('### Schema Format')
    const fence = doc.indexOf('```markdown', start)
    const template = doc.slice(fence + '```markdown'.length, doc.indexOf('\n```\n', fence))
    expect(template).toContain('<!-- end-approvals-block -->')
    const parsed = parseRunFile(template)
    expect(parsed).not.toBeNull()
    expect(parsed!.arguers.length).toBeGreaterThanOrEqual(2)
    // every field run-file-check requires is spelled in the template the way the parser reads it
    for (const k of ['voice', 'why_in_the_room', 'on_topic_seconds', 'on_topic_input', 'upload_date', 'language']) {
      expect(parsed!.arguers[0], k).toHaveProperty(k)
    }
  })

  it('review fix: yt\'s `NA` language is "not reported", never "not English"', () => {
    const r = check(runFile(arguer({ ...good, language: 'NA' })))
    expect(r.detail).toContain('missing language')
    expect(r.detail).not.toMatch(/not English/)
    const s = sweep({ asOf: '20260922', queries: [{ query: 'q', requested: 30, ids: ['na'] }],
      candidates: [{ id: 'na', voice: 'ai', language: 'NA', upload_date: '20260601', view_count: 900000, comment_count: 900 }] })
    expect(s.verdict).toBe('REFUSE')
    expect(s.detail).toMatch(/missing language/)
  })

  it('no run date (no gate_2_approved_at, no asOf) is REFUSE', () => {
    const text = runFile(arguer(good)).replace(/gate_2_approved_at:.*\n/, '')
    expect(check(text).verdict).toBe('REFUSE')
  })
})

describe('C5 — redact-run refuses a missing audience_floor instead of deriving 0', () => {
  it('throws, naming the mandatory header', () => {
    expect(() => parseRun('# Points Run: x\n\n### Filed quotes\n')).toThrow(/audience_floor/)
  })
})

/**
 * REPLAY CONTROL (P1355 Done-When). The founder-approved casts of Clarity Nights
 * #1 and #2, re-run through C2 and C4 with standing-rules.json's values. Metrics
 * are the ones recorded in each run's private files (public YouTube numbers).
 */
describe('Replay: events #1 and #2 through the new predicates', () => {
  // Event #1 (ai-power-remedies-d), the four approved sources.
  const EVENT1 = [
    { id: 'MWMe7yjPYpE', name: 'Yann LeCun', upload_date: '20260128', view_count: 166281, comment_count: 599 },
    { id: '_-CuF1likvw', name: 'Yoshua Bengio', upload_date: '20260508', view_count: 79388, comment_count: 517 },
    { id: 'rf2KFVcKQdQ', name: 'Connor Leahy', upload_date: '20260310', view_count: 1561723, comment_count: 8300 },
    { id: 'hqx4zk54Q6g', name: 'Bernie Sanders', upload_date: '20260622', view_count: 8927, comment_count: 203 },
  ]

  it('event #1 through C2: 2 admitted, 2 below the 100k floor', () => {
    const r = sweep({
      asOf: '20260907',
      queries: [{ query: 'event #1 approved set', requested: 30, ids: EVENT1.map(e => e.id) }],
      candidates: EVENT1.map(e => ({ ...e, voice: 'ai', language: 'en' })),
    })
    console.log('[replay event #1, C2]\n' + r.detail)
    expect([...(r.admitted ?? [])].sort()).toEqual(['MWMe7yjPYpE', 'rf2KFVcKQdQ'])
    expect(r.detail).toMatch(/reject _-CuF1likvw .*views 79388 < 100000/)
    expect(r.detail).toMatch(/reject hqx4zk54Q6g .*views 8927 < 100000/)
  })

  // Event #1 recorded no on-topic minutes; 600s is a stand-in so this row isolates the FLOORS.
  const e1Block = (withOverride: boolean) => EVENT1.map((e, i) =>
    `  - position: ${i + 1}\n    name: "${e.name}"\n    voice: "ai"\n    why_in_the_room: "recorded"\n    upload_date: "${e.upload_date}"\n    language: "en"\n` +
    `    view_count: ${e.view_count}\n    comment_count: ${e.comment_count}\n    on_topic_seconds: 600\n    on_topic_input: "m/e1-${i + 1}.json"` +
    (withOverride && e.view_count < 100000 ? '\n    override: "recognisable-figure-low-video-reach"' : '')).join('\n')

  it('event #1 through C4: exactly Bengio and Sanders need the recognisable-figure override, and it suffices', () => {
    // Event #1 recorded no minutes: the stand-in measurement returns the same 600s for each input.
    const e1Measured = Object.assign({}, ...EVENT1.map((_, i) => measured(600, `m/e1-${i + 1}.json`)))
    const without = runFileCheck({ text: runFile(e1Block(false)), asOf: '20260907', measured: e1Measured })
    console.log('[replay event #1, C4 without overrides]\n' + without.detail)
    expect(without.offenders).toEqual(['position 2 (Yoshua Bengio)', 'position 4 (Bernie Sanders)'])
    const withO = runFileCheck({ text: runFile(e1Block(true)), asOf: '20260907', measured: e1Measured })
    console.log('[replay event #1, C4 with overrides]\n' + withO.detail)
    expect(withO.verdict).toBe('SEALABLE')
  })

  it('event #2 through C2 and C4: the famous name fails on minutes; the older thinker passes despite a 2022 upload', () => {
    const s = sweep({
      asOf: '20260922',
      queries: [{ query: 'event #2 approved set', requested: 30, ids: ['FNZhxTtOL-I', 'dx4yW0mjezw'] }],
      candidates: [
        { id: 'FNZhxTtOL-I', voice: 'ai', language: 'en', upload_date: '20260826', view_count: 1553479, comment_count: 1100 },
        { id: 'dx4yW0mjezw', voice: 'classic', language: 'en', upload_date: '20220816', view_count: 1752705, comment_count: 3000 },
      ],
    })
    console.log('[replay event #2, C2]\n' + s.detail)
    // Reach and recency do not reject either one: Harari's problem is minutes, not views.
    expect([...(s.admitted ?? [])].sort()).toEqual(['FNZhxTtOL-I', 'dx4yW0mjezw'])

    // Harari: 92.6s is the C3 measurement over the stored diarization (two windows,
    // sensitive passage subtracted). Watts: 840s is the recorded single-speaker
    // estimate (the whole 14-minute lecture), NOT a C3 measurement.
    const block =
      '  - position: 1\n    name: "Yuval Noah Harari"\n    voice: "ai"\n    why_in_the_room: "recorded"\n    upload_date: "2026-08-26"\n    language: "en"\n    view_count: 1553479\n    comment_count: 1100\n    on_topic_seconds: 92.6\n    on_topic_input: "m/harari.json"\n    gate_0_basis: "speaker-labelled"\n' +
      '  - position: 2\n    name: "Alan Watts"\n    voice: "classic"\n    why_in_the_room: "recorded"\n    upload_date: "2022-08-16"\n    language: "en"\n    view_count: 1752705\n    comment_count: 3000\n    on_topic_seconds: 840\n    on_topic_input: "m/watts.json"\n    classic_basis: "philosopher, died 1973: predates the AI debate"'
    // Harari's 92.6s is a real C3 result on the stored diarization; Watts' 840s is a stand-in for the
    // recorded single-speaker estimate. The replay tests floors, recency and the minutes floor, not C3.
    const r = runFileCheck({ text: runFile(block), asOf: '20260922', measured: {
      ...measured(92.6, 'm/harari.json', 'speaker-labelled'), ...measured(840, 'm/watts.json') } })
    console.log('[replay event #2, C4]\n' + r.detail)
    expect(r.offenders).toEqual(['position 1 (Yuval Noah Harari)'])
    expect(r.detail).toMatch(/Harari\): REFUSE — on topic 92.6s < 300s/)
    expect(r.detail).toMatch(/Alan Watts\): ok/)
  })
})

describe('rule-present — the Standing rules section is checked against the REAL select.md (gate 7d)', () => {
  const real = path.join(REPO_ROOT, '.claude/commands/slava/disagreement/select.md')

  it('RESOLVE on the real file', () => {
    const r = rulePresent({ ruleSet: 'standing-rules' })
    console.log('[standing-rules]', r.detail)
    expect(r.ok).toBe(true)
  })

  it('REJECT on a copy of the real file with the Standing rules section deleted', () => {
    const text = readFileSync(real, 'utf8')
    const start = text.indexOf('\n## Standing rules')
    const end = text.indexOf('\n## ', start + 5)
    expect(start).toBeGreaterThan(-1)
    const dir = mkdtempSync(path.join(os.tmpdir(), 'p1355-'))
    const copy = path.join(dir, 'select.md')
    writeFileSync(copy, text.slice(0, start) + text.slice(end))
    const r = rulePresent({ ruleSet: 'standing-rules', files: { '.claude/commands/slava/disagreement/select.md': copy } })
    console.log('[standing-rules, section deleted]', r.detail)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REJECT')
  })
})
