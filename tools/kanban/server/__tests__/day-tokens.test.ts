// P1552: the tokens block in monitoring — parser tolerance, the pane's readings, and the pane in
// its collected / not-collected states. Invented data only (fixtures/day-tokens.ts).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseReport, type DayReport, type DayTokens } from '../../src/lib/day'
import { TokenUsage } from '../../src/components/day/TokenUsage'
import { MonitoringTab } from '../../src/components/day/MonitoringTab'
import { FAMILY_COLOUR, fmtTokens, visibleStacks, TOOL_COLOUR, tokenReadings, tokensEmpty } from '../../src/components/day/tokens'
import { synthReport } from './fixtures/day-fixture'
import { SYNTH_TOKENS } from './fixtures/day-tokens'

function parsed(tokens: unknown, over: Record<string, unknown> = {}): DayReport {
  const base = synthReport()
  const raw = JSON.parse(JSON.stringify({ ...base, ...over, monitoring: { ...base.monitoring, tokens } }))
  const r = parseReport(raw)
  if (r.kind !== 'ok') throw new Error(`parse failed: ${r.kind}`)
  return r.report
}

describe('P1552 parser', () => {
  it('VALID — a well-formed block survives intact', () => {
    expect(parsed(SYNTH_TOKENS).monitoring?.tokens).toEqual(SYNTH_TOKENS)
  })

  it('OLD REPORT — no tokens field: parsed monitoring has no tokens and quotas/cloud are untouched', () => {
    const base = synthReport()
    const { tokens: _t, ...rest } = base.monitoring!
    const raw = JSON.parse(JSON.stringify({ ...base, monitoring: rest }))
    const r = parseReport(raw)
    if (r.kind !== 'ok') throw new Error('parse failed')
    expect(r.report.monitoring?.tokens).toBeUndefined()
    expect(r.report.monitoring?.quotas).toHaveLength(base.monitoring!.quotas!.length)
    expect(r.report.monitoring?.cloud?.keys).toHaveLength(base.monitoring!.cloud!.keys!.length)
  })

  it('UNKNOWN SCHEMA — still falls back, never half-parsed', () => {
    const raw = JSON.parse(JSON.stringify({ ...synthReport(), schema: 99 }))
    expect(parseReport(raw).kind).toBe('other-schema')
  })

  it('MALFORMED — bad periods and projects are removed, the rest renders', () => {
    const t = parsed({
      collected: true,
      as_of: 'garbage',
      weeks: [
        SYNTH_TOKENS.weeks[5],
        { p: 'not-a-date', output: { Opus: 1 }, days: {} },
        { p: '2026-09-07', output: 'nope', days: {} },
        { p: '2026-09-14', output: { Opus: -5, Sonnet: 'x', Haiku: 7 }, days: { claude: 2.5, codex: 3 }, median4: 'big', ctx_per_reply: -1 },
        null,
      ],
      months: 'not a list',
      projects_28d: [{ project: 'demo-a', output: 5, share: 0.5 }, { project: 'demo-b', output: -1, share: 0.1 }, { project: '', output: 1, share: 1 }, { project: 'demo-c', output: 1, share: 7 }, 3],
    }).monitoring!.tokens!
    expect(t.collected).toBe(true)
    expect(t.as_of).toBeUndefined()
    expect(t.weeks.map((w) => w.p)).toEqual(['2026-08-31', '2026-09-14'])
    expect(t.weeks[1]).toEqual({ p: '2026-09-14', output: { Haiku: 7 }, days: { codex: 3 } })
    expect(t.months).toEqual([])
    expect(t.projects_28d).toEqual([{ project: 'demo-a', output: 5, share: 0.5 }])
  })

  it('GEMINI — calls and days survive; bad values are dropped; absent stays absent (not 0)', () => {
    const t = parsed({
      collected: true,
      weeks: [
        { p: '2026-09-28', output: { Opus: 1 }, days: { claude: 1, gemini: 2 }, gemini_calls: 7 },
        { p: '2026-10-05', output: { Opus: 1 }, days: { claude: 1, gemini: -1 }, gemini_calls: 1.5 },
        { p: '2026-10-12', output: { Opus: 1 }, days: { claude: 1 } },
      ],
      months: [], projects_28d: [],
    }).monitoring!.tokens!
    expect(t.weeks[0]).toMatchObject({ days: { claude: 1, gemini: 2 }, gemini_calls: 7 })
    expect(t.weeks[1].gemini_calls).toBeUndefined()
    expect(t.weeks[1].days.gemini).toBeUndefined()
    expect('gemini_calls' in t.weeks[2] || 'gemini' in t.weeks[2].days).toBe(false)
  })

  it('NOT A BLOCK — a non-object tokens field is absent, not an empty collected block', () => {
    expect(parsed('x').monitoring?.tokens).toBeUndefined()
    expect(parsed({ collected: false }).monitoring?.tokens).toEqual({ collected: false, weeks: [], months: [], projects_28d: [] })
  })
})

