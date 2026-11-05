// P1640: Analytics — the weekly product read. The headline first, then at most three insights the
// gate raised (each a hypothesis with its numbers and base), then the seven questions in the spec's
// order. A read that was not collected says "Not collected" and why; it is never drawn as zero or
// as "no change". A percentage appears only where percentLabel allows one.

import { useEffect, useState } from 'react'
import { SECTION_KEYS, percentLabel, type Insight, type Row, type SectionKey, type StoredRead } from '../../lib/weeklyRead'
import { getWeeklyRead, postWeeklyDecision, safeUrl, type WeeklyReadPayload } from './api'

/** The founder's own question text, in the spec's table order. */
const QUESTIONS: Record<SectionKey, string> = {
  who: 'Who is here',
  what: 'What they do',
  time: 'How much time',
  returns: 'Who returns',
  explore: 'Do they explore',
  stuck: 'Do they get stuck',
  practice: 'Is the practice working',
}

const SESSION_NOTE = 'open time, not attention'

const Link = ({ url, label }: { url?: string; label: string }) => {
  const href = safeUrl(url)
  return href ? (
    <a className="d-link sm d-tap" href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  ) : null
}

const show = (n: number | null) => (n === null ? 'not collected' : String(n))

function RowLine({ row, section }: { row: Row; section: SectionKey }) {
  const pct = percentLabel(row.current, row.previous)
  const note = row.label === 'Session length' ? SESSION_NOTE : row.note
  return (
    <div className="d-row" data-an-row={`${section}:${row.label}`} style={{ flexWrap: 'wrap', overflowWrap: 'anywhere' }}>
      <span className="d-tx">
        {row.label}
        {note && <span className="d-nc" style={{ display: 'block' }}>{note}</span>}
      </span>
      <span style={{ textAlign: 'right' }}>
        <b>{show(row.current)}</b> <span className="d-nc">vs {show(row.previous)}</span>
        {pct && <span className="d-nc" style={{ display: 'block' }}>{pct}</span>}
      </span>
      <Link url={row.link} label="Open" />
    </div>
  )
}

function InsightCard({ insight, onDecide }: { insight: Insight; onDecide: (key: string, d: 'confirm' | 'dismiss') => void }) {
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
        <button type="button" className="d-btn sm" onClick={() => onDecide(insight.key, 'confirm')}>
          Confirm
        </button>
        <button type="button" className="d-btn sm" onClick={() => onDecide(insight.key, 'dismiss')}>
          Dismiss
        </button>
        <Link url={insight.link} label="Replay or report" />
      </div>
    </div>
  )
}

export function WeeklyReadView({
  data,
  onDecide,
}: {
  data: WeeklyReadPayload
  onDecide: (key: string, d: 'confirm' | 'dismiss') => void
}) {
  if (data.status === 'none') {
    return <div className="d-card d-pad">No weekly read yet</div>
  }
  const read: StoredRead = data.read
  const decided = new Set([...data.dismissed, ...data.confirmed])
  const insights = read.insights.filter((i) => !decided.has(i.key))
  if (data.status === 'not-collected') {
    return (
      <div className="d-card d-pad" data-an-status="not-collected">
        <b>Not collected</b>
        <div className="d-nc">Read date {read.date}</div>
        <div className="d-nc">{read.reason ?? 'No reason was recorded.'}</div>
      </div>
    )
  }
  return (
    <>
      <div className="d-card d-pad" data-an-status="collected">
        <div className="d-nc">Read date {read.date}</div>
        <div className="d-nc">Clean data since {read.clean_data_since}</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{insights.length ? `${insights.length} ${insights.length === 1 ? 'thing' : 'things'} worth your attention` : 'No change worth your attention.'}</div>
      </div>
      {insights.length > 0 && (
        <section aria-label="Insights">
          <h3 className="d-h3">Insights</h3>
          {insights.map((i) => (
            <InsightCard key={i.key} insight={i} onDecide={onDecide} />
          ))}
        </section>
      )}
      {SECTION_KEYS.map((k) => {
        const s = read.sections?.[k]
        return (
          <section key={k} aria-label={QUESTIONS[k]} data-an-section={k}>
            <h3 className="d-h3">
              {QUESTIONS[k]}
              {s && !s.reconciled && <span className="d-prop">not yet reconciled</span>}
            </h3>
            <div className="d-card">
              {!s || s.rows.length === 0 ? (
                <div className="d-row d-nc">Not collected</div>
              ) : (
                s.rows.map((row) => <RowLine key={row.label} row={row} section={k} />)
              )}
            </div>
          </section>
        )
      })}
    </>
  )
}

export function WeeklyReadTab() {
  const [data, setData] = useState<WeeklyReadPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    getWeeklyRead().then(setData).catch(() => setErr('Could not load the weekly read'))
  }, [])
  const decide = (key: string, decision: 'confirm' | 'dismiss') => {
    postWeeklyDecision(key, decision)
      .then(() => setData((d) => (d && d.status !== 'none' ? { ...d, [decision === 'dismiss' ? 'dismissed' : 'confirmed']: [...(decision === 'dismiss' ? d.dismissed : d.confirmed), key] } : d)))
      .catch((e: Error) => setErr(e.message))
  }
  if (err) return <div className="d-card d-pad" role="alert">{err}</div>
  if (!data) return <div className="d-card d-pad d-nc">Loading</div>
  return <WeeklyReadView data={data} onDecide={decide} />
}
