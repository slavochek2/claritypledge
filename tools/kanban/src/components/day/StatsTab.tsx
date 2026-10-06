// P1399: Stats — the outreach funnel, weekly lines against targets, then readings. Anything the run
// did not collect says "not collected yet"; it is never drawn as 0.

import { useState, type Dispatch, type SetStateAction } from 'react'
import type { DayNote, DayStats } from '../../lib/day'
import { Legend, LineChart } from './charts'

const NotCollected = () => <span className="d-prop">not collected yet</span>

export function StatsTab({ stats, notes }: { stats?: DayStats; notes?: DayNote[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  /** A reading tile that has a note opens it in "From this run" and scrolls there. */
  const openNote = (id: string) => {
    setOpen((o) => ({ ...o, [id]: true }))
    // after the fold has rendered open
    window.requestAnimationFrame(() => document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }))
  }
  const known = new Set((notes ?? []).map((n) => n.id))
  return (
    <>
      <StatsBody stats={stats} noteIds={known} onOpenNote={openNote} />
      <Notes notes={notes} open={open} setOpen={setOpen} />
    </>
  )
}

/** Detail one step away ("From this run"): one fold per note, plain text, nothing when absent. */
function Notes({ notes, open, setOpen }: { notes?: DayNote[]; open: Record<string, boolean>; setOpen: Dispatch<SetStateAction<Record<string, boolean>>> }) {
  if (!notes?.length) return null
  return (
    <section className="d-notes" aria-label="From this run">
      <h3 className="d-h3">From this run</h3>
      <div className="d-card">
        {notes.map((n) => (
          <div className="d-note-item" key={n.id} data-note={n.id}>
            <button type="button" className="d-fold" aria-expanded={!!open[n.id]} onClick={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))}>
              <span className="d-tri">▶</span>
              <span className="d-notetitle">
                {n.title}
                {/* the badge flows after the title and wraps as a unit, never squeezing it; a title that already says "review" needs none */}
                {n.review && !/review/i.test(n.title) && <span className="d-runbadge sm">{n.review === 'weekly' ? 'Weekly review' : 'Monthly review'}</span>}
              </span>
            </button>
            {open[n.id] && <div className="d-notebody">{n.body}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function StatsBody({ stats, noteIds, onOpenNote }: { stats?: DayStats; noteIds: Set<string>; onOpenNote: (id: string) => void }) {
  if (!stats || (!stats.readings?.length && !stats.funnel && !stats.series?.length)) {
    return (
      <div className="d-card d-pad">
        Stats <NotCollected />
      </div>
    )
  }
  // Spec §3: funnel first, then the weekly lines, then the readings.
  return (
    <>
      {stats.funnel && <Funnel funnel={stats.funnel} />}
      {!!stats.series?.length && (
        <div className="d-grid d-statgrid">
          {stats.series.map((s) => (
            <div key={s.id} data-series={s.id}>
              <h3 className="d-h3">
                {s.label}
                {typeof s.target === 'number' && (
                  <span className="d-prop">
                    target {s.target}
                    {s.target_proposed ? ' · proposed' : ''}
                  </span>
                )}
              </h3>
              {s.collected && s.points.length ? (
                <div className="d-card d-chart">
                  <LineChart
                    label={s.label}
                    height={200}
                    xs={s.points.map((p) => p.x)}
                    series={[{ data: s.points.map((p) => p.value) }]}
                    target={s.target}
                  />
                  <Legend items={[{ label: 'Actual', kind: 'solid' }, ...(typeof s.target === 'number' ? [{ label: 'Target', kind: 'target' as const }] : [])]} />
                </div>
              ) : (
                <div className="d-card d-pad d-nc d-placeholder">not collected yet</div>
              )}
            </div>
          ))}
        </div>
      )}
      {!!stats.readings?.length && (
        <div className="d-grid d-rd d-mt12">
          {stats.readings.map((r) => {
            const body = (
              <>
                <div className="d-sn">{r.label}</div>
                {r.collected && typeof r.value === 'number' ? <div className="d-sv">{r.value}</div> : <div className="d-nc">not collected yet</div>}
              </>
            )
            // a tile whose note exists is a button; anything else stays plain
            return r.note && noteIds.has(r.note) ? (
              <button type="button" className="d-card d-pad d-rbtn" key={r.id} data-reading={r.id} onClick={() => onOpenNote(r.note as string)}>
                {body}
                <span className="d-go" aria-hidden="true">
                  ›
                </span>
              </button>
            ) : (
              <div className="d-card d-pad" key={r.id} data-reading={r.id}>
                {body}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function Funnel({ funnel }: { funnel: NonNullable<DayStats['funnel']> }) {
  // Not collected: labels only. Never sample bars, never 0.
  const shown = funnel.collected
  const max = Math.max(1, ...funnel.steps.map((s) => s.value ?? 0))
  return (
    <div className="d-card d-chart d-funnel" data-funnel>
      <div className="d-ct">
        <span>
          Outreach funnel{funnel.period ? ` · ${funnel.period}` : ''}
        </span>
      </div>
      {!funnel.collected && <div className="d-nc d-ncline">not collected yet</div>}
      {funnel.steps.map((s) => (
        <div className="d-fr" key={s.label}>
          <span>{s.label}</span>
          {shown && typeof s.value === 'number' ? (
            <>
              <div className="d-fb" style={{ width: `${(s.value / max) * 100}%` }} />
              <span className="d-fn">{s.value}</span>
            </>
          ) : (
            <>
              <div />
              <span className="d-fn d-dim" aria-label="not collected yet">
                —
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
