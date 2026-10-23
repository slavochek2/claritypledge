// P1552: pure readings for the Token usage pane. Counts are activity (output written), never cost.
import type { DayTokenPeriod, DayTokens } from '../../lib/day'

export type Per = 'week' | 'month'
export const FAMILY_ORDER = ['Opus', 'Sonnet', 'Haiku', 'Fable', 'Other', 'Codex']
export const FAMILY_COLOUR: Record<string, string> = {
  Opus: '#7c3aed', Sonnet: '#0369a1', Haiku: '#b45309', Fable: '#be185d', Other: '#64748b', Codex: '#15803d',
}

export const totalOf = (p: DayTokenPeriod) => Object.values(p.output).reduce((a, b) => a + b, 0)

/** 4.2M / 380k / 12 — one rule everywhere, so a number never reads two ways. */
export function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(Math.round(n))
}

/** x-axis label: "12 Oct" for a week starting that Monday, "Oct" for a month. */
export function periodLabel(p: string): string {
  const d = new Date(p.length === 7 ? `${p}-01T00:00:00Z` : `${p}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return p
  return d.toLocaleDateString('en-GB', p.length === 7 ? { month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const lengthOf = (p: string, per: Per) => (per === 'week' ? 7 : new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0)).getUTCDate())

/** Nothing at all to show: no completed week, no completed month, no project in the last 28 days. */
export const tokensEmpty = (t: DayTokens) => t.weeks.length === 0 && t.months.length === 0 && t.projects_28d.length === 0

export interface TokenReadings {
  /** the period the readings describe (last completed one), or null when there is none */
  last: DayTokenPeriod | null
  length: number
  total: number | null
  /** % above (+) or below (-) the median of the four periods before; null = "no baseline yet" or the median is 0 (see usualZero) */
  vsUsual: number | null
  /** the usual level is 0 (a real median, not a missing one): a percentage of 0 is undefined */
  usualZero: boolean
  opusShare: number | null
  ctx: number | null
  days: { claude?: number; codex?: number }
}

export function tokenReadings(t: DayTokens, per: Per): TokenReadings {
  const list = per === 'week' ? t.weeks : t.months
  const last = list.length ? list[list.length - 1] : null
  if (!last) return { last: null, length: 0, total: null, vsUsual: null, usualZero: false, opusShare: null, ctx: null, days: {} }
  const total = totalOf(last)
  const claude = Object.entries(last.output).filter(([k]) => k !== 'Codex').reduce((a, [, v]) => a + v, 0)
  return {
    last,
    length: lengthOf(last.p, per),
    total,
    vsUsual: last.median4 != null && last.median4 > 0 ? Math.round((total / last.median4 - 1) * 100) : null,
    usualZero: last.median4 === 0,
    opusShare: claude > 0 ? Math.round(((last.output.Opus ?? 0) / claude) * 100) : null,
    ctx: last.ctx_per_reply ?? null,
    days: last.days,
  }
}
