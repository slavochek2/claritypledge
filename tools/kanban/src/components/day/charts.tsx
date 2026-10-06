// P1399: a small hand-written SVG line chart (no chart library), as in the approved mockup.
// Solid series get point markers; dashed series are projections; a dotted light-slate line is a
// target or budget pace (colour is kept for action / needs you / worked); an optional vertical
// marker shows a reset. The chart measures its card, so it fills the width with true-size text.

import { useLayoutEffect, useRef, useState } from 'react'
import { projectQuota, QUOTA_COLOURS, resetLabel, WEEK_MS, type QuotaLine } from './quota'

export interface Series {
  data: (number | null | undefined)[]
  dash?: boolean
  name?: string
}

interface Props {
  xs: string[]
  series: Series[]
  /** a flat target value, or [index, value] points */
  target?: number | [number, number][]
  marker?: { i: number; label: string }
  fmt?: (v: number) => string
  max?: number
  height?: number
  label: string
}

const M = { t: 16, r: 12, b: 30, l: 44 }

/** The card's real width, so the chart fills it at every size with true-size text. */
function useWidth(fallback = 640) {
  const ref = useRef<SVGSVGElement>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      if (inner > 0) setW(Math.round(inner))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

export function LineChart({ xs, series, target, marker, fmt = (v) => String(v), max, height = 200, label }: Props) {
  const [ref, W] = useWidth()
  const values = series.flatMap((s) => s.data).filter((v): v is number => typeof v === 'number')
  const targets = target === undefined ? [] : Array.isArray(target) ? target.map(([, v]) => v) : [target]
  // Counts get whole-number ticks (no "0.5 events"); everything else a nice round top.
  const integer = max === undefined && [...values, ...targets].every((v) => Number.isInteger(v))
  const peak = Math.max(0, ...values, ...targets)
  const top = max ?? (integer ? Math.max(2, Math.ceil(niceMax(peak) / 2) * 2) : niceMax(peak))
  const ticks = [0, top / 2, top]
  const pw = W - M.l - M.r
  const ph = height - M.t - M.b
  const X = (i: number) => M.l + (xs.length <= 1 ? pw / 2 : (i * pw) / (xs.length - 1))
  const Y = (v: number) => M.t + ph * (1 - v / top)
  const fmtTick = (v: number) => fmt(Math.round(v * 10) / 10)
  // Thin the x labels to what fits (≈56px each); first and last always shown.
  const fit = Math.max(2, Math.floor(pw / 56))
  const step = Math.max(1, Math.ceil(xs.length / fit))
  const last = xs.length - 1
  const showX = (i: number) => i === 0 || i === last || (i % step === 0 && last - i >= step)

  const targetPts = target === undefined ? null : Array.isArray(target) ? target : ([[0, target], [Math.max(0, xs.length - 1), target]] as [number, number][])

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-label={label} className="d-svg">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke="#e2e8f0" />
          <text x={M.l - 8} y={Y(v) + 4} textAnchor="end" fontSize="13" fill="#64748b">
            {fmtTick(v)}
          </text>
        </g>
      ))}
      {xs.map((x, i) =>
        x && showX(i) ? (
          <text key={i} x={X(i)} y={height - 8} textAnchor={xs.length > 1 && i === xs.length - 1 ? 'end' : 'middle'} fontSize="13" fill="#64748b">
            {x}
          </text>
        ) : null,
      )}
      {marker && (
        <g>
          <line x1={X(marker.i)} x2={X(marker.i)} y1={M.t} y2={height - M.b} stroke="#94a3b8" strokeDasharray="2 3" />
          <text x={X(marker.i) - 4} y={M.t + 10} textAnchor="end" fontSize="12" fontWeight="600" fill="#475569">
            {marker.label}
          </text>
        </g>
      )}
      {targetPts && targetPts.length > 1 && (
        <polyline
          points={targetPts.map(([i, v]) => `${X(i)},${Y(v)}`).join(' ')}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray="2 4"
        />
      )}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => (typeof v === 'number' ? `${X(i)},${Y(v)}` : null)).filter(Boolean)
        return (
          <g key={si}>
            {pts.length > 1 && (
              <polyline points={pts.join(' ')} fill="none" stroke="#475569" strokeWidth="2.5" strokeDasharray={s.dash ? '5 5' : undefined} />
            )}
            {!s.dash &&
              s.data.map((v, i) =>
                typeof v === 'number' ? (
                  <circle key={i} cx={X(i)} cy={Y(v)} r="3.5" fill="#fff" stroke="#475569" strokeWidth="2">
                    <title>{`${xs[i]}: ${fmt(v)}`}</title>
                  </circle>
                ) : null,
              )}
          </g>
        )
      })}
    </svg>
  )
}

