// P1552: the tokens block in monitoring — parser tolerance, the pane's readings, and the pane in
// its collected / not-collected states. Invented data only (fixtures/day-tokens.ts).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseReport, type DayReport, type DayTokens } from '../../src/lib/day'
import { TokenUsage } from '../../src/components/day/TokenUsage'
import { MonitoringTab } from '../../src/components/day/MonitoringTab'
import { fmtTokens, tokenReadings, tokensEmpty } from '../../src/components/day/tokens'
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
        SYNTH_TOKENS.weeks[0],
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

  it('NOT A BLOCK — a non-object tokens field is absent, not an empty collected block', () => {
    expect(parsed('x').monitoring?.tokens).toBeUndefined()
    expect(parsed({ collected: false }).monitoring?.tokens).toEqual({ collected: false, weeks: [], months: [], projects_28d: [] })
  })
})

describe('P1552 readings', () => {
  it('week: last full week against the usual level', () => {
    const r = tokenReadings(SYNTH_TOKENS, 'week')
    expect(r.last?.p).toBe('2026-09-28')
    expect(r.total).toBe(4_200_000)
    expect(r.vsUsual).toBe(127) // 4.2M vs median4 1.85M
    expect(r.opusShare).toBe(81) // 3.0 of 3.7 Claude output; Codex excluded
    expect(r.ctx).toBe(94_000)
    expect(r.length).toBe(7)
  })
  it('month: switches the period, month length from the month', () => {
    const r = tokenReadings(SYNTH_TOKENS, 'month')
    expect(r.last?.p).toBe('2026-09')
    expect(r.length).toBe(30)
    expect(r.total).toBe(11_000_000)
  })
  it('no baseline when fewer than two earlier periods', () => {
    expect(tokenReadings({ ...SYNTH_TOKENS, weeks: [SYNTH_TOKENS.weeks[0]] }, 'week').vsUsual).toBeNull()
  })
  it('no period at all: every reading is empty, none is 0', () => {
    const r = tokenReadings({ ...SYNTH_TOKENS, weeks: [] }, 'week')
    expect([r.last, r.total, r.opusShare, r.ctx]).toEqual([null, null, null, null])
  })
  it('number format', () => {
    expect([fmtTokens(4_200_000), fmtTokens(12_000_000), fmtTokens(94_000), fmtTokens(12)]).toEqual(['4.2M', '12M', '94k', '12'])
  })
})

describe('P1552 pane render', () => {
  const html = (t: DayTokens | undefined, per: 'week' | 'month' = 'week') => renderToStaticMarkup(TokenUsage({ tokens: t, per }))

  it('COLLECTED — chart, four readings, project list with truncation title', () => {
    const h = html(SYNTH_TOKENS)
    expect(h).toContain('data-tokens-pane')
    expect(h).toContain('<svg')
    for (const id of ['days', 'opus', 'ctx', 'vs']) expect(h).toContain(`data-reading="${id}"`)
    expect(h).toContain('Claude 5 of 7')
    expect(h).toContain('Codex 2 of 7')
    expect(h).toContain('81%')
    expect(h).toContain('4.2M')
    expect(h).toContain('+127% vs usual')
    expect(h).toContain('data-tokens-projects')
    expect(h).toContain('title="demo-api-with-a-very-long-invented-name-that-truncates"')
    expect(h).not.toContain('data-tokens-not-collected')
  })
  it('month switch changes the readings', () => {
    const h = html(SYNTH_TOKENS, 'month')
    expect(h).toContain('Claude 25 of 30')
    expect(h).toContain('11M')
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
  it('Claude missing, Codex present: only the series that exist are listed', () => {
    expect(html(SYNTH_TOKENS)).toContain('>Opus<') // control: the probe below can see an Opus legend entry
    const codexOnly: DayTokens = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, output: { Codex: (w.output.Codex ?? 0) + 1 }, days: { claude: 0, codex: 3 } })) }
    const h = html(codexOnly)
    expect(codexOnly.weeks[0].output.Codex).toBe(1) // precedence slip guard: (0) + 1, not 0 ?? (0 + 1)
    expect(codexOnly.weeks[4].output.Codex).toBe(500_001)
    expect(h).toContain('>Codex<')
    expect(h).not.toContain('>Opus<')
    expect(h).not.toContain('>Sonnet<')
  })
  it('days reading lists only the tools with days in use: no "Codex 0 of 7"', () => {
    const claudeOnly: DayTokens = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, days: { claude: 4, codex: 0 } })) }
    const h = html(claudeOnly)
    expect(h).toContain('Claude 4 of 7')
    expect(h).not.toContain('Codex 0')
    expect(h).not.toMatch(/Codex \d+ of/)
    expect(html(SYNTH_TOKENS)).toMatch(/Codex 2 of 7/) // control
  })
  it('USUAL IS 0 — a real zero median is not "no baseline", and it still draws the usual line', () => {
    const zero: DayTokens = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, median4: 0 })) }
    const r = tokenReadings(zero, 'week')
    expect(r.usualZero).toBe(true)
    expect(r.vsUsual).toBeNull()
    const h = html(zero)
    expect(h).toContain('usual is 0')
    expect(h).not.toContain('no baseline yet')
    expect(h).toContain('Usual (median of the 4 before)')
    expect(tokenReadings(SYNTH_TOKENS, 'week').usualZero).toBe(false) // control
    expect(html({ ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, median4: undefined })) })).toContain('no baseline yet') // control: missing is not zero
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