describe('P1552 readings', () => {
  const wk = (p: string, o: Record<string, number>, extra: object = {}) => ({ p, output: o, days: { claude: 5 }, ...extra })
  it('week: header numbers, ratio against usual, shares, Gemini calls, context', () => {
    const r = tokenReadings(SYNTH_TOKENS, 'week')
    expect(r.last?.p).toBe('2026-09-28')
    expect(r.total).toBe(4_200_000)
    expect(r.ratio).toBeCloseTo(4.2 / 1.85, 5)
    expect(r.shares.map((s) => [s.family, s.pct])).toEqual([['Opus', 71], ['Sonnet', 17], ['Codex', 12]]) // bottom to top, zero families dropped
    expect(r.geminiCalls).toBe(4)
    expect(r.ctx).toBe(94_000)
    expect(r.length).toBe(7)
  })
  it('spike: the top 28-day project is named only at a ratio of 1.5 or more', () => {
    expect(tokenReadings(SYNTH_TOKENS, 'week').spikeProject).toBe('demo-site') // 2.3x
    const calm = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, median4: 4_000_000 })) }
    expect(tokenReadings(calm, 'week').ratio).toBeCloseTo(1.05, 2)
    expect(tokenReadings(calm, 'week').spikeProject).toBeNull()
    const edge = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, median4: 2_800_000 })) } // exactly 1.5x
    expect(tokenReadings(edge, 'week').spikeProject).toBe('demo-site')
  })
  it('largest mover: share now against the median share of the periods before', () => {
    const weeks = [
      wk('2026-09-07', { Opus: 96, Codex: 4 }), wk('2026-09-14', { Opus: 96, Codex: 4 }), wk('2026-09-21', { Opus: 96, Codex: 4 }),
      wk('2026-09-28', { Opus: 96, Codex: 4 }), wk('2026-10-05', { Opus: 89, Codex: 11 }),
    ]
    const r = tokenReadings({ ...SYNTH_TOKENS, weeks }, 'week')
    expect(r.mover).toEqual({ family: 'Codex', from: 4, to: 11 })
    expect(tokenReadings({ ...SYNTH_TOKENS, weeks: weeks.slice(-2) }, 'week').mover).toBeNull() // one earlier period is no baseline
    expect(tokenReadings({ ...SYNTH_TOKENS, weeks: weeks.slice(0, 4) }, 'week').mover).toBeNull() // no move at all
  })
  it('month: switches the period, month length from the month', () => {
    const r = tokenReadings(SYNTH_TOKENS, 'month')
    expect(r.last?.p).toBe('2026-09')
    expect(r.length).toBe(30)
    expect(r.total).toBe(11_000_000)
    expect(r.geminiCalls).toBeNull() // the fixture's months carry no Gemini data: absent, not 0
  })
  it('no baseline when fewer than two earlier periods', () => {
    expect(tokenReadings({ ...SYNTH_TOKENS, weeks: [SYNTH_TOKENS.weeks[0]] }, 'week').ratio).toBeNull()
  })
  it('no period at all: every reading is empty, none is 0', () => {
    const r = tokenReadings({ ...SYNTH_TOKENS, weeks: [] }, 'week')
    expect([r.last, r.total, r.ctx, r.geminiCalls]).toEqual([null, null, null, null])
    expect(r.shares).toEqual([])
  })
  it('number format', () => {
    expect([fmtTokens(4_200_000), fmtTokens(12_000_000), fmtTokens(94_000), fmtTokens(12)]).toEqual(['4.2M', '12M', '94k', '12'])
  })
  it('colours by provider', () => {
    expect(FAMILY_COLOUR).toMatchObject({ Opus: '#6D28D9', Sonnet: '#8B5CF6', Haiku: '#C4B5FD', Fable: '#C026D3', Codex: '#0D9488' })
    expect(TOOL_COLOUR.gemini).toBe('#2563EB')
  })
})

