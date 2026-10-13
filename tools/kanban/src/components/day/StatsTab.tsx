// P1399: Stats — the outreach funnel, weekly lines against targets, then readings. Anything the run
// did not collect says "not collected yet"; it is never drawn as 0.
// P1468: then the Goals (goals.md's goal and open next steps, snapshotted when the report was rendered), and
// only the weekly / monthly review notes — the daily notes and the chat tiles are not shown,
// whatever the report contains (boardNotes / boardReadings).

import { useState, type Dispatch, type SetStateAction } from 'react'
import { boardNotes, boardReadings, type DayGoal, type DayNote, type DayStats } from '../../lib/day'
import { Legend, LineChart } from './charts'

const NotCollected = () => <span className="d-prop">not collected yet</span>

export function StatsTab({ stats, notes, goals, goal }: { stats?: DayStats; notes?: DayNote[]; goals?: DayGoal[]; goal?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const shown = boardNotes(notes)
  /** A reading tile that has a note opens it in "Review notes" and scrolls there. */
  const openNote = (id: string) => {
    setOpen((o) => ({ ...o, [id]: true }))
    // after the fold has rendered open
    window.requestAnimationFrame(() => document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }))
  }
  const known = new Set(shown.map((n) => n.id))
  return (
    <>
      <StatsBody stats={stats} noteIds={known} onOpenNote={openNote} />
      <Goals goals={goals} goal={goal} />
      <Notes notes={shown} open={open} setOpen={setOpen} />
    </>
  )
}

/**
 * P1468: where "From this run" was — the current goals in plain words, never an empty box: absent
 * (a run from before P1468) reads "not collected yet"; parsed but empty (goals.md drifted, or
 * nothing open) says so. Rows as the agent list and Parked draw theirs.
 * Decided 7: the goal, when the run has one, is the card's first line in the funnel card's lead
 * style (d-ct), above the steps; a run without one draws exactly what it drew before.
 */
function Goals({ goals, goal }: { goals?: DayGoal[]; goal?: string }) {
  const lead = goal ? (
    <div className="d-row d-ct" data-goal-line>
      <span className="d-tx">{goal}</span>
    </div>
  ) : null
  return (
    <section className="d-notes" aria-label="Goals" data-goals>
      <h3 className="d-h3">Goals</h3>
      {!goals ? (
        <div className="d-card d-pad">
          <NotCollected />
        </div>
      ) : goals.length === 0 ? (
        lead ? (
          <div className="d-card">
            {lead}
            <div className="d-row d-nc">No open goals found in docs/goals.md</div>
          </div>
        ) : (
          <div className="d-card d-pad d-nc">No open goals found in docs/goals.md</div>
        )
      ) : (
        <div className="d-card">
          {lead}
          {goals.map((g) => (
            <div className="d-row" key={g.id} data-goal={g.id}>
              <span className="d-tx">{g.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** A weekly / monthly review's measurements, one step away: one fold per note, plain text, nothing when absent. */
function Notes({ notes, open, setOpen }: { notes: DayNote[]; open: Record<string, boolean>; setOpen: Dispatch<SetStateAction<Record<string, boolean>>> }) {
  if (!notes.length) return null
  return (
    <section className="d-notes" aria-label="Review notes" data-review-notes>
      <h3 className="d-h3">Review notes</h3>
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
  if (!stats || (!boardReadings(stats.readings).length && !stats.funnel && !stats.series?.length)) {
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
      {boardReadings(stats.readings).length > 0 && (
        <div className="d-grid d-rd d-mt12">
          {boardReadings(stats.readings).map((r) => {
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