export function Legend({ items }: { items: { label: string; kind: 'solid' | 'dash' | 'target' }[] }) {
  return (
    <div className="d-legend">
      {items.map((it) => (
        <span key={it.label}>
          <i className={it.kind === 'solid' ? '' : it.kind === 'dash' ? 'dash' : 'tgt'} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------------------
// Subscriptions: every quota on ONE time axis. x = time from the earliest window start
// (resets_at − 7 days) to the latest reset; y = % left, 0–100. Per quota: a solid line through
// its readings, a dashed projection from the last reading to its reset at the same pace
// (clamped at 0), a dashed vertical reset marker with its name. Two non-status colours, a
// different marker shape each, and a label at the end of each line, so colour is never the only cue.

const dayTick = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short' })

const MS = { t: 48, r: 14, b: 30, l: 44 }
const ROW = 14

export function SubscriptionsChart({ lines }: { lines: QuotaLine[] }) {
  const [ref, W] = useWidth()
  const height = 230
  const start = Math.min(...lines.map((l) => l.resetsAt - WEEK_MS))
  const end = Math.max(...lines.map((l) => l.resetsAt), ...lines.flatMap((l) => l.points.map((p) => p.t)))
  const pw = W - MS.l - MS.r
  const ph = height - MS.t - MS.b
  const X = (t: number) => MS.l + ((t - start) / (end - start || 1)) * pw
  const Y = (v: number) => MS.t + ph * (1 - Math.max(0, Math.min(100, v)) / 100)
  const pt = (p: { t: number; v: number }) => `${X(p.t)},${Y(p.v)}`
  // a tick per day, thinned to what fits (≈ 44px each)
  const days: number[] = []
  for (let d = new Date(start).setHours(24, 0, 0, 0); d <= end; d += 24 * 3_600_000) days.push(d)
  const step = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(pw / 44))))
  // resets closer than 10% of the axis share one marker and one label, so labels never overlap
  const sorted = [...lines].sort((a, b) => a.resetsAt - b.resetsAt)
  const resets: QuotaLine[][] = []
  for (const l of sorted) {
    const g = resets[resets.length - 1]
    if (g && l.resetsAt - g[0].resetsAt < 0.1 * (end - start)) g.push(l)
    else resets.push([l])
  }

  // End labels: the highest line's goes above-right of its last reading (its projection falls away
  // from there); the others go below-left (their own line comes from above-left). Two labels never
  // share a spot, and a label that would leave the plot flips to the other side.
  const labelAt = new Map<string, { x: number; y: number; anchor: 'start' | 'end' }>()
  const order = [...lines].sort((a, b) => Y(a.points[a.points.length - 1].v) - Y(b.points[b.points.length - 1].v))
  order.forEach((l, rank) => {
    const last = l.points[l.points.length - 1]
    const lx = X(last.t)
    const wide = (l.label.length + 5) * 7
    const above = rank === 0 && lx + 8 + wide <= W - MS.r
    if (above) labelAt.set(l.id, { x: lx + 8, y: Y(last.v) - 9, anchor: 'start' })
    else if (lx - 8 - wide >= MS.l) labelAt.set(l.id, { x: lx - 8, y: Y(last.v) + 17, anchor: 'end' })
    else labelAt.set(l.id, { x: lx + 8, y: Y(last.v) + 17, anchor: 'start' })
  })

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-label="Subscriptions: % left this week" className="d-svg" data-subs-chart>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={MS.l} x2={W - MS.r} y1={Y(v)} y2={Y(v)} stroke="#e2e8f0" data-y={v} />
          <text x={MS.l - 8} y={Y(v) + 4} textAnchor="end" fontSize="13" fill="#64748b">{`${v}%`}</text>
        </g>
      ))}
      {days.map((d, i) =>
        i % step === 0 ? (
          <text key={d} x={X(d)} y={height - 8} textAnchor="middle" fontSize="13" fill="#64748b">
            {dayTick(d)}
          </text>
        ) : null,
      )}
      {resets.map((g, row) => (
        <g key={g.map((l) => l.id).join(' ')} data-reset={g.map((l) => l.id).join(' ')}>
          <line x1={X(g[0].resetsAt)} x2={X(g[0].resetsAt)} y1={MS.t - 6 - (resets.length - 1 - row) * ROW} y2={height - MS.b} stroke="#94a3b8" strokeDasharray="2 3" />
          <text x={X(g[0].resetsAt) - 4} y={MS.t - 10 - (resets.length - 1 - row) * ROW + 4} textAnchor="end" fontSize="12" fontWeight="600" fill="#475569">
            {`${g.map((l) => l.label).join(' and ')} ${g.length > 1 ? 'reset' : 'resets'} ${resetLabel(g[0].resetsAt)}`}
          </text>
        </g>
      ))}
      {lines.map((l, i) => {
        const colour = QUOTA_COLOURS[i % QUOTA_COLOURS.length]
        const proj = projectQuota(l)
        const last = l.points[l.points.length - 1]
        const at = labelAt.get(l.id) ?? { x: X(last.t), y: Y(last.v), anchor: 'end' as const }
        return (
          <g key={l.id}>
            {l.points.length > 1 && <polyline data-line={l.id} points={l.points.map(pt).join(' ')} fill="none" stroke={colour} strokeWidth="2.5" />}
            {proj && <polyline data-proj={l.id} points={proj.pts.map(pt).join(' ')} fill="none" stroke={colour} strokeWidth="2.5" strokeDasharray="5 5" />}
            {l.points.map((p, k) =>
              i % 2 === 0 ? (
                <circle key={k} cx={X(p.t)} cy={Y(p.v)} r="3.5" fill="#fff" stroke={colour} strokeWidth="2">
                  <title>{`${l.label} ${new Date(p.t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${p.v}%`}</title>
                </circle>
              ) : (
                <rect key={k} x={X(p.t) - 3.5} y={Y(p.v) - 3.5} width="7" height="7" fill="#fff" stroke={colour} strokeWidth="2">
                  <title>{`${l.label} ${new Date(p.t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${p.v}%`}</title>
                </rect>
              ),
            )}
            <text data-endlabel={l.id} x={at.x} y={at.y} textAnchor={at.anchor} fontSize="12" fontWeight="700" fill={colour}>
              {`${l.label} ${last.v}%`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Legend with the same swatches as the lines: colour, marker shape, and dashed = projection. */
export function SubscriptionsLegend({ lines }: { lines: { id: string; label: string }[] }) {
  return (
    <div className="d-legend" data-subs-legend>
      {lines.map((l, i) => (
        <span key={l.id}>
          <svg width="26" height="10" aria-hidden="true" className="d-lsw">
            <line x1="0" x2="26" y1="5" y2="5" stroke={QUOTA_COLOURS[i % QUOTA_COLOURS.length]} strokeWidth="2.5" />
            {i % 2 === 0 ? (
              <circle cx="13" cy="5" r="3.5" fill="#fff" stroke={QUOTA_COLOURS[i % QUOTA_COLOURS.length]} strokeWidth="2" />
            ) : (
              <rect x="9.5" y="1.5" width="7" height="7" fill="#fff" stroke={QUOTA_COLOURS[i % QUOTA_COLOURS.length]} strokeWidth="2" />
            )}
          </svg>
          {l.label}
        </span>
      ))}
      <span>
        <i className="dash" />
        Projection, same pace
      </span>
      <span>
        <i className="tgt" />
        Reset
      </span>
    </div>
  )
}
