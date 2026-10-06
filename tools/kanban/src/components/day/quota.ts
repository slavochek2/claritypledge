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


/** Two resets within this share one marker; further apart they are two. */
export const MERGE_RESETS_MS = 2 * 3_600_000

export function groupResets(lines: QuotaLine[]): QuotaLine[][] {
  const groups: QuotaLine[][] = []
  for (const l of [...lines].sort((a, b) => a.resetsAt - b.resetsAt)) {
    const g = groups[groups.length - 1]
    if (g && l.resetsAt - g[0].resetsAt <= MERGE_RESETS_MS) g.push(l)
    else groups.push([l])
  }
  return groups
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

/** "Claude resets Thu 8 Oct"; a merged marker names each time when they differ ("Claude 10:00 and Codex 11:30 reset Thu 8 Oct"). */
export function resetGroupLabel(g: QuotaLine[]): string {
  if (g.length === 1) return `${g[0].label} resets ${resetLabel(g[0].resetsAt)}`
  const same = g.every((l) => clock(l.resetsAt) === clock(g[0].resetsAt) && resetLabel(l.resetsAt) === resetLabel(g[0].resetsAt))
  if (same) return `${g.map((l) => l.label).join(' and ')} reset ${resetLabel(g[0].resetsAt)}`
  const sameDay = g.every((l) => resetLabel(l.resetsAt) === resetLabel(g[0].resetsAt))
  if (sameDay) return `${g.map((l) => `${l.label} ${clock(l.resetsAt)}`).join(' and ')} reset ${resetLabel(g[0].resetsAt)}`
  return `${g.map((l) => `${l.label} ${clock(l.resetsAt)} ${resetLabel(l.resetsAt)}`).join(' and ')} reset`
}
