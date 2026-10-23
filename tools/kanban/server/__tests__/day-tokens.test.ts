// P1552: the tokens block in monitoring — parser tolerance, the pane's readings, and the pane in
// its collected / not-collected states. Invented data only (fixtures/day-tokens.ts).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseReport, type DayReport, type DayTokens } from '../../src/lib/day'
import { TokenUsage } from '../../src/components/day/TokenUsage'
import { fmtTokens, tokenReadings } from '../../src/components/day/tokens'
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
    const codexOnly: DayTokens = { ...SYNTH_TOKENS, weeks: SYNTH_TOKENS.weeks.map((w) => ({ ...w, output: { Codex: w.output.Codex ?? 0 + 1 } })) }
    const h = html(codexOnly)
    expect(h).toContain('Codex')
    expect(h).not.toContain('>Opus<')
  })
})
