// P1399: Monitoring — money and subscriptions only (every check lives in Daily report › Status).
// Two overview cards (Google Cloud, Subscriptions); the selected one shows its detail below. A
// budget raise is a decision that joins Start fixing.

import { useState } from 'react'
import { capRatio, compareKeyCards, keyCard, type DayBudget, type DayCloud, type DayQuota, type DayReport, type DayView, type KeyState } from '../../lib/day'
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
/** Small key caps (€1–€3) need the cents, or €1.40 of €2 reads as €1 of €2. */
const eurK = (v: number) => (v < 10 && !Number.isInteger(v) ? `€${v.toFixed(2)}` : eur(v))
const STATE_LABEL: Record<KeyState, string> = { spent: 'Spent', unused: 'Unused this month', 'no-spend': 'No spend recorded', unmeasurable: 'Unmeasurable' }
/** Google's enum words (ENFORCED, LIFTED…) in sentence case, like every other label here. */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
/** Google's cap state as-is, plus one line of meaning where we know it. */
const capMeaning = (s: string) => (s === 'CONFIGURED' ? 'set up' : sentence(s))
const CAP_LEGEND = 'Cap set up: Google reports the cap as Configured. That is not proof it stops spend.'
/** A budget's amount: euros, or its own currency named — a foreign amount is never shown as €. */
const amt = (b: DayBudget) => (b.amount_eur !== undefined ? eurK(b.amount_eur) : `amount in ${b.currency ?? 'unknown currency'}`)
const thr = (b: DayBudget) => (typeof b.thresholds === 'number' ? ` · ${b.thresholds} threshold${b.thresholds === 1 ? '' : 's'}` : '')
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
  const notCollected = (
    <div className="d-card d-pad" data-cloud-not-collected>
      <b>Google Cloud spend</b> <span className="d-prop">not collected yet</span>
    </div>
  )
  // budgets and key cards still show when spend collection failed: every card then reads unmeasurable
  if (!cloud || (!cloud.collected && !cloud.budgets?.length && !cloud.keys?.length)) return notCollected
  const wk = per === 'week'
  const pts = (wk ? cloud.week : cloud.month) ?? []
  const pace = pts.map((p, i) => (typeof p.budget_pace === 'number' ? ([i, p.budget_pace] as [number, number]) : null)).filter(Boolean) as [number, number][]
  const hasProj = pts.some((p) => typeof p.projected === 'number')
  const keys = [...(cloud.keys ?? [])].sort(compareKeyCards(cloud))
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k))
  const budgets = cloud.budgets ?? []
  // the account budget shows once: the list row with the same amount merges onto the account card (W7)
  const acctMerged = cloud.budget_eur !== undefined ? budgets.find((b) => b.kind === 'account' && b.amount_eur === cloud.budget_eur) : undefined
  const accountRows = budgets.filter((b) => b.kind === 'account' && b !== acctMerged)
  const anyConfigured = budgets.some((b) => b.kind === 'key-cap' && b.cap_state === 'CONFIGURED') || (cloud.keys ?? []).some((k) => k.cap_state === 'CONFIGURED')
  const alarms = budgets.filter((b) => b.kind === 'alarm')
  // a cap/alert row whose key is not among the cards still has to show somewhere
  const unmatched = budgets.filter((b) => b.kind === 'unmatched' || ((b.kind === 'key-cap' || b.kind === 'key-alert') && !keys.some((k) => k.id === b.key_id)))
  // rows not of a known kind cannot occur (the parser drops them); every row lands in exactly one place
  // only a report that lists budgets (or key cap facts) can say "No cap"; an older report stays silent
  const cardsKnown = Array.isArray(cloud.budgets) || keys.some((k) => k.cap_state !== undefined || k.alert_budget_eur !== undefined)

  return (
    <>
      {!cloud.collected && notCollected}
      {cloud.collected && pts.length > 0 && (
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
      {cloud.collected && cloud.credits && (
        <div className="d-credits">
          Credits <b>~{eur(cloud.credits.amount_eur)}</b>
          {cloud.credits.caveat ? ` · ${cloud.credits.caveat}` : ''}
        </div>
      )}
      {(cloud.budget_eur !== undefined || accountRows.length > 0) && <h3 className="d-h3">Account budget</h3>}
      {cloud.budget_eur !== undefined && (
        <>
          <button
            type="button"
            className="d-acctrow"
            aria-expanded={open === 'account'}
            disabled={readOnly}
            onClick={() => toggle('account')}
          >
            <span>
              Account budget {eur(cloud.budget_eur)}/month
              {acctMerged && (
                <span className="d-acctsub" data-budget={acctMerged.name}>
                  {`${acctMerged.name}${thr(acctMerged)}`}
                </span>
              )}
            </span>
            {!readOnly && <span className="d-go">Raise ›</span>}
          </button>
          {open === 'account' && <Raise target="account" current={cloud.budget_eur} view={view} onRaise={onRaise} onUndoRaise={onUndoRaise} />}
        </>
      )}
      {accountRows.length > 0 && <BudgetRows rows={accountRows} section="account" />}
      {alarms.length > 0 && (
        <>
          <h3 className="d-h3">Alarms</h3>
          <BudgetRows rows={alarms} section="alarm" />
        </>
      )}
      {keys.length > 0 && (
        <>
          <h3 className="d-h3">
            <span>AI prepaid key cards ·</span> <span className="d-nowrap">closest to limit first</span>
          </h3>
          {cardsKnown && anyConfigured && (
            <p className="d-klegend" data-cap-legend>
              {CAP_LEGEND}
            </p>
          )}
          <div className="d-card" data-section="keys">
            {keys.map((k) => {
              const c = keyCard(cloud, k)
              const spent = c.state === 'spent'
              const r = spent ? capRatio(cloud, k) : 0
              const need = !spent || r > 0.8
              const metaId = `d-kmeta-${k.id}`
              return (
                <div key={k.id} data-key={k.id} data-state={c.state}>
                  <button
                    type="button"
                    className="d-keyrow"
                    aria-expanded={open === k.id}
                    aria-describedby={cardsKnown ? metaId : undefined}
                    disabled={readOnly}
                    onClick={() => toggle(k.id)}
                  >
                    <span className="d-kn">{k.label}</span>
                    {spent ? (
                      <span className={`d-kv ${need ? 'need' : ''}`}>{`${eurK(k.spent_eur as number)}${c.cap_eur !== undefined ? ` of ${eurK(c.cap_eur)}` : ' · no cap'}`}</span>
                    ) : (
                      <span className="d-kv">{c.cap_eur !== undefined ? `cap ${eurK(c.cap_eur)}` : ''}</span>
                    )}
                    {/* a track only where it is true: measured spend, or a measured zero, against a cap.
                        Unmeasurable, no-spend-recorded and no-cap cards show their state instead (QA pass 2). */}
                    {c.cap_eur !== undefined && (spent || c.state === 'unused') && (
                      <span className={`d-kbar ${spent && need ? 'need' : ''}`} data-track={spent ? 'spend' : 'zero'}>
                        <span style={{ width: spent ? `${Math.min(100, r * 100)}%` : '0%' }} />
                      </span>
                    )}
                    <span className="d-kwhy">
                      <span className={`d-kstate ${c.state === 'spent' || c.state === 'unused' ? '' : 'need'}`} data-kstate={c.state}>
                        {STATE_LABEL[c.state]}
                      </span>
                      {!spent && c.why && <span className={c.state === 'unused' ? '' : 'need'}>{c.why}</span>}
                      {!readOnly && <span className="d-go">Raise ›</span>}
                    </span>
                  </button>
                  {cardsKnown && (
                    <div className="d-kmeta" id={metaId}>
                      {c.cap_rows.length === 0 ? (
                        c.cap_unknown ? (
                          <span data-cap="unknown" className="d-kstate need">{`Cap state unknown${k.cap_note ? `: ${k.cap_note}` : ''}`}</span>
                        ) : (
                          <span data-cap={c.has_cap ? 'set' : 'none'} className={c.has_cap ? '' : 'd-kstate need'}>
                            {c.has_cap ? `Cap: ${c.cap_state ? capMeaning(c.cap_state) : 'state not reported'}` : 'No cap'}
                          </span>
                        )
                      ) : (
                        c.cap_rows.map((b, i) => (
                          <span data-cap="set" data-budget={b.name} key={`cap-${i}`} title={b.cap_state === 'CONFIGURED' ? CAP_LEGEND : undefined}>
                            {`Cap ${amt(b)} (${b.name}): ${b.cap_state ? capMeaning(b.cap_state) : 'state not reported'}`}
                          </span>
                        ))
                      )}
                      {c.cap_mismatch && (
                        <span className="need" data-cap-mismatch>{`Cap row ${eurK(c.cap_eur as number)} ≠ recorded budget ${eurK(c.recorded_budget_eur as number)}`}</span>
                      )}
                      {c.alert_mismatch && (
                        <span className="need" data-alert-mismatch>{`Alert row ${eurK(c.alert_eur as number)} ≠ recorded alert ${eurK(c.recorded_alert_eur as number)}`}</span>
                      )}
                      {c.alert_rows.length === 0 ? (
                        <span data-alert={c.alert_eur !== undefined ? 'set' : 'none'}>{c.alert_eur !== undefined ? `Alert budget ${eurK(c.alert_eur)}` : 'No alert budget'}</span>
                      ) : (
                        c.alert_rows.map((b, i) => (
                          <span data-alert="set" data-budget={b.name} key={`alert-${i}`}>{`Alert budget ${amt(b)} (${b.name})`}</span>
                        ))
                      )}
                    </div>
                  )}
                  {open === k.id && <Raise target={k.id} current={c.cap_eur} view={view} onRaise={onRaise} onUndoRaise={onUndoRaise} />}
                </div>
              )
            })}
          </div>
        </>
      )}
      {unmatched.length > 0 && (
        <>
          <h3 className="d-h3">Unmatched budgets</h3>
          <BudgetRows rows={unmatched} section="unmatched" />
        </>
      )}
    </>
  )
}

/** Budget rows shown by display name and amount only — never a project id or filter. */
function BudgetRows({ rows, section }: { rows: DayBudget[]; section: string }) {
  return (
    <div className="d-card" data-section={section}>
      {rows.map((b, i) => (
        <div className="d-brow" key={`${b.name}-${i}`} data-budget={b.name}>
          <span className="d-kn">{b.name}</span>
          <span className="d-kv">{`${amt(b)}/month${thr(b)}`}</span>
          {b.why && <span className="d-kmeta">{b.why}</span>}
        </div>
      ))}
    </div>
  )
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
      {/* P955: no disabled Add as decoration — it appears once the amount is valid */}
      {valid && (
        <button
          type="button"
          className="d-btn sm"
          onClick={async () => {
            const e = await onRaise(target, n)
            if (e) setErr(e === 'conflict' ? tooLowMsg : e)
          }}
        >
          Add
        </button>
      )}
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
