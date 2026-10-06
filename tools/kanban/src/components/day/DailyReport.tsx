// P1399: Daily report — the Status panel (connections, new people, every check) and the Issues
// flow, one card at a time. Paging lives in the shell's bottom bar; this file renders and
// reports clicks.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { OWN, daysOpen, type ConnectionView, type DayReport, type DayView, type IssueView } from '../../lib/day'
import { CheckRow, Phrases, StatusIcon } from './status'
import { checkStatus, connectionStatus, needsYou } from './statusWords'
import { safeUrl } from './api'
import { NewPeople } from './People'

/** Phase D: the pager walks the founder's cards; the cards an agent can fix are one line away. */
export interface AgentWork {
  /** how many agent cards there are */
  count: number
  /** the pager is on the agent cards */
  showing: boolean
  /** there are founder cards to go back to */
  canGoBack: boolean
  onReview: () => void
  onBack: () => void
}

interface Props {
  report: DayReport
  view: DayView
  readOnly: boolean
  /** the cards the pager walks now: the founder's, or the agent work after Review */
  issues: IssueView[]
  index: number
  agent: AgentWork
  /** open the card for this fingerprint, whichever set it is in */
  onJump: (fp: string) => void
  /** the option shown selected ('' = none): optimistic click, the custom answer, the written decision, else the recommended one */
  selected: (issue: IssueView) => string
  draftOf: (issue: IssueView) => string
  onChoose: (issue: IssueView, optionId: string) => void
  onDraft: (issue: IssueView, text: string) => void
  onDraftBlur: (issue: IssueView) => void
  /** bumped each time the custom answer is picked: focus its box */
  ownFocus: number
  onFix: (c: ConnectionView) => void
  onUndoFix: (c: ConnectionView) => void
  onBringBack: (fp: string) => void
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function DailyReport(p: Props) {
  const { view, readOnly } = p
  const broken = view.connections.filter((c) => c.state !== 'ok')
  const settled = broken.every((c) => c.fix_queued)
  const [force, setForce] = useState(false)
  const [stripOpen, setStripOpen] = useState(false)
  const collapsed = settled && !force

  const jump = (fp: string) => {
    p.onJump(fp)
    setStripOpen(false)
  }

  return (
    <div className={`d-rgrid ${collapsed ? 'collapsed' : ''}`}>
      {collapsed ? (
        <StatusLine
          view={view}
          report={p.report}
          onOpen={() => {
            setForce(true)
            setStripOpen(true)
          }}
        />
      ) : (
        <StatusPanel
          {...p}
          canCollapse={settled}
          onCollapse={() => {
            setForce(false)
            setStripOpen(false)
          }}
          stripOpen={stripOpen}
          onStrip={() => setStripOpen((o) => !o)}
          onJump={jump}
        />
      )}
      <section className="d-issues" aria-label="Issues">
        <IssueCard {...p} />
        <Parked view={view} readOnly={readOnly} onBringBack={p.onBringBack} />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------------------
// Status

function unpushed(report: DayReport) {
  const n = report.unpushed_commits
  return typeof n === 'number' ? plural(n, 'unpushed commit') : null
}

function StatusLine({ view, report, onOpen }: { view: DayView; report: DayReport; onOpen: () => void }) {
  const queued = view.connections.filter((c) => c.state !== 'ok' && c.fix_queued).length
  const toIssues = view.counts.to_issues
  const newPeople = report.people?.length ?? 0
  const lead = queued ? (
    <b>{plural(queued, 'connection fix', 'connection fixes')} in Start fixing</b>
  ) : (
    <>
      <span className="ok">✓</span> <b>All connected</b>
    </>
  )
  return (
    <button type="button" className="d-sline" aria-expanded="false" onClick={onOpen}>
      <span className="d-tri">▶</span>
      <span className="d-tx">
        <Phrases
          items={[
            lead,
            `${view.counts.worked} worked`,
            newPeople ? `${newPeople} new ${newPeople === 1 ? 'person' : 'people'}` : null,
            toIssues ? `${plural(toIssues, 'check')} → in Issues` : null,
            unpushed(report),
          ]}
        />
      </span>
    </button>
  )
}

interface PanelProps extends Props {
  canCollapse: boolean
  onCollapse: () => void
  stripOpen: boolean
  onStrip: () => void
  onJump: (fp: string) => void
}

function StatusPanel({ report, view, readOnly, canCollapse, onCollapse, stripOpen, onStrip, onJump, onFix, onUndoFix }: PanelProps) {
  const [passOpen, setPassOpen] = useState(false)
  const broken = view.connections.filter((c) => c.state !== 'ok')
  const bad = view.checks.filter((c) => needsYou(c.status))
  const skipped = view.checks.filter((c) => c.status === 'skipped')
  const good = view.checks.filter((c) => c.status === 'ok')
  // A check a broken connection explains is not a second thing to do: the connection carries it.
  const need = broken.filter((c) => !c.fix_queued).length + bad.filter((c) => !c.covered_by).length
  const newPeople = report.people?.length ?? 0
  const issueFps = new Set(view.issues.map((i) => i.fp))
  const connLabel = (id: string) => view.connections.find((c) => c.id === id)?.label ?? id
  const sum = (withNew: boolean) => (
    <Phrases
      items={[
        `${good.length} worked`,
        need > 0 && <span className="d-needtx">{need} need you</span>,
        withNew && newPeople > 0 && `${newPeople} new`,
      ]}
    />
  )

  return (
    <aside className="d-status" aria-label="Status">
      <button type="button" className="d-strip" aria-expanded={stripOpen} onClick={onStrip}>
        <span className="d-tri">▶</span>
        <b>Status</b>
        <span className="d-sum">{sum(true)}</span>
      </button>
      <div className={`d-spanel ${stripOpen ? 'open' : ''}`}>
        <div className={`d-sh ${canCollapse ? 'can' : ''}`}>
          <span className="d-shtitle">Status</span>
          {canCollapse && (
            <button type="button" className="d-link d-tap" onClick={onCollapse}>
              Collapse
            </button>
          )}
        </div>
        <div className="d-sum2">{sum(false)}</div>
        {unpushed(report) && <div className="d-unp">{unpushed(report)}</div>}

        {broken.length > 0 ? (
          <>
            <div className="d-sgl">Connections</div>
            {broken.map((c) => (
              <ConnectionRow key={c.id} c={c} readOnly={readOnly} onFix={onFix} onUndo={onUndoFix} />
            ))}
          </>
        ) : (
          <div className="d-srow">
            <span className="d-ic ok">✓</span>
            <span className="d-tx">
              <b>All connected</b>
            </span>
          </div>
        )}

        <NewPeople people={report.people} />

        {bad.length > 0 && <div className="d-sgl">Checks · {view.checks.length}</div>}
        {bad.map((c) => {
          const s = checkStatus(c.status)
          const target = c.issue_fp && issueFps.has(c.issue_fp) ? c.issue_fp : null
          const body = (
            <>
              <StatusIcon status={c.status} hideWord />
              <span className="d-tx">
                <b>{c.label}</b>
                <span className="d-w">
                  <span className="d-word need" data-status-word>
                    {s.word}
                  </span>
                  {c.detail ? ` · ${c.detail}` : ''}
                  {c.covered_by ? ` · see ${connLabel(c.covered_by)}` : ''}
                </span>
              </span>
            </>
          )
          return target && !c.covered_by ? (
            <button type="button" key={c.id} className="d-srow d-sbtn" data-check={c.id} onClick={() => onJump(target)}>
              {body}
              <span className="d-go" aria-hidden="true">
                ›
              </span>
            </button>
          ) : (
            <div key={c.id} className="d-srow" data-check={c.id}>
              {body}
            </div>
          )
        })}
        {skipped.map((c) => (
          <CheckRow key={c.id} c={c} />
        ))}
        <button type="button" className="d-sfold" aria-expanded={passOpen} onClick={() => setPassOpen((o) => !o)}>
          <span className="d-tri">▶</span>Worked ({good.length})
        </button>
        {passOpen && (
          <div className="d-plist">
            {good.map((c) => (
              <div key={c.id} data-check={c.id}>
                <StatusIcon status={c.status} /> {c.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function ConnectionRow({ c, readOnly, onFix, onUndo }: { c: ConnectionView; readOnly: boolean; onFix: (c: ConnectionView) => void; onUndo: (c: ConnectionView) => void }) {
  const s = connectionStatus(c.state)
  const url = safeUrl(c.fix_url)
  if (c.fix_queued) {
    return (
      <div className="d-srow" data-connection={c.id}>
        <span className="d-ic dnr" aria-hidden="true">
          →
        </span>
        <span className="d-tx">
          <b>{c.label}</b>
          <span className="d-w">Fix in Start fixing</span>
          {!readOnly && (
            <span className="d-plinks">
              {url && (
                <a className="d-link sm d-tap" href={url} target="_blank" rel="noopener noreferrer">
                  Open sign-in again
                </a>
              )}
              <button type="button" className="d-link sm d-tap" onClick={() => onUndo(c)}>
                Undo
              </button>
            </span>
          )}
        </span>
      </div>
    )
  }
  return (
    <div className="d-srow" data-connection={c.id}>
      <span className={`d-ic ${s.cls}`} title={s.word}>
        <span aria-hidden="true">{s.icon}</span>
        <span className="d-sr">{s.word}</span>
      </span>
      <span className="d-tx">
        <b>{c.label}</b>
        <span className="d-w">{c.why ?? s.word.toLowerCase()}</span>
      </span>
      {!readOnly &&
        (url ? (
          <a className="d-btn xs" href={url} target="_blank" rel="noopener noreferrer" onClick={() => onFix(c)}>
            Fix
          </a>
        ) : (
          <button type="button" className="d-btn xs" onClick={() => onFix(c)}>
            Fix
          </button>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------------------
// Issue card

const reviewLabel = (r: string) => (r === 'weekly' ? 'Weekly review' : 'Monthly review')

function firstSeen(issue: IssueView, runStartedAt: string): string {
  if (!issue.first_seen) return 'Not known'
  const days = daysOpen(issue.first_seen, runStartedAt)
  const ago = days === null ? null : days === 0 ? 'today' : `${plural(days, 'day')} ago`
  return [shortDate(issue.first_seen), ago].filter(Boolean).join(' · ')
}

function IssueCard(p: Props) {
  const { report, readOnly, issues, agent } = p
  const [moreOpen, setMoreOpen] = useState<Record<string, boolean>>({})
  const focusRef = useRef<HTMLTextAreaElement | null>(null)
  const issue = issues[Math.min(p.index, issues.length - 1)]
  const sel = issue ? p.selected(issue) : null

  // Focus the custom answer's box only when it is picked — never when paging lands here.
  useEffect(() => {
    if (p.ownFocus) focusRef.current?.focus({ preventScroll: true })
  }, [p.ownFocus])

  const agentRow = agent.showing ? (
    <div className="d-aline" data-agent-pager>
      <span>
        Agent work · {Math.min(p.index, issues.length - 1) + 1} of {issues.length}
      </span>
      {agent.canGoBack && (
        <button type="button" className="d-link d-tap" onClick={agent.onBack}>
          Back to yours
        </button>
      )}
    </div>
  ) : agent.count > 0 ? (
    <div className="d-aline" data-agent-line>
      <span>
        {plural(agent.count, 'thing')} an agent can fix — they go with Start fixing ·{' '}
        <button type="button" className="d-link d-tap" onClick={agent.onReview}>
          Review
        </button>
      </span>
    </div>
  ) : null

  if (!issue) {
    return (
      <>
        {agentRow}
        <div className="d-card d-row">
          <span className="d-ic ok">✓</span>
          <b>No issues today</b>
        </div>
      </>
    )
  }

  const days = daysOpen(issue.first_seen, report.started_at)
  const more = !!moreOpen[issue.fp]
  const name = `opt-${issue.fp}`
  const fit = issue.recommendation_confidence
  const fitRated = typeof fit === 'number'
  // A saved custom answer shows on an earlier (read-only) run too, as text.
  const ownText = p.draftOf(issue)
  const showOwnRow = !readOnly || issue.decision?.option_id === OWN

  const option = (value: string, inner: ReactNode, n?: number, below?: ReactNode) => (
    <div className="d-opt" key={value} data-option={value}>
      <label className="d-optrow">
        {readOnly && <span className={`d-rodot ${sel === value ? 'on' : ''}`} aria-hidden="true" />}
        <input
          type="radio"
          name={name}
          value={value}
          checked={sel === value}
          disabled={readOnly}
          onChange={() => p.onChoose(issue, value)}
          // Clicking the answer that is already selected is no change event; it still accepts it
          // (the last card has no Next). `sel` is the value before this click.
          onClick={() => {
            if (sel === value && value !== OWN && !issue.decision) p.onChoose(issue, value)
          }}
        />
        <span className="d-obody">{inner}</span>
        {n !== undefined && n <= 9 && !readOnly && (
          <kbd className="d-key" aria-hidden="true">
            {n}
          </kbd>
        )}
      </label>
      {below}
    </div>
  )

  const ownBox =
    sel === OWN ? (
      readOnly ? (
        <div className="d-ownro" data-own-text>
          {ownText}
        </div>
      ) : (
        <textarea
          ref={focusRef}
          className="d-ftxt"
          maxLength={2000}
          aria-label="Your answer or question"
          placeholder="Ending with ? makes it a question the agent answers first"
          value={ownText}
          onChange={(e) => p.onDraft(issue, e.target.value)}
          onBlur={() => p.onDraftBlur(issue)}
        />
      )
    ) : null

  return (
    <>
      {agentRow}
      <article className="d-card d-focus" data-issue={issue.fp}>
        <div className="d-ihead">
          <span className="d-topic">
            {issue.review && <span className="d-runbadge sm">{reviewLabel(issue.review)}</span>}
            <span>{issue.topic}</span>
          </span>
          <span className="d-pills">
            {issue.came_back && <span className="d-back">Came back</span>}
            {issue.evidence && <span className="d-cause">{issue.evidence === 'verified' ? 'Cause checked' : 'Cause suspected'}</span>}
            {issue.urgent && <span className="d-pill urg">Urgent</span>}
            {issue.important && <span className="d-pill imp">Important</span>}
            {days ? <span className="d-age">{plural(days, 'day')}</span> : null}
          </span>
        </div>
        {issue.answered_before && (
          <div className="d-before" data-answered-before>
            You answered on {shortDate(issue.answered_before.at)}: {issue.answered_before.label}. Still reported.
          </div>
        )}
        <h2>{issue.title}</h2>
        <dl className="d-abc">
          <div>
            <dt>Point A</dt>
            <dd>{issue.point_a}</dd>
          </div>
          <div>
            <dt>Obstacle</dt>
            <dd>{issue.obstacle}</dd>
          </div>
          <div>
            <dt>Point B</dt>
            <dd>{issue.point_b}</dd>
          </div>
        </dl>
        <button type="button" className="d-morebtn" aria-expanded={more} onClick={() => setMoreOpen((m) => ({ ...m, [issue.fp]: !more }))}>
          <span className="d-tri">▶</span>More info
        </button>
        {more && (
          <dl className="d-moreinfo">
            {issue.options[issue.recommended_index]?.why && (
              <div>
                <dt>Why recommended</dt>
                <dd>{issue.options[issue.recommended_index].why}</dd>
              </div>
            )}
            <div>
              <dt>First seen</dt>
              <dd>{firstSeen(issue, report.started_at)}</dd>
            </div>
            {issue.source && (
              <div>
                <dt>Source</dt>
                <dd>{issue.source}</dd>
              </div>
            )}
            {issue.evidence_text && (
              <div>
                <dt>What the check found</dt>
                <dd>{issue.evidence_text}</dd>
              </div>
            )}
            {issue.more_info && (
              <div>
                <dt>Details</dt>
                <dd>{issue.more_info}</dd>
              </div>
            )}
            {issue.technical && (
              <div>
                <dt>Technical detail</dt>
                <dd className="d-tech" data-technical>
                  <span>
                    <b>Title</b> {issue.technical.title}
                  </span>
                  <span>
                    <b>Point A</b> {issue.technical.point_a}
                  </span>
                  <span>
                    <b>Obstacle</b> {issue.technical.obstacle}
                  </span>
                  <span>
                    <b>Point B</b> {issue.technical.point_b}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        )}
        {readOnly && !issue.decision && <div className="d-unanswered">Not answered on this run</div>}
        <div className={`d-opts ${readOnly ? 'ro' : ''}`} role="radiogroup" aria-label="Options">
          {issue.options.map((o, i) =>
            option(
              o.id,
              <>
                <span className="d-l">{o.label}</span>
                {i === issue.recommended_index && (
                  <span className={`d-rec ${fitRated ? '' : 'dim'}`}>{fitRated ? `Recommended · Fit ${fit}%` : 'Recommended · Fit not rated'}</span>
                )}
                {i === issue.recommended_index && issue.risk && <span className="d-risk">Main risk: {issue.risk}</span>}
              </>,
              i + 1,
            ),
          )}
          {showOwnRow && option(OWN, <span className="d-l">Your answer or question…</span>, issue.options.length + 1, ownBox)}
        </div>
      </article>
    </>
  )
}

function Parked({ view, readOnly, onBringBack }: { view: DayView; readOnly: boolean; onBringBack: (fp: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!view.parked.length) return null
  return (
    <div className="d-card d-parked">
      <button type="button" className="d-fold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="d-tri">▶</span>Parked ({view.parked.length})
      </button>
      {open &&
        view.parked.map((x) => (
          <div className="d-row" key={x.fp} data-parked={x.fp}>
            <span className="d-tx">
              <span className="d-ptitle">{x.title}</span>
              <span className="d-w">
                parked {shortDate(x.parked.at)}
                {x.parked.text ? ` · ${x.parked.text}` : ''}
              </span>
            </span>
            {!readOnly && (
              <button type="button" className="d-link d-tap" onClick={() => onBringBack(x.fp)}>
                Bring back
              </button>
            )}
          </div>
        ))}
    </div>
  )
}
