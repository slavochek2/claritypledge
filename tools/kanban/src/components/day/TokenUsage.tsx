// P1552: the Token usage pane of Monitoring. One stacked-bar chart (output per period by model, the
// total above each bar, the usual level as a dashed tick), three readings, and the 28-day project
// list. Output is shown as ACTIVITY, never cost or productivity.
// [FOUNDER DECISION: wording] — the label strings below are drafts; the founder owns the final text.

import type { DayTokens } from '../../lib/day'
import { StackedBars } from './charts'
import { FAMILY_COLOUR, FAMILY_ORDER, fmtTokens, periodLabel, TOOL_COLOUR, TOOL_LABEL, tokenReadings, tokensEmpty, totalOf, type Per } from './tokens'

const WORDS = {
  title: 'Output written by models', // [FOUNDER DECISION: wording]
  daysLabel: 'Days in use', // [FOUNDER DECISION: wording]
  shareLabel: (per: Per) => `Which model does the work, last full ${per}`, // [FOUNDER DECISION: wording]
  ctxLabel: 'Average context per reply', // [FOUNDER DECISION: wording]
  ctxHint: 'bigger means longer sessions', // [FOUNDER DECISION: wording]
  usual: 'Usual (median of the 4 before)', // [FOUNDER DECISION: wording]
  projects: 'Where the output went, last 28 days', // [FOUNDER DECISION: wording]
  none: 'no usage yet', // [FOUNDER DECISION: wording]
  noPeriod: (per: Per) => `no full ${per} yet`, // [FOUNDER DECISION: wording]
  geminiNote: 'Gemini output is not logged, so Gemini is counted in calls and is not in the bars', // [FOUNDER DECISION: wording]
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
  // same words as the source card; "empty" means empty in BOTH periods and the project list, never just this view
  if (tokensEmpty(tokens)) {
    return (
      <div className="d-card d-pad d-tk-empty" data-tokens-empty>
        <b>Token usage</b> <span className="d-prop">{WORDS.none}</span>
      </div>
    )
  }
  const list = per === 'week' ? tokens.weeks : tokens.months
  const r = tokenReadings(tokens, per)
  const stacks = list.map((p) => ({
    label: periodLabel(p.p),
    total: totalOf(p),
    usual: p.median4 != null ? p.median4 : null,
    segments: FAMILY_ORDER.map((f) => ({ key: f, value: p.output[f] ?? 0, colour: FAMILY_COLOUR[f] })),
  }))
  const usualText =
    r.usualZero ? (r.total === 0 ? 'same as usual' : 'usual is 0') : r.ratio === null ? 'no baseline yet' : `${r.ratio.toFixed(1)}× usual`
  const summary = r.total === null ? '' : [`${fmtTokens(r.total)} last full ${per}`, usualText].join(' · ')
  // only the tools with days in use are listed: no "Codex 0 of 7" when there is no Codex data
  const toolDays = (['claude', 'codex', 'gemini'] as const).filter((t) => (r.days[t] ?? 0) > 0)
  const daysKnown = Object.values(r.days).some((v) => v !== undefined)
  const maxShare = Math.max(0.0001, ...tokens.projects_28d.map((p) => p.share))

  return (
    <div data-tokens-pane>
      {list.length === 0 && (
        <div className="d-card d-pad d-tk-empty" data-tokens-no-period>
          <span className="d-prop">{WORDS.noPeriod(per)}</span>
        </div>
      )}
      {list.length > 0 && (
        <div className="d-card d-chart">
          <div className="d-ct">
            <span>{WORDS.title}, per {per}</span>
            <span data-tokens-summary>{summary}</span>
          </div>
          <StackedBars stacks={stacks} fmt={fmtTokens} label={`${WORDS.title} per ${per}`} usualLabel={WORDS.usual} />
        </div>
      )}
      <div className="d-tk-reads">
        <div className="d-card d-pad d-tk-read" data-reading="days">
          <span className="d-n">{WORDS.daysLabel}</span>
          {toolDays.length > 0 ? (
            <div className="d-tk-strip">
              {toolDays.map((t) => (
                <div key={t} data-day-row={t}>
                  <span>{TOOL_LABEL[t]}</span>
                  <b style={{ color: TOOL_COLOUR[t] }}>{r.days[t]} of {r.length}</b>
                </div>
              ))}
            </div>
          ) : (
            <b>{r.last && daysKnown ? 'none' : dash}</b>
          )}
        </div>
        <div className="d-card d-pad d-tk-read" data-reading="share">
          <span className="d-n">{WORDS.shareLabel(per)}</span>
          {r.shares.length === 0 ? (
            <b>{dash}</b>
          ) : (
            <>
              <div className="d-tk-share" role="img" aria-label={r.shares.map((s) => `${s.family} ${s.pct}%`).join(', ')}>
                {r.shares.map((s) => (
                  <i key={s.family} style={{ width: `${(s.value / (r.total || 1)) * 100}%`, background: FAMILY_COLOUR[s.family] }} title={`${s.family} ${s.pct}%`} />
                ))}
              </div>
              <div className="d-tk-sharekey">
                {r.shares.map((s) => (
                  <span key={s.family}><i style={{ background: FAMILY_COLOUR[s.family] }} />{s.family} {s.pct}%</span>
                ))}
              </div>
              <span className="d-s" data-share-caption>
                {r.mover ? `Biggest change vs usual: ${r.mover.family} ${r.mover.from}% → ${r.mover.to}%` : 'no baseline yet'}
              </span>
            </>
          )}
          {r.geminiCalls !== null && (
            <span className="d-tk-gem" data-gemini style={{ color: TOOL_COLOUR.gemini }} title={WORDS.geminiNote}>
              Gemini: {r.geminiCalls} {r.geminiCalls === 1 ? 'call' : 'calls'}
            </span>
          )}
        </div>
        <div className="d-card d-pad d-tk-read" data-reading="ctx">
          <span className="d-n">{WORDS.ctxLabel}</span>
          <b>{r.ctx === null ? dash : fmtTokens(r.ctx)}</b>
          <span className="d-s">{WORDS.ctxHint}</span>
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
                <span className="d-tk-bar" aria-hidden="true"><i style={{ width: `${Math.max(1, Math.round((p.share / maxShare) * 100))}%` }} /></span>
                <span className="d-tk-val">{fmtTokens(p.output)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
