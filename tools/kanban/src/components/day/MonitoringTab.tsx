// P1399: Monitoring — money and subscriptions only (every check lives in Daily report › Status).
// Two overview cards (Google Cloud, Subscriptions); the selected one shows its detail below. A
// budget raise is a decision that joins Start fixing.

import { useState } from 'react'
import type { DayCloud, DayQuota, DayReport, DayView } from '../../lib/day'
import { Legend, LineChart, SubscriptionsChart, SubscriptionsLegend } from './charts'
import { projectQuota, resetLabel, type QuotaLine } from './quota'
import { Phrases } from './status'

interface Props {
  report: DayReport
  view: DayView
  readOnly: boolean
  /** this week's readings per quota id, from the server */
  quotaHistory?: Record<string, { at: string; remaining_pct: number }[]>
  /** resolves to an error message, or null when the raise was recorded */
  onRaise: (target: string, amount: number) => Promise<string | null>
  onUndoRaise: (target: string) => void
}

const eur = (v: number) => `€${Math.round(v)}`
/** A missing number is never shown as €0. */
const eurOr = (v: number | undefined) => (typeof v === 'number' ? eur(v) : '—')
const weekday = (iso?: string) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' }) : null)

export function MonitoringTab(p: Props) {
  const { report } = p
  const quotas = report.monitoring?.quotas ?? []
  const cloud = report.monitoring?.cloud
  const [src, setSrc] = useState<'gcloud' | 'subs'>('gcloud')
  const [per, setPer] = useState<'week' | 'month'>('week')

  return (
    <>
      <div className="d-src">
        <button type="button" className="d-srcc" aria-pressed={src === 'gcloud'} onClick={() => setSrc('gcloud')}>
          <span className="d-n">Google Cloud</span>
          <span className="d-v">{cloud?.collected ? `${eurOr(cloud.spent_month_eur)} / ${eurOr(cloud.budget_eur)}` : '—'}</span>
          <span className="d-s">
            {cloud?.collected ? (
              cloud.credits ? <Phrases items={[`Credits ~${eur(cloud.credits.amount_eur)}`, cloud.credits.caveat?.split(' (')[0]]} /> : 'this month'
            ) : (
              'not collected yet'
            )}
          </span>
        </button>
        <button type="button" className="d-srcc" aria-pressed={src === 'subs'} onClick={() => setSrc('subs')}>
          <span className="d-n">Subscriptions</span>
          {quotas.length === 0 && <span className="d-s">not collected yet</span>}
          {quotas.map((q) => (
            <span className="d-sub1" key={q.id} data-sub={q.id}>
              {q.collected && typeof q.remaining_pct === 'number'
                ? `${q.label} ${q.remaining_pct}% left${weekday(q.resets_at) ? ` · resets ${weekday(q.resets_at)}` : ''}`
                : `${q.label} not collected yet`}
            </span>
          ))}
        </button>
      </div>
      {src === 'gcloud' ? (
        <>
          <div className="d-dhead">
            <h2>Google Cloud</h2>
            {cloud?.collected && <Segs per={per} onPer={setPer} />}
          </div>
          <Cloud cloud={cloud} per={per} {...p} />
        </>
      ) : (
        <>
          <div className="d-dhead">
            <h2>Subscriptions</h2>
          </div>
          <Subscriptions quotas={quotas} history={p.quotaHistory} runStartedAt={report.started_at} />
        </>
      )}
    </>
  )
}

function Segs({ per, onPer }: { per: 'week' | 'month'; onPer: (p: 'week' | 'month') => void }) {
  return (
    <div className="d-segs" role="tablist" aria-label="Period">
      {(['week', 'month'] as const).map((x) => (
        <button type="button" role="tab" key={x} className="d-tap" aria-selected={per === x} onClick={() => onPer(x)}>
          {x === 'week' ? 'Week' : 'Month'}
        </button>
      ))}
    </div>
  )
}

