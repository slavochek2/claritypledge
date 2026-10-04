// P1399: a small hand-written SVG line chart (no chart library), as in the approved mockup.
// Solid series get point markers; dashed series are projections; a dotted light-slate line is a
// target or budget pace (colour is kept for action / needs you / worked); an optional vertical
// marker shows a reset. The chart measures its card, so it fills the width with true-size text.

import { useLayoutEffect, useRef, useState } from 'react'

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
