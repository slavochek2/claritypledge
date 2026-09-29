/** P1370 (named p1210-* so two-callers.mjs counts it as the predicate test) — accuracy evidence written by the stage that earned it; transcripts identified by seal. */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  contentSha256, parseDrafts, parseSeal, verifySeal, matchRows, checkQuotes, writerOverlap,
  buildLine, latestLine, videoId, charCount, TOOL_MARK,
} from '../../scripts/points/accuracy-check.mjs'
import { readings } from '../../scripts/events/event-date.mjs'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const ID = 'eRrc1pUY5oU'
const CLEAN = '[00:00] The difficulty just collapsed. We think life has a purpose.\n'
const RAW = 'WEBVTT\n\n00:00.000 --> 00:02.000\nThe difficulty just collapsed.\n'

const RUN = `# run
## Story Drafts
method: "x"

### Story — Garry Tan — P1
target_points: [P1]
writer: gemini-3.8-flash | rounds: 1 | checker: PASS | content_chars: 40
content: |
  Tan says the difficulty is gone.

  Supporting quotes from Garry Tan

### Story — Garry Tan — P2
target_points: [P2]
writer: gemini-3.8-flash | rounds: 2 | checker: FAIL | content_chars: 30
content: |
  Tan held this one.

## Next Section
`

function store(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'p1370-'))
  mkdirSync(path.join(dir, ID))
  const files = { 'en-orig.vtt': RAW, 'en.clean.txt': CLEAN, ...extra }
  for (const [f, b] of Object.entries(files)) writeFileSync(path.join(dir, ID, f), b)
  return dir
}
const sealLine = (more = '') =>
  `source: ${ID} | track: en | raw_sha256: ${sha(RAW)} | clean_sha256: ${sha(CLEAN)} | vtt-clean: vtt-clean 1.0.0${more}\n`
const row = (content: string, quotes = ['The difficulty just collapsed.']) => ({
  id: 'r1', content, video_url: `https://www.youtube.com/watch?v=${ID}`,
  video_quotes: { quotes: quotes.map(text => ({ text, seconds: 1 })) },
})
const RECLEAN = (_f: string) => ({ out: CLEAN })   // stands in for vtt-clean on the served track
const GOOD = 'Tan says the difficulty is gone.\n\nSupporting quotes from Garry Tan\n\n#ikigai1'

describe('content hash — the recipe promote-to-prod reads', () => {
  it('is sha256 over contents sorted by code point, no separator, order-independent', () => {
    const a = [{ content: 'b' }, { content: 'a' }, { content: 'é' }]
    expect(contentSha256(a)).toBe(sha('abé'))
    expect(contentSha256([...a].reverse())).toBe(contentSha256(a))
  })
  it('CONTROL: one changed byte changes the hash', () => {
    expect(contentSha256([{ content: GOOD }])).not.toBe(contentSha256([{ content: GOOD + ' ' }]))
  })
})