function Cloud({ cloud, per, view, readOnly, onRaise, onUndoRaise }: Props & { cloud?: DayCloud; per: 'week' | 'month' }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!cloud?.collected) {
    return (
      <div className="d-card d-pad">
        <b>Google Cloud spend</b> <span className="d-prop">not collected yet</span>
      </div>
    )
  }
  const wk = per === 'week'
  const pts = (wk ? cloud.week : cloud.month) ?? []
  const pace = pts.map((p, i) => (typeof p.budget_pace === 'number' ? ([i, p.budget_pace] as [number, number]) : null)).filter(Boolean) as [number, number][]
  const hasProj = pts.some((p) => typeof p.projected === 'number')
  const keys = [...(cloud.keys ?? [])].sort((a, b) => ratio(b) - ratio(a))
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k))

  return (
    <>
      {pts.length > 0 && (
        <div className="d-card d-chart">
          <div className="d-ct">
            <span>Account {wk ? 'this week' : 'this month'}</span>
            <span>
              {wk
                ? eurOr(cloud.spent_week_eur)
                : typeof cloud.projected_month_eur === 'number'
                  ? `${eur(cloud.projected_month_eur)} projected${cloud.budget_eur !== undefined ? ` of ${eur(cloud.budget_eur)}` : ''}`
                  : `${eurOr(cloud.spent_month_eur)} spent`}
            </span>
          </div>
          <LineChart
            label={`Google Cloud spend ${wk ? 'this week' : 'this month'}`}
            xs={pts.map((p) => p.x)}
            series={[{ data: pts.map((p) => p.spent) }, ...(hasProj ? [{ data: pts.map((p) => p.projected), dash: true }] : [])]}
            target={pace.length > 1 ? pace : undefined}
            fmt={(v) => `€${v}`}
          />
          <Legend
            items={[
              { label: 'Spent', kind: 'solid' },
              ...(hasProj ? [{ label: 'Projection', kind: 'dash' as const }] : []),
              ...(pace.length > 1 ? [{ label: 'Budget pace', kind: 'target' as const }] : []),
            ]}
          />
        </div>
      )}
      {cloud.credits && (
        <div className="d-credits">
          Credits <b>~{eur(cloud.credits.amount_eur)}</b>
          {cloud.credits.caveat ? ` · ${cloud.credits.caveat}` : ''}
        </div>
      )}
      {cloud.budget_eur !== undefined && (
        <>
          <button
            type="button"
            className="d-acctrow"
            aria-expanded={open === 'account'}
            disabled={readOnly}
            onClick={() => toggle('account')}
          >
            Account budget {eur(cloud.budget_eur)}/month {!readOnly && <span className="d-go">Raise ›</span>}
          </button>
          {open === 'account' && <Raise target="account" current={cloud.budget_eur} view={view} onRaise={onRaise} onUndoRaise={onUndoRaise} />}
        </>
      )}
      {keys.length > 0 && (
        <>
          <h3 className="d-h3">Keys · closest to limit first</h3>
          <div className="d-card">
            {keys.map((k) => {
              const nod = !k.collected || typeof k.spent_eur !== 'number'
              // the report may say why a key has no data (Phase D); else "not collected yet"
              const why = (k as { why?: string }).why
              const r = nod || !k.budget_eur ? 0 : (k.spent_eur as number) / k.budget_eur
              const need = nod || r > 0.8
              return (
                <div key={k.id} data-key={k.id}>
                  <button type="button" className="d-keyrow" aria-expanded={open === k.id} disabled={readOnly} onClick={() => toggle(k.id)}>
                    <span className="d-kn">{k.label}</span>
                    {nod ? (
                      <span className="d-kwhy need">{why ?? 'not collected yet'}</span>
                    ) : (
                      <>
                        <span className={`d-kv ${need ? 'need' : ''}`}>{`${eur(k.spent_eur as number)}${k.budget_eur !== undefined ? ` of ${eur(k.budget_eur)}` : ''}`}</span>
                        <span className={`d-kbar ${need ? 'need' : ''}`}>
                          <span style={{ width: `${Math.min(100, r * 100)}%` }} />
                        </span>
                      </>
                    )}
                  </button>
                  {open === k.id && <Raise target={k.id} current={k.budget_eur} view={view} onRaise={onRaise} onUndoRaise={onUndoRaise} />}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

/** Not-collected keys first (they need a look), then closest to the limit. */
function ratio(k: { collected: boolean; spent_eur?: number; budget_eur?: number }) {
  if (!k.collected || typeof k.spent_eur !== 'number') return Infinity
  return k.budget_eur ? k.spent_eur / k.budget_eur : 0
}

function Raise({
  target,
  current,
  view,
  onRaise,
  onUndoRaise,
}: {
  target: string
  current?: number
  view: DayView
  onRaise: (t: string, a: number) => Promise<string | null>
  onUndoRaise: (t: string) => void
}) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const added = view.budgets[target]
  if (added && typeof added.amount === 'number') {
    return (
      <div className="d-raise" data-raise={target}>
        <span className="ok">✓</span> Monthly budget → {eur(added.amount)} · in Start fixing{' '}
        <button type="button" className="d-link d-tap" onClick={() => onUndoRaise(target)}>
          Undo
        </button>
      </div>
    )
  }
  const n = Number(val)
  const floor = current ?? 0
  const valid = val.trim() !== '' && Number.isFinite(n) && n > floor
  const tooLow = val.trim() !== '' && !valid
  const tooLowMsg = `Must be more than ${eur(floor)}`
  return (
    <div className="d-raise" data-raise={target}>
      <label>
        Raise monthly budget to €
        <input
          className="d-rinput"
          type="number"
          min={floor + 1}
          value={val}
          onChange={(e) => {
            setVal(e.target.value)
            setErr(null)
          }}
          aria-label="New monthly budget in euros"
        />
      </label>
      <button
        type="button"
        className="d-btn sm"
        disabled={!valid}
        onClick={async () => {
          const e = await onRaise(target, n)
          if (e) setErr(e === 'conflict' ? tooLowMsg : e)
        }}
      >
        Add
      </button>
      {(tooLow || err) && (
        <span className="d-err" role="alert">
          {tooLow ? tooLowMsg : err}
        </span>
      )}
    </div>
  )
}

/** The readings of each collected quota this week; falls back to the run's own reading when the server sent no history. */
function linesOf(quotas: DayQuota[], history: Props['quotaHistory'], runStartedAt: string): QuotaLine[] {
  const out: QuotaLine[] = []
  for (const q of quotas) {
    const resetsAt = q.resets_at ? Date.parse(q.resets_at) : NaN
    if (!q.collected || !Number.isFinite(resetsAt)) continue
    let points = (history?.[q.id] ?? []).map((h) => ({ t: Date.parse(h.at), v: h.remaining_pct })).filter((x) => Number.isFinite(x.t))
    if (!points.length && typeof q.remaining_pct === 'number' && Number.isFinite(Date.parse(runStartedAt))) points = [{ t: Date.parse(runStartedAt), v: q.remaining_pct }]
    if (points.length) out.push({ id: q.id, label: q.label, resetsAt, points })
  }
  return out
}

function Subscriptions({ quotas, history, runStartedAt }: { quotas: DayQuota[]; history: Props['quotaHistory']; runStartedAt: string }) {
  const lines = linesOf(quotas, history, runStartedAt)
  const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null)
  if (!lines.length) {
    return (
      <div className="d-card d-pad">
        <b>Subscriptions</b> <span className="d-prop">not collected yet</span>
      </div>
    )
  }
  const verdict = (l: QuotaLine) => {
    if (l.points.length < 2) return { text: `${l.label}: one reading so far, no projection yet.`, need: false }
    const pr = projectQuota(l)
    if (!pr) return { text: `${l.label}: reset ${resetLabel(l.resetsAt)}.`, need: false }
    if (pr.runsOutAt !== null) return { text: `${l.label} runs out ${resetLabel(pr.runsOutAt)}, before it resets ${resetLabel(l.resetsAt)}.`, need: true }
    return { text: `${l.label}: ${Math.round(pr.atReset)}% left at the reset on ${resetLabel(l.resetsAt)}, at this pace.`, need: false }
  }
  return (
    <>
      <div className="d-card d-chart">
        <div className="d-ct">
          <span>% left this week</span>
        </div>
        <SubscriptionsChart lines={lines} />
        <SubscriptionsLegend lines={lines} />
        <div className="d-verd">
          {lines.map((l) => {
            const v = verdict(l)
            return (
              <p key={l.id} data-verdict={l.id} className={v.need ? 'need' : ''}>
                {v.text}
              </p>
            )
          })}
          {quotas
            .filter((q) => !lines.some((l) => l.id === q.id))
            .map((q) => (
              <p key={q.id} data-verdict={q.id}>
                {q.label}: not collected yet.
              </p>
            ))}
        </div>
      </div>
      {quotas
        .filter((q) => q.collected && q.window_5h)
        .map((q) => (
          <div className="d-win5t" key={q.id} data-window5h>
            {`${q.label} 5-hour window: ${q.window_5h?.remaining_pct}% left${time(q.window_5h?.resets_at) ? ` · resets ${time(q.window_5h?.resets_at)}` : ''}`}
          </div>
        ))}
      {quotas
        .filter((q) => q.collected && q.tip)
        .map((q) => (
          <div className="d-tip" key={q.id}>
            <b>{q.label}: how to use less</b> {q.tip}
          </div>
        ))}
    </>
  )
}