describe('P1552 pane render', () => {
  const html = (t: DayTokens | undefined, per: 'week' | 'month' = 'week') => renderToStaticMarkup(TokenUsage({ tokens: t, per }))
  // the first render has no measured width, so the chart draws in its fallback width (wide: every period)
  const bars = (h: string) => [...h.matchAll(/data-bar="([^"]+)"/g)].map((m) => m[1])

  it('COLLECTED — stacked bars, three readings, project list; no All-models line', () => {
    const h = html(SYNTH_TOKENS)
    expect(h).toContain('data-tokens-pane')
    expect(h).toContain('data-stacked-bars="10"')
    expect(bars(h)).toHaveLength(10)
    expect(h).not.toContain('<polyline') // no line series at all
    expect(h).not.toContain('All models')
    for (const id of ['days', 'share', 'ctx']) expect(h).toContain(`data-reading="${id}"`)
    expect(h).not.toContain('data-reading="vs"')
    expect(h).not.toContain('data-reading="opus"')
    expect(h).toContain('data-bar-total') // total above each bar
    expect(h).toContain('data-usual=') // dashed tick on bars with a usual level
    expect(h).toContain('data-tokens-projects')
    expect(h).toContain('title="demo-api-with-a-very-long-invented-name-that-truncates"')
    expect(h).not.toContain('data-tokens-not-collected')
  })
  it('header carries the spike reading: total, ratio, and the top project at 1.5x or more', () => {
    const h = html(SYNTH_TOKENS)
    expect(h).toMatch(/data-tokens-summary[^>]*>4\.2M last full week · 2\.3× usual · mostly demo-site</)
    const calm = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, median4: 4_000_000 })) }
    const c = html(calm)
    expect(c).toMatch(/data-tokens-summary[^>]*>4\.2M last full week · 1\.1× usual</)
    expect(c).not.toContain('mostly')
  })
  it('legend and bars drop a model with no output in the window', () => {
    const h = html(SYNTH_TOKENS)
    expect(h).toContain('>Opus<')
    expect(h).not.toContain('>Haiku<')
    expect(h).not.toContain('>Fable<')
    expect(h).not.toContain(FAMILY_COLOUR.Haiku)
  })
  it('stack order bottom to top: Opus, Sonnet, Haiku, Fable, Codex', () => {
    const all: DayTokens = { ...SYNTH_TOKENS, weeks: [{ p: '2026-09-28', output: { Codex: 1, Fable: 2, Haiku: 3, Sonnet: 4, Opus: 5 }, days: { claude: 1 } }] }
    const fills = [...html(all).matchAll(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1])
    expect(fills).toEqual([FAMILY_COLOUR.Opus, FAMILY_COLOUR.Sonnet, FAMILY_COLOUR.Haiku, FAMILY_COLOUR.Fable, FAMILY_COLOUR.Codex])
  })
  it('share bar, caption and Gemini line in Gemini colour', () => {
    const h = html(SYNTH_TOKENS)
    expect(h).toContain('Which model does the work, last full week')
    expect(h).toContain('d-tk-share')
    expect(h).toMatch(/data-share-caption="true">Biggest change vs usual: /)
    expect(h).toMatch(/data-gemini="true" style="color:#2563EB"[^>]*>Gemini: 4 calls</)
    expect(html(SYNTH_TOKENS, 'month')).not.toContain('data-gemini') // absent data: no Gemini line, not "0 calls"
  })
  it('days strip: one row per tool in use, count in the tool colour, only tools that exist', () => {
    const h = html(SYNTH_TOKENS)
    expect(h).toMatch(/data-day-row="claude"[^]*?color:#6D28D9[^]*?>5 of 7</)
    expect(h).toMatch(/data-day-row="codex"[^]*?color:#0D9488[^]*?>2 of 7</)
    expect(h).toMatch(/data-day-row="gemini"[^]*?color:#2563EB[^]*?>1 of 7</)
    const claudeOnly: DayTokens = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, days: { claude: 4, codex: 0 } })) }
    const c = html(claudeOnly)
    expect(c).toContain('data-day-row="claude"')
    expect(c).not.toContain('data-day-row="codex"')
    expect(c).not.toContain('data-day-row="gemini"')
    expect(c).not.toMatch(/Codex 0|0 of 7/)
  })
  it('month switch changes the readings', () => {
    const h = html(SYNTH_TOKENS, 'month')
    expect(h).toContain('>25 of 30<')
    expect(h).toMatch(/data-tokens-summary[^>]*>11M last full month/)
    expect(h).toContain('Which model does the work, last full month')
  })
  it('NOT COLLECTED — words, no zeros, no chart', () => {
    for (const t of [undefined, { collected: false, weeks: [], months: [], projects_28d: [] } as DayTokens]) {
      const h = html(t)
      expect(h).toContain('data-tokens-not-collected')
      expect(h).toContain('not collected yet')
      expect(h).not.toContain('<svg')
      expect(h).not.toContain('data-reading')
    }
  })
  it('Claude missing, Codex present: only the series that exist are drawn and listed', () => {
    expect(html(SYNTH_TOKENS)).toContain('>Opus<') // control: the probe below can see an Opus legend entry
    const codexOnly: DayTokens = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, output: { Codex: (w.output.Codex ?? 0) + 1 }, days: { claude: 0, codex: 3 } })) }
    const h = html(codexOnly)
    expect(codexOnly.weeks[0].output.Codex).toBe(1) // precedence slip guard: (0) + 1, not 0 ?? (0 + 1)
    expect(codexOnly.weeks[9].output.Codex).toBe(500_001)
    expect(h).toContain('>Codex<')
    expect(h).not.toContain('>Opus<')
    expect(h).not.toContain('>Sonnet<')
  })
  it('USUAL IS 0 — a real zero median is not "no baseline", and the tick is still drawn', () => {
    const zero: DayTokens = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, median4: 0 })) }
    const r = tokenReadings(zero, 'week')
    expect(r.usualZero).toBe(true)
    expect(r.ratio).toBeNull()
    const h = html(zero)
    expect(h).toContain('usual is 0')
    expect(h).not.toContain('no baseline yet')
    expect(h).toContain('data-usual=')
    expect(tokenReadings(SYNTH_TOKENS, 'week').usualZero).toBe(false) // control
    const none = html({ ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, median4: undefined })) })
    expect(none).toContain('no baseline yet') // control: missing is not zero
    expect(none).not.toContain('data-usual=')
  })
  it('project list shows what the collector sends (top 5 plus all others), bars scaled to the biggest', () => {
    const h = html(SYNTH_TOKENS)
    expect(h.match(/<li[ >]/g)).toHaveLength(6)
    expect(h).toContain('width:100%')
  })
})