describe('run-file drafts', () => {
  it('parses writer, verdict and the dedented content block', () => {
    const d = parseDrafts(RUN)
    expect(d).toHaveLength(2)
    expect(d[0]).toMatchObject({ arguer: 'Garry Tan', point: 'P1', writer: 'gemini-3.8-flash', checker: 'PASS' })
    expect(d[0].content).toBe('Tan says the difficulty is gone.\n\nSupporting quotes from Garry Tan')
  })
  it('MUST-PASS: a row equal to a PASS draft plus the tag suffix matches', () => {
    expect(matchRows([row(GOOD)], parseDrafts(RUN), 'ikigai1').ok).toBe(true)
  })
  it('refuses a row edited after the check (the ikigai1 Brett relabel shape)', () => {
    const r = matchRows([row(GOOD.replace('Garry Tan', 'Garry Tan (YC)'))], parseDrafts(RUN), 'ikigai1')
    expect(r.ok).toBe(false)
    expect(r.problems[0]).toContain('fresh check')
  })
  it('refuses a row whose draft is not checker: PASS', () => {
    const r = matchRows([row('Tan held this one.\n\n#ikigai1')], parseDrafts(RUN), 'ikigai1')
    expect(r.problems[0]).toContain('not a clean PASS')
  })
  it('refuses a PASS draft marked pending founder acceptance (review finding 2)', () => {
    const md = RUN.replace('checker: PASS | content_chars: 40', 'checker: PASS | content_chars: 40 | STATUS: PENDING FOUNDER ACCEPTANCE')
    expect(matchRows([row(GOOD)], parseDrafts(md), 'ikigai1').ok).toBe(false)
  })
  it('refuses when a later draft with the same text FAILED, and on PASS? / PASS→FAIL tokens', () => {
    const later = RUN.replace('## Next Section', '### Story — Garry Tan — P1\nwriter: gemini-3.8-flash | rounds: 2 | checker: FAIL\ncontent: |\n  Tan says the difficulty is gone.\n\n  Supporting quotes from Garry Tan\n\n## Next Section')
    expect(matchRows([row(GOOD)], parseDrafts(later), 'ikigai1').ok).toBe(false)
    for (const tok of ['PASS?', 'PASS→FAIL', 'PASS/FAIL']) expect(parseDrafts(RUN.replace('checker: PASS', `checker: ${tok}`))[0].checker).not.toBe('PASS')
  })
  it('a verdict line after the content block ends it and counts (review L1)', () => {
    const md = '## Story Drafts\n### Story — A — P1\nwriter: gemini | checker: PASS\ncontent: |\n  a\nwriter: opus | checker: FAIL\n'
    expect(parseDrafts(md)[0].checker).not.toBe('PASS')
  })
  it('refuses when two drafts carry the same text (review L3)', () => {
    const dup = RUN.replace('## Next Section', '### Story — Garry Tan — P1b\nwriter: opus | rounds: 1 | checker: PASS\ncontent: |\n  Tan says the difficulty is gone.\n\n  Supporting quotes from Garry Tan\n\n## Next Section')
    expect(matchRows([row(GOOD)], parseDrafts(dup), 'ikigai1').problems[0]).toContain('2 drafts')
  })
  it('a CRLF run file parses the same as LF', () => {
    expect(matchRows([row(GOOD)], parseDrafts(RUN.replace(/\n/g, '\r\n')), 'ikigai1').ok).toBe(true)
  })
  it('refuses two rows claiming one draft', () => {
    expect(matchRows([row(GOOD), { ...row(GOOD), id: 'r2' }], parseDrafts(RUN), 'ikigai1').ok).toBe(false)
  })
})

describe('transcripts are identified by their sealed bytes, never re-fetched', () => {
  it('MUST-PASS: the sealed files are found; en-orig counts as the raw track', () => {
    const r = verifySeal(parseSeal(sealLine(` | served_track: en-orig.vtt | clean_chars: ${charCount(CLEAN)}`)), store(), RECLEAN)
    expect(r.problems).toEqual([])
    expect(r.found.get(ID).rawMatches).toEqual(['en-orig.vtt'])
  })
  it('refuses when the stored track is a different (e.g. machine-translated) rendering', () => {
    const dir = store({ 'en-orig.vtt': RAW.replace('collapsed', 'collapses') })
    expect(verifySeal(parseSeal(sealLine()), dir).problems.join()).toContain('raw_sha256')
  })
  it('refuses on a char-count mismatch and on a served_track that holds other bytes', () => {
    const dir = store({ 'en.vtt': 'WEBVTT\ntranslated\n' })
    const p = verifySeal(parseSeal(sealLine(' | served_track: en.vtt | clean_chars: 36420')), dir, RECLEAN).problems.join('\n')
    expect(p).toContain('served_track en.vtt')
    expect(p).toContain('36420')
  })
  it('refuses a clean file that was not derived from the served track (review finding 6)', () => {
    const r = verifySeal(parseSeal(sealLine(' | served_track: en-orig.vtt')), store(), () => ({ out: 'translated text' }))
    expect(r.problems.join()).toContain('different tracks')
  })
  it('refuses when the sealed cleaner version cannot be re-run, instead of trusting the clean file', () => {
    expect(verifySeal(parseSeal(sealLine(' | served_track: en-orig.vtt')), store(), () => ({ skipped: 'installed 1.1.0' })).ok).toBe(false)
  })
  it('a legacy seal (no served_track) must still be reproduced from a stored raw track (review M2)', () => {
    expect(verifySeal(parseSeal(sealLine()), store(), RECLEAN).ok).toBe(true)
    expect(verifySeal(parseSeal(sealLine()), store(), () => ({ out: 'other' })).problems.join()).toContain('different tracks')
  })
  it('refuses a source absent from the store instead of fetching it', () => {
    expect(verifySeal(parseSeal(sealLine().replace(ID, 'AAAAAAAAAAA')), store()).problems[0]).toContain('does not re-fetch')
  })
  it('quotes: verbatim passes; a one-word change is caught (control)', () => {
    const { found } = verifySeal(parseSeal(sealLine()), store())
    expect(checkQuotes([row(GOOD)], found)).toMatchObject({ ok: true, n: 1 })
    expect(checkQuotes([row(GOOD, ['The difficulty has collapsed.'])], found).ok).toBe(false)
  })
  it('refuses an empty quote and a video_quotes with no quotes array (review finding 9)', () => {
    const { found } = verifySeal(parseSeal(sealLine()), store())
    expect(checkQuotes([row(GOOD, [''])], found).ok).toBe(false)
    expect(checkQuotes([{ ...row(GOOD), video_quotes: [{ text: 'x' }] }], found).ok).toBe(false)
  })
  it('refuses zero checked quotes across rows that carry a video, and a two-word quote (review L2)', () => {
    const { found } = verifySeal(parseSeal(sealLine()), store())
    expect(checkQuotes([row(GOOD, [])], found).ok).toBe(false)
    expect(checkQuotes([row(GOOD, ['difficulty just'])], found).ok).toBe(false)
  })
  it('reads video ids from watch, youtu.be and embed links', () => {
    for (const u of [`https://www.youtube.com/watch?v=${ID}&t=3`, `https://youtu.be/${ID}`, `https://www.youtube.com/embed/${ID}`]) expect(videoId(u)).toBe(ID)
  })
})

