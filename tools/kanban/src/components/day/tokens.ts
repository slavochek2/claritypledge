// P1552: pure readings for the Token usage pane. Counts are activity (output written), never cost.
import type { DayTokenPeriod, DayTokens } from '../../lib/day'

export type Per = 'week' | 'month'

export const NARROW_BARS = 8
const NARROW_PX = 480
/** A narrow card shows the last NARROW_BARS periods; a wide one shows all. */
export const visibleStacks = <T,>(stacks: T[], width: number): T[] => (width < NARROW_PX ? stacks.slice(-NARROW_BARS) : stacks)
/** Bottom to top in the stacked bars. */
/** Also the legend order. Any family outside this list is counted as Other. */
export const FAMILY_ORDER = ['Opus', 'Sonnet', 'Haiku', 'Fable', 'Other', 'Codex']
/** By provider: Anthropic purples, Fable magenta, Codex teal, Gemini blue (the Day page has one theme, so one set). */
export const FAMILY_COLOUR: Record<string, string> = {
  Opus: '#6D28D9', Sonnet: '#8B5CF6', Haiku: '#C4B5FD', Fable: '#C026D3', Codex: '#0D9488', Other: '#64748b',
}
export const TOOL_COLOUR = { claude: FAMILY_COLOUR.Opus, codex: FAMILY_COLOUR.Codex, gemini: '#2563EB' } as const
export const TOOL_LABEL = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' } as const

/** Output per display family: a family outside FAMILY_ORDER is counted as Other, so bars and totals agree. */
export function familyOutputs(output: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(output)) {
    const f = FAMILY_ORDER.includes(k) ? k : 'Other'
    out[f] = (out[f] ?? 0) + v
  }
  return out
}

/** Whole percentages that add up to exactly 100 (largest remainder); ties go to the earlier family. */
export function allocatePercent(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => 0)
  const exact = values.map((v) => (v / total) * 100)
  const out = exact.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const byRemainder = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    out[i] += 1
    left -= 1
  }
  return out
}

/**
 * x-axis labels that fit: walking from the last label back, a label is dropped when it would sit
 * closer than its own half-width plus the kept neighbour's half-width. The last label always wins.
 */
export function fittingLabels(xs: number[], widths: number[]): boolean[] {
  const keep = xs.map(() => false)
  let right = -1
  for (let i = xs.length - 1; i >= 0; i--) {
    if (right === -1 || xs[right] - xs[i] >= widths[right] / 2 + widths[i] / 2) {
      keep[i] = true
      right = i
    }
  }
  return keep
}

/** Centre x for a text of `width` px so it stays inside [0, total]; a label at the right edge slides left. */
export function clampX(x: number, width: number, total: number): number {
  return Math.min(Math.max(x, width / 2 + 1), total - width / 2 - 1)
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
  /** enough earlier periods (two with output) to compare against; false = "no baseline yet" */
  baseline: boolean
  geminiCalls: number | null
  ctx: number | null
  days: { claude?: number; codex?: number; gemini?: number }
}

export function tokenReadings(t: DayTokens, per: Per): TokenReadings {
  const list = per === 'week' ? t.weeks : t.months
  const last = list.length ? list[list.length - 1] : null
  if (!last) {
    return { last: null, length: 0, total: null, ratio: null, usualZero: false, shares: [], mover: null, baseline: false, geminiCalls: null, ctx: null, days: {} }
  }
  const total = totalOf(last)
  const ratio = last.median4 != null && last.median4 > 0 ? total / last.median4 : null
  // shares: a period with no output has none; otherwise largest-remainder percentages over the families
  // that have output (unknown families count as Other), so the key sums to exactly 100
  const fam = familyOutputs(last.output)
  const present = total > 0 ? FAMILY_ORDER.filter((f) => (fam[f] ?? 0) > 0) : []
  const pcts = allocatePercent(present.map((f) => fam[f]))
  const shares = present.map((f, i) => ({ family: f, value: fam[f], pct: pcts[i] })).filter((x) => x.pct > 0)
  // largest mover: share now against the median share of up to four periods before (those with output)
  const prior = list.slice(-5, -1).filter((p) => totalOf(p) > 0)
  let mover: TokenReadings['mover'] = null
  if (total > 0 && prior.length >= 2) {
    let best = 0
    for (const f of FAMILY_ORDER) {
      // the current % is the one the key shows (largest remainder), so caption and key never disagree
      const to = shares.find((x) => x.family === f)?.pct ?? 0
      const usual = median(prior.map((p) => (familyOutputs(p.output)[f] ?? 0) / totalOf(p)))
      const move = Math.abs(to - Math.round(usual * 100))
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
    baseline: total > 0 && prior.length >= 2,
    geminiCalls: last.gemini_calls ?? null,
    ctx: last.ctx_per_reply ?? null,
    days: last.days,
  }
}
