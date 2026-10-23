// P1552: pure readings for the Token usage pane. Counts are activity (output written), never cost.
import type { DayTokenPeriod, DayTokens } from '../../lib/day'

export type Per = 'week' | 'month'

export const NARROW_BARS = 8
const NARROW_PX = 480
/** A narrow card shows the last NARROW_BARS periods; a wide one shows all. */
export const visibleStacks = <T,>(stacks: T[], width: number): T[] => (width < NARROW_PX ? stacks.slice(-NARROW_BARS) : stacks)
/** Bottom to top in the stacked bars. */
export const FAMILY_ORDER = ['Opus', 'Sonnet', 'Haiku', 'Fable', 'Codex', 'Other']
/** By provider: Anthropic purples, Fable magenta, Codex teal, Gemini blue (the Day page has one theme, so one set). */
export const FAMILY_COLOUR: Record<string, string> = {
  Opus: '#6D28D9', Sonnet: '#8B5CF6', Haiku: '#C4B5FD', Fable: '#C026D3', Codex: '#0D9488', Other: '#64748b',
}
export const TOOL_COLOUR = { claude: FAMILY_COLOUR.Opus, codex: FAMILY_COLOUR.Codex, gemini: '#2563EB' } as const
export const TOOL_LABEL = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' } as const

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

const median = (xs: number[]) => {
  const v = [...xs].sort((x, y) => x - y)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export interface TokenReadings {
  /** the period the readings describe (last completed one), or null when there is none */
  last: DayTokenPeriod | null
  length: number
  total: number | null
  /** total / usual; null = no baseline yet, or usual is 0 (see usualZero) */
  ratio: number | null
  /** the usual level is 0 (a real median, not a missing one): a ratio against 0 is undefined */
  usualZero: boolean
  /** output share per family in the last period, in FAMILY_ORDER, zero families dropped */
  shares: { family: string; value: number; pct: number }[]
  /** the family whose share moved most against the median of the periods before it; null = no baseline or no move */
  mover: { family: string; from: number; to: number } | null
  geminiCalls: number | null
  ctx: number | null
  days: { claude?: number; codex?: number; gemini?: number }
}

export function tokenReadings(t: DayTokens, per: Per): TokenReadings {
  const list = per === 'week' ? t.weeks : t.months
  const last = list.length ? list[list.length - 1] : null
  if (!last) {
    return { last: null, length: 0, total: null, ratio: null, usualZero: false, shares: [], mover: null, geminiCalls: null, ctx: null, days: {} }
  }
  const total = totalOf(last)
  const ratio = last.median4 != null && last.median4 > 0 ? total / last.median4 : null
  const shares = FAMILY_ORDER.filter((f) => (last.output[f] ?? 0) > 0).map((f) => ({ family: f, value: last.output[f], pct: Math.round((last.output[f] / total) * 100) }))
    .filter((s) => s.pct > 0) // a family that rounds to 0% is left out of the key and the bar
  // what the key leaves out (families that round to 0%, rounding itself) is shown as Other, so the key reads 100%
  const rest = 100 - shares.reduce((a, s) => a + s.pct, 0)
  if (rest > 0) {
    const other = shares.find((s) => s.family === 'Other')
    const left = total - shares.reduce((a, s) => a + s.value, 0)
    if (other) {
      other.pct += rest
      other.value += left
    } else shares.push({ family: 'Other', value: left, pct: rest })
  }
  // largest mover: share now against the median share of up to four periods before (those with output)
  const prior = list.slice(-5, -1).filter((p) => totalOf(p) > 0)
  let mover: TokenReadings['mover'] = null
  if (total > 0 && prior.length >= 2) {
    let best = 0
    for (const f of FAMILY_ORDER) {
      const now = (last.output[f] ?? 0) / total
      const usual = median(prior.map((p) => (p.output[f] ?? 0) / totalOf(p)))
      const move = Math.abs(Math.round(now * 100) - Math.round(usual * 100))
      const to = Math.round(now * 100)
      const from = Math.round(usual * 100)
      // a tie goes to the family that gained share (when one family drops, another rises by as much)
      if (move > best || (move === best && move > 0 && to > from && mover !== null && mover.to < mover.from)) {
        best = move
        mover = { family: f, from, to }
      }
    }
  }
  return {
    last,
    length: lengthOf(last.p, per),
    total,
    ratio,
    usualZero: last.median4 === 0,
    shares,
    mover,
    geminiCalls: last.gemini_calls ?? null,
    ctx: last.ctx_per_reply ?? null,
    days: last.days,
  }
}
