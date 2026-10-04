// P1399: Stats — the outreach funnel, weekly lines against targets, then readings. Anything the run
// did not collect says "not collected yet"; it is never drawn as 0.

import type { DayStats } from '../../lib/day'
import { Legend, LineChart } from './charts'

const NotCollected = () => <span className="d-prop">not collected yet</span>

export function StatsTab({ stats }: { stats?: DayStats }) {
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
          {stats.readings.map((r) => (
            <div className="d-card d-pad" key={r.id} data-reading={r.id}>
              <div className="d-sn">{r.label}</div>
              {r.collected && typeof r.value === 'number' ? <div className="d-sv">{r.value}</div> : <div className="d-nc">not collected yet</div>}
            </div>
          ))}
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
