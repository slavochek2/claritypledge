// P1552: the Token usage pane of Monitoring. One chart (output per period by model, with the
// usual-level line), four readings, and the 28-day project list. Output is shown as ACTIVITY.
// [FOUNDER DECISION: wording] — the label strings below are drafts; the founder owns the final text.

import type { DayTokens } from '../../lib/day'
import { Legend, LineChart } from './charts'
import { FAMILY_COLOUR, FAMILY_ORDER, fmtTokens, periodLabel, tokenReadings, totalOf, type Per } from './tokens'

const WORDS = {
  title: 'Output written by models', // [FOUNDER DECISION: wording]
  daysLabel: 'Days in use', // [FOUNDER DECISION: wording]
  opusLabel: 'Opus share of Claude output', // [FOUNDER DECISION: wording]
  ctxLabel: 'Average context per reply', // [FOUNDER DECISION: wording]
  ctxHint: 'bigger means longer sessions', // [FOUNDER DECISION: wording]
  vsLabel: (per: Per) => `Output written, last full ${per}`, // [FOUNDER DECISION: wording]
  projects: 'Where the output went, last 28 days', // [FOUNDER DECISION: wording]
}

const dash = '—'

export function TokenUsage({ tokens, per }: { tokens?: DayTokens; per: Per }) {
  // the pane keeps its height when there is nothing to show
  if (!tokens || !tokens.collected) {
    return (
      <div className="d-card d-pad d-tk-empty" data-tokens-not-collected>
        <b>Token usage</b> <span className="d-prop">not collected yet</span>
      </div>
    )
  }
  const list = per === 'week' ? tokens.weeks : tokens.months
  if (list.length === 0 && tokens.projects_28d.length === 0) {
    return (
      <div className="d-card d-pad d-tk-empty" data-tokens-empty>
        <b>Token usage</b> <span className="d-prop">no usage in the local logs yet</span>
      </div>
    )
  }
  const r = tokenReadings(tokens, per)
  const families = FAMILY_ORDER.filter((f) => list.some((p) => (p.output[f] ?? 0) > 0))
  const M = (n: number) => Math.round((n / 1e6) * 100) / 100
  // Total first (slate), then one line per family that has output in this view. Zero is a value, not a gap.
  const series = [
    { name: 'All models', data: list.map((p) => M(totalOf(p))) },
    ...families.map((f) => ({ name: f, colour: FAMILY_COLOUR[f], data: list.map((p) => M(p.output[f] ?? 0)) })),
  ]
  const usual = list.map((p, i) => (p.median4 ? ([i, M(p.median4)] as [number, number]) : null)).filter(Boolean) as [number, number][]
  const outOf = (n: number | undefined) => (n === undefined ? dash : `${n} of ${r.length}`)
  const vs =
    r.vsUsual === null ? 'no baseline yet' : r.vsUsual === 0 ? 'same as usual' : `${r.vsUsual > 0 ? '+' : '−'}${Math.abs(r.vsUsual)}% vs usual`

  return (
    <div data-tokens-pane>
      {list.length > 0 && (
        <div className="d-card d-chart">
          <div className="d-ct">
            <span>{WORDS.title}, per {per}</span>
            <span>{tokens.as_of ? `to ${periodLabel(tokens.as_of)}` : ''}</span>
          </div>
          <LineChart
            label={`${WORDS.title} per ${per}`}
            xs={list.map((p) => periodLabel(p.p))}
            series={series}
            target={usual.length > 1 ? usual : undefined}
            fmt={(v) => `${v}M`}
          />
          <Legend
            items={[
              { label: 'All models', kind: 'solid' },
              ...families.map((f) => ({ label: f, kind: 'solid' as const, colour: FAMILY_COLOUR[f] })),
              ...(usual.length > 1 ? [{ label: 'Usual (median of the 4 before)', kind: 'target' as const }] : []),
            ]}
          />
        </div>
      )}
      <div className="d-tk-reads">
        <div className="d-card d-pad d-tk-read" data-reading="days">
          <span className="d-n">{WORDS.daysLabel}</span>
          <b>{r.last ? `Claude ${outOf(r.days.claude)}` : dash}</b>
          <b>{r.last ? `Codex ${outOf(r.days.codex)}` : ''}</b>
        </div>
        <div className="d-card d-pad d-tk-read" data-reading="opus">
          <span className="d-n">{WORDS.opusLabel}</span>
          <b>{r.opusShare === null ? dash : `${r.opusShare}%`}</b>
        </div>
        <div className="d-card d-pad d-tk-read" data-reading="ctx">
          <span className="d-n">{WORDS.ctxLabel}</span>
          <b>{r.ctx === null ? dash : fmtTokens(r.ctx)}</b>
          <span className="d-s">{WORDS.ctxHint}</span>
        </div>
        <div className="d-card d-pad d-tk-read" data-reading="vs">
          <span className="d-n">{WORDS.vsLabel(per)}</span>
          <b>{r.total === null ? dash : fmtTokens(r.total)}</b>
          <span className="d-s">{r.total === null ? '' : vs}</span>
        </div>
      </div>
      {tokens.projects_28d.length > 0 && (
        <div className="d-card d-pad" data-tokens-projects>
          <div className="d-ct">
            <span>{WORDS.projects}</span>
          </div>
          <ul className="d-tk-proj">
            {tokens.projects_28d.map((p) => (
              <li key={p.project} className={p.project === 'all others' ? 'other' : ''}>
                <span className="d-tk-name" title={p.project}>{p.project}</span>
                <span className="d-tk-bar" aria-hidden="true"><i style={{ width: `${Math.max(1, Math.round(p.share * 100))}%` }} /></span>
                <span className="d-tk-val">{fmtTokens(p.output)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
