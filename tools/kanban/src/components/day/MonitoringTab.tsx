// P1399: Monitoring — overview cards (Systems, Google Cloud, each quota); the selected one shows
// its detail below. A budget raise is a decision that joins Start fixing.

import { useState, type ReactNode } from 'react'
import type { DayCloud, DayQuota, DayReport, DayView } from '../../lib/day'
import { Legend, LineChart } from './charts'
import { CheckRow, Phrases } from './status'

interface Props {
  report: DayReport
  view: DayView
  readOnly: boolean
  /** resolves to an error message, or null when the raise was recorded */
  onRaise: (target: string, amount: number) => Promise<string | null>
  onUndoRaise: (target: string) => void
}

const checkStatusKnown = (s: string) => ['ok', 'problem', 'unproven', 'not-run', 'skipped'].includes(s)
const isMoney = (g?: string) => (g ?? '').trim().toLowerCase() === 'money'
const eur = (v: number) => `€${Math.round(v)}`
/** A missing number is never shown as €0. */
const eurOr = (v: number | undefined) => (typeof v === 'number' ? eur(v) : '—')

export function MonitoringTab(p: Props) {
  const { report, view } = p
  const quotas = report.monitoring?.quotas ?? []
  const cloud = report.monitoring?.cloud
  const [src, setSrc] = useState<string>('systems')
  const [per, setPer] = useState<'week' | 'month'>('week')

  const sys = view.checks.filter((c) => !isMoney(c.group))
  const nOk = sys.filter((c) => c.status === 'ok').length
  const nProb = sys.filter((c) => c.status === 'problem').length
  const nUnp = sys.filter((c) => c.status === 'unproven' || c.status === 'not-run' || !checkStatusKnown(c.status)).length
  const nSkip = sys.filter((c) => c.status === 'skipped').length
  const nMoney = view.checks.filter((c) => isMoney(c.group)).length
  // Only the parts that need the founder are amber; "skipped" is neutral.
  const parts: ReactNode[] = [
    nProb ? <span className="need">{`${nProb} problem${nProb === 1 ? '' : 's'}`}</span> : null,
    nUnp ? <span className="need">{`${nUnp} not proven`}</span> : null,
    nSkip ? `${nSkip} skipped` : null,
  ].filter(Boolean)
  const sysSub = (
    <>
      {parts.length ? <Phrases items={parts} /> : 'nothing needs you'}
      {nMoney > 0 && <span className="d-s2">{`+ ${nMoney} money check${nMoney === 1 ? '' : 's'} under Google Cloud`}</span>}
    </>
  )

  const cards: { k: string; n: string; v: string; s: ReactNode }[] = [
    { k: 'systems', n: 'Systems', v: `${nOk} of ${sys.length} worked`, s: sysSub },
    cloud?.collected
      ? {
          k: 'gcloud',
          n: 'Google Cloud',
          v: `${eurOr(cloud.spent_month_eur)} / ${eurOr(cloud.budget_eur)}`,
          s: cloud.credits ? (
            <Phrases items={[`Credits ~${eur(cloud.credits.amount_eur)}`, cloud.credits.caveat?.split(' (')[0]]} />
          ) : (
            'this month'
          ),
        }
      : { k: 'gcloud', n: 'Google Cloud', v: '—', s: 'not collected yet' },
    ...quotas.map((q) =>
      q.collected
        ? {
            k: `q:${q.id}`,
            n: q.label,
            v: typeof q.remaining_pct === 'number' ? `${q.remaining_pct}% left` : '—',
            s: (
              <span className={q.needs_attention ? 'need' : ''}>
                <Phrases items={[q.verdict, q.window_5h && `5-hour window ${q.window_5h.remaining_pct}% left`]} />
              </span>
            ),
          }
        : { k: `q:${q.id}`, n: q.label, v: '—', s: 'not collected yet' },
    ),
  ]
  const current = cards.find((c) => c.k === src) ?? cards[0]
  const quota = quotas.find((q) => `q:${q.id}` === current.k)

  return (
    <>
      <div className="d-src">
        {cards.map((c) => (
          <button type="button" key={c.k} className="d-srcc" aria-pressed={current.k === c.k} onClick={() => setSrc(c.k)}>
            <span className="d-n">{c.n}</span>
            <span className="d-v">{c.v}</span>
            <span className="d-s">{c.s}</span>
          </button>
        ))}
      </div>
      {current.k === 'systems' ? (
        <Systems view={view} />
      ) : (
        <>
          <div className="d-dhead">
            <h2>{current.n}</h2>
            {(quota ? quota.collected : cloud?.collected) && <Segs per={per} onPer={setPer} />}
          </div>
          {current.k === 'gcloud' ? (
            <>
              <Cloud cloud={cloud} per={per} {...p} />
              <MoneyChecks view={view} />
            </>
          ) : quota ? (
            <Quota q={quota} per={per} />
          ) : null}
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

function Systems({ view }: { view: DayView }) {
  const sys = view.checks.filter((c) => !isMoney(c.group))
  const groups: string[] = []
  for (const c of sys) {
    const g = c.group?.trim() || 'Other'
    if (!groups.includes(g)) groups.push(g)
  }
  if (groups.includes('Other')) groups.push(groups.splice(groups.indexOf('Other'), 1)[0])
  return (
    <>
      <div className="d-dhead">
        <h2>Systems</h2>
        <span className="d-sub">{sys.length} checks</span>
      </div>
      <div className="d-card" data-systems>
        {groups.map((g) => (
          <div className="d-sysg" key={g}>
            <div className="d-sgl">{g}</div>
            {sys
              .filter((c) => (c.group?.trim() || 'Other') === g)
              .map((c) => (
                <CheckRow key={c.id} c={c} />
              ))}
          </div>
        ))}
      </div>
    </>
  )
}

/** The money checks Systems leaves out, so every check appears somewhere in Monitoring. */
function MoneyChecks({ view }: { view: DayView }) {
  const money = view.checks.filter((c) => isMoney(c.group))
  if (!money.length) return null
  return (
    <>
      <h3 className="d-h3">Money checks</h3>
      <div className="d-card d-sysg" data-money-checks>
        {money.map((c) => (
          <CheckRow key={c.id} c={c} />
        ))}
      </div>
    </>
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
              const r = nod || !k.budget_eur ? 0 : (k.spent_eur as number) / k.budget_eur
              const need = nod || r > 0.8
              return (
                <div key={k.id} data-key={k.id}>
                  <button type="button" className="d-keyrow" aria-expanded={open === k.id} disabled={readOnly} onClick={() => toggle(k.id)}>
                    <span className="d-kn">{k.label}</span>
                    <span className={`d-kv ${need ? 'need' : ''}`}>
                      {nod ? 'no data' : `${eur(k.spent_eur as number)}${k.budget_eur !== undefined ? ` of ${eur(k.budget_eur)}` : ''}`}
                    </span>
                    <span className={`d-kbar ${need ? 'need' : ''}`}>
                      <span style={{ width: `${Math.min(100, r * 100)}%` }} />
                    </span>
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

function Quota({ q, per }: { q: DayQuota; per: 'week' | 'month' }) {
  if (!q.collected) {
    return (
      <div className="d-card d-pad">
        <b>{q.label} quota</b> <span className="d-prop">not collected yet</span>
      </div>
    )
  }
  const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null)
  const week = q.week ?? []
  let markerI = week.length - 1
  if (q.resets_at) {
    const wd = new Date(q.resets_at).toLocaleDateString('en-GB', { weekday: 'short' })
    const idx = week.map((p) => p.x).lastIndexOf(wd)
    if (idx >= 0) markerI = idx
  }
  return (
    <>
      {q.window_5h && (
        <div className="d-card d-pad d-win5">
          <div className="d-ct">
            <span>5-hour window</span>
            <span>
              {q.window_5h.remaining_pct}% left{time(q.window_5h.resets_at) ? ` · resets ${time(q.window_5h.resets_at)}` : ''}
            </span>
          </div>
          <div className={`d-qbar ${q.window_5h.remaining_pct < 40 ? 'need' : ''}`}>
            <span style={{ width: `${Math.max(0, Math.min(100, q.window_5h.remaining_pct))}%` }} />
          </div>
        </div>
      )}
      {per === 'week' ? (
        week.length > 0 ? (
          <div className="d-card d-chart">
            <div className="d-ct">
              <span>Remaining this week</span>
              <span>{q.verdict}</span>
            </div>
            <LineChart
              label={`${q.label} remaining this week`}
              xs={week.map((p) => p.x)}
              series={[{ data: week.map((p) => p.remaining) }, { data: week.map((p) => p.projected), dash: true }]}
              max={100}
              fmt={(v) => `${v}%`}
              marker={q.resets_at && week.length ? { i: markerI, label: 'Reset' } : undefined}
            />
            <Legend
              items={[
                { label: 'Remaining', kind: 'solid' },
                { label: 'Projection', kind: 'dash' },
              ]}
            />
          </div>
        ) : (
          <div className="d-card d-pad d-nc">Weekly history not collected yet</div>
        )
      ) : q.month?.length ? (
        <div className="d-card d-chart">
          <div className="d-ct">
            <span>Left at each reset</span>
            <span>{q.month_verdict}</span>
          </div>
          <LineChart
            label={`${q.label} left at each reset`}
            xs={q.month.map((p) => p.x)}
            series={[{ data: q.month.map((p) => p.left_at_reset) }]}
            max={100}
            fmt={(v) => `${v}%`}
          />
        </div>
      ) : (
        <div className="d-card d-pad d-nc">Monthly history not collected yet</div>
      )}
      {q.tip && (
        <div className="d-tip">
          <b>How to use less</b> {q.tip}
        </div>
      )}
    </>
  )
}