describe('the checker is not the writer', () => {
  const m = parseDrafts(RUN).slice(0, 1).map(draft => ({ draft }))
  it('MUST-PASS: a Sonnet checker of a Gemini writer', () => {
    expect(writerOverlap('Claude Sonnet 5 checker subagents', m).ok).toBe(true)
  })
  it('refuses a Gemini checker of a Gemini writer, and a checker naming no model', () => {
    expect(writerOverlap('Gemini 3.8 re-read', m).ok).toBe(false)
    expect(writerOverlap('this session', m).ok).toBe(false)
  })
})

describe('ledger line', () => {
  const line = buildLine({ iso: '2026-09-29T00:00:00Z', env: 'test', tag: 'ikigai1', n: 21, hash: 'f'.repeat(64), method: 'm', checkedBy: 'Claude Sonnet' })
  it('has the exact format promote-to-prod reads, and latestLine reads it back', () => {
    expect(line).toBe(`2026-09-29T00:00:00Z | disagreement:accuracy-check | env:test | tag:ikigai1 | stories:21 | content_sha256:${'f'.repeat(64)} | verdict:21/21 clean | method:${TOOL_MARK} m | checked_by:Claude Sonnet | findings:none`)
    expect(latestLine(`x\n${line}\n`, 'test', 'ikigai1')).toMatchObject({ hash: 'f'.repeat(64), stories: 21, tool: true, clean: true })
    expect(latestLine(line, 'prod', 'ikigai1')).toBeNull()
    expect(latestLine(line, 'test', 'ikigai')).toBeNull()
  })
  it('a hand-written or non-clean line is read as not counting (review finding 1)', () => {
    const hand = `t | disagreement:accuracy-check | env:test | tag:ikigai1 | stories:1 | content_sha256:${'a'.repeat(64)} | verdict:1/1 clean | method:re-fetched | checked_by:x | findings:none`
    expect(latestLine(hand, 'test', 'ikigai1')).toMatchObject({ tool: false })
    expect(latestLine(line.replace('findings:none', 'findings:FABRICATION'), 'test', 'ikigai1')).toMatchObject({ clean: false })
    expect(latestLine(line.replace('verdict:21/21', 'verdict:0/21'), 'test', 'ikigai1')).toMatchObject({ clean: false })
  })
  it('refuses a free-text field that would break the pipe format', () => {
    expect(() => buildLine({ iso: 'x', env: 'test', tag: 't', n: 1, hash: 'h', method: 'a | b', checkedBy: 'c' })).toThrow()
  })
})

describe('event-date: "next week <weekday>" has both readings (P1370)', () => {
  it.each(['next week tuesday', 'tuesday next week', "next week's Tuesday", 'Tuesday of next week'])('%s', phrase => {
    expect(readings(phrase, '2026-09-28').candidates).toEqual(['2026-09-29', '2026-10-06'])
  })
  it('CONTROL: a non-weekday after "next week" is still unreadable, not guessed', () => {
    expect(readings('next week sometime', '2026-09-28').candidates).toEqual([])
  })
})

describe('CLI entry point (review M1)', () => {
  it('run through a symlinked path it still executes, never a silent exit 0', () => {
    const link = path.join(mkdtempSync(path.join(tmpdir(), 'p1370-ln-')), 'repo')
    symlinkSync(path.resolve(__dirname, '../..'), link)
    const r = spawnSync('node', [path.join(link, 'scripts/points/accuracy-check.mjs'), 'bogus'], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('usage')
  })
})
