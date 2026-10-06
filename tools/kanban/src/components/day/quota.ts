// P1399: the Subscriptions chart's numbers — kept apart from the chart component.

export interface QuotaLine {
  id: string
  label: string
  resetsAt: number
  points: { t: number; v: number }[]
}

export const WEEK_MS = 7 * 24 * 3_600_000
/** Violet and slate: neither is blue (action), amber (needs you), green (worked) or red. */
export const QUOTA_COLOURS = ['#7c3aed', '#334155']
export const resetLabel = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')

/** The projection of one line: where the pace puts it at each stop up to the reset (clamped at 0). */
export function projectQuota(q: QuotaLine): { pts: { t: number; v: number }[]; runsOutAt: number | null; atReset: number } | null {
  const first = q.points[0]
  const last = q.points[q.points.length - 1]
  if (!first || !last || q.points.length < 2 || last.t <= first.t || last.t >= q.resetsAt) return null
  const perMs = Math.max(0, first.v - last.v) / (last.t - first.t)
  const reach = last.v - perMs * (q.resetsAt - last.t)
  if (perMs > 0 && reach <= 0) {
    const out = last.t + last.v / perMs
    return { pts: [last, { t: out, v: 0 }, { t: q.resetsAt, v: 0 }], runsOutAt: out, atReset: 0 }
  }
  return { pts: [last, { t: q.resetsAt, v: reach }], runsOutAt: null, atReset: reach }
}