describe('P1552 narrow cards', () => {
  const st = Array.from({ length: 10 }, (_, i) => ({ label: `w${i}`, total: i, usual: null, segments: [] }))
  it('375px shows the last 8 periods; a wide card shows all', () => {
    expect(visibleStacks(st, 327).map((s) => s.label)).toEqual(['w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9'])
    expect(visibleStacks(st, 479)).toHaveLength(8)
    expect(visibleStacks(st, 480)).toHaveLength(10)
    expect(visibleStacks(st.slice(0, 5), 327)).toHaveLength(5)
  })
})

describe('P1552 card and pane agree', () => {
  const card = (t: DayTokens | undefined) => {
    const base = synthReport()
    const report = { ...base, monitoring: { ...base.monitoring, tokens: t } } as DayReport
    const h = renderToStaticMarkup(createElement(MonitoringTab, { report, view: {} as never, readOnly: false, onRaise: async () => null, onUndoRaise: () => {} }))
    return h.slice(h.indexOf('Token usage'), h.indexOf('</button>', h.indexOf('Token usage')))
  }
  const pane = (t: DayTokens, per: 'week' | 'month' = 'week') => renderToStaticMarkup(TokenUsage({ tokens: t, per }))
  const EMPTY: DayTokens = { collected: true, weeks: [], months: [], projects_28d: [] }
  const ONLY_PROJECTS: DayTokens = { ...EMPTY, as_of: '2026-10-22', projects_28d: SYNTH_TOKENS.projects_28d }

  it('collected but empty: both say "no usage yet"', () => {
    expect(tokensEmpty(EMPTY)).toBe(true)
    expect(card(EMPTY)).toContain('no usage yet')
    expect(pane(EMPTY)).toContain('no usage yet')
  })
  it('no completed week but 28-day projects: the card says "no full week yet" and the pane shows the projects, never "no usage"', () => {
    expect(tokensEmpty(ONLY_PROJECTS)).toBe(false)
    expect(card(ONLY_PROJECTS)).toContain('no full week yet')
    expect(card(ONLY_PROJECTS)).not.toContain('no usage yet')
    const h = pane(ONLY_PROJECTS)
    expect(h).toContain('data-tokens-no-period')
    expect(h).toContain('no full week yet')
    expect(h).toContain('data-tokens-projects')
    expect(h).not.toContain('no usage yet')
    expect(h).not.toContain('<svg')
  })
  it('weeks exist but the month view has none: the pane says no full month, not "no usage"', () => {
    const h = pane({ ...SYNTH_TOKENS, months: [] }, 'month')
    expect(h).toContain('no full month yet')
    expect(h).not.toContain('no usage yet')
  })
  it('data present: the card shows the last full week total', () => {
    expect(card(SYNTH_TOKENS)).toContain('4.2M')
  })
})
