// P1669: insights from the P1640 weekly read, as cards at the top of the Daily report. Shown only
// when the latest collected read has insights the founder has not confirmed or dismissed; otherwise
// nothing is drawn. Each card keeps the P1640 hypothesis (numbers, base, comparison, confidence,
// next step, and the "seen before" pattern). Confirm / Dismiss write the same P1640 ledger, one
// decision at a time per card.

import { useEffect, useRef, useState } from 'react'
import type { Insight } from '../../lib/weeklyRead'
import { getWeeklyRead, postWeeklyDecision, safeUrl, type WeeklyReadPayload } from './api'
import { undecidedInsights } from './insightCardsModel'

type Decide = (key: string, d: 'confirm' | 'dismiss') => void

export function InsightCard({ insight, onDecide, pending = false }: { insight: Insight; onDecide: Decide; pending?: boolean }) {
  const href = safeUrl(insight.link)
  return (
    <div className="d-card d-pad" data-insight={insight.key} style={{ overflowWrap: 'anywhere', marginBottom: 8 }}>
      <div>
        <b>{insight.observation}</b>
        {insight.pattern && <span className="d-prop" style={{ marginLeft: 8 }}>pattern: seen {insight.seen_count} times before</span>}
      </div>
      <div className="d-nc">Numbers: {insight.numbers}</div>
      <div className="d-nc">Base: {insight.base}</div>
      <div className="d-nc">Comparison: {insight.comparison}</div>
      <div className="d-nc">Confidence: {insight.confidence}</div>
      <div className="d-nc">Next step: {insight.next_step}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <button type="button" className="d-btn sm" disabled={pending} onClick={() => onDecide(insight.key, 'confirm')}>
          Confirm
        </button>
        <button type="button" className="d-btn sm" disabled={pending} onClick={() => onDecide(insight.key, 'dismiss')}>
          Dismiss
        </button>
        {href && (
          <a className="d-link sm d-tap" href={href} target="_blank" rel="noopener noreferrer">
            Where to look
          </a>
        )}
      </div>
    </div>
  )
}

export function InsightCardsView({ data, onDecide, pending = [] }: { data: WeeklyReadPayload | null; onDecide: Decide; pending?: string[] }) {
  const insights = undecidedInsights(data)
  if (insights.length === 0) return null
  return (
    <section aria-label="Insights" data-insights>
      {insights.map((i) => (
        <InsightCard key={i.key} insight={i} onDecide={onDecide} pending={pending.includes(i.key)} />
      ))}
    </section>
  )
}

export function InsightCards() {
  const [data, setData] = useState<WeeklyReadPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState<string[]>([])
  // The guard reads a ref, not state: two clicks in one render must not both get through.
  const inFlight = useRef(new Set<string>())
  useEffect(() => {
    // A read that was not collected is reported by /day's own cp.analytics check; a failed load is
    // said in one quiet line, so it never looks like "nothing to decide".
    getWeeklyRead()
      .then(setData)
      .catch(() => {
        setData(null)
        setErr('Insights could not load')
      })
  }, [])
  const decide = (key: string, decision: 'confirm' | 'dismiss') => {
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setErr(null)
    setPending((p) => [...p, key])
    postWeeklyDecision(key, decision)
      .then(() =>
        setData((d) =>
          d && d.status !== 'none'
            ? decision === 'dismiss'
              ? { ...d, dismissed: [...d.dismissed, key] }
              : { ...d, confirmed: [...d.confirmed, key] }
            : d,
        ),
      )
      .catch((e: unknown) => setErr(e instanceof Error && e.message ? e.message : 'Could not save the decision'))
      .finally(() => {
        inFlight.current.delete(key)
        setPending((p) => p.filter((k) => k !== key))
      })
  }
  return (
    <>
      {err && <div className="d-card d-pad" role="alert">{err}</div>}
      <InsightCardsView data={data} onDecide={decide} pending={pending} />
    </>
  )
}
