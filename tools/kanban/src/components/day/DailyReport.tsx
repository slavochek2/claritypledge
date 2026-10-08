// P1399: Daily report — the Status panel (connections, new people, every check) and the Issues
// flow, one card at a time. Paging lives in the shell's bottom bar; this file renders and
// reports clicks.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { OWN, cardState, isAnswered, daysOpen, technicalDetail, type CardState, type ConnectionView, type DayReport, type DayView, type IssueView } from '../../lib/day'
import { CheckRow, Phrases, StatusIcon } from './status'
import { checkStatus, connectionStatus, needsYou } from './statusWords'
import { safeUrl } from './api'
import { NewPeople } from './People'
import { ListPane } from './ListPane'

/**
 * P1445 E: a card that needs no founder action is not a card. The work an agent does without a
 * founder choice is a list under the card — still sent by Start fixing — each row saying where it is.
 */
export interface AgentWork {
  items: IssueView[]
  open: boolean
  /** a Status check opened the list on this row */
  focus?: string
  setOpen: (open: boolean) => void
}

interface Props {
  report: DayReport
  view: DayView
  readOnly: boolean
  /** the founder's cards: the pager walks these */
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
  /** P1432: each item key sent from this run → when it was first sent (started / pending launches) */
  sent: Readonly<Record<string, string>>
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
/** "09:14" in the founder's local time. */
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// ---------------------------------------------------------------------------------------
// P1432: every card says its state — on the card, and in the list above it.

/** The card's state line. An earlier run is read-only, so it says what was decided ON it. */
function stateText(st: CardState, readOnly: boolean): string {
  switch (st.kind) {
    case 'sent':
      return `Sent to the agent ${clock(st.at)}`
    case 'answered':
      return readOnly ? `Answered on this run · ${clock(st.at)}` : `Your answer · saved ${clock(st.at)}`
    case 'before':
      return `You answered on ${shortDate(st.at)}: ${st.label} · reported again`
    case 'agent':
      return readOnly ? 'Not answered on this run' : `Goes with Start fixing · recommended: ${st.recommended}`
    case 'open':
      return readOnly ? 'Not answered on this run' : `Not answered yet · recommended: ${st.recommended}`
  }
}

/** The list's one word per card. */
const STATE_WORD: Record<CardState['kind'], string> = {
  sent: 'Sent',
  answered: 'Answered',
  before: 'Answered before',
  agent: 'Agent',
  open: 'Not answered',
}
const isDone = isAnswered

function StateLine({ st, readOnly }: { st: CardState; readOnly: boolean }) {
  return (
    <div className={`d-state ${isDone(st) ? 'done' : st.kind}`} data-state={st.kind} {...(st.kind === 'before' ? { 'data-answered-before': '' } : {})}>
      <span className="d-sdot" aria-hidden="true">
        {isDone(st) ? '✓' : ''}
      </span>
      <span>{stateText(st, readOnly)}</span>
    </div>
  )
}

/**
 * Every card of the set the pager walks, with its state (P1432); beside the card on a wide area
 * (P1435). Parked cards live outside the pager, so they are one row that opens the Parked section.
 */
function CardList(p: { issues: IssueView[]; index: number; sent: Props['sent']; parked: number; onJump: (fp: string) => void; onParked: () => void }) {
  if (p.issues.length + p.parked < 2) return null
  const states = p.issues.map((i) => cardState(i, p.sent))
  const need = states.filter((st) => !isDone(st)).length
  return (
    <ListPane
      label="Cards"
      rows={p.issues.map((i, k) => ({
        key: i.fp,
        title: i.title,
        done: isDone(states[k]),
        kind: states[k].kind,
        word: STATE_WORD[states[k].kind],
        attrs: { 'data-list-card': i.fp, 'data-list-state': states[k].kind },
      }))}
      current={Math.min(p.index, p.issues.length - 1)}
      summary={need === 0 ? `All ${plural(p.issues.length, 'card')} answered` : `${need} still need you · ${plural(p.issues.length, 'card')}`}
      allDone={need === 0}
      onPick={(k) => p.onJump(p.issues[k].fp)}
      extra={p.parked > 0 ? { title: `${p.parked} parked`, word: 'Parked', attrs: { 'data-list-parked': '' }, onClick: p.onParked } : undefined}
    />
  )
}

export function DailyReport(p: Props) {
  const { view, readOnly } = p
  const broken = view.connections.filter((c) => c.state !== 'ok')
  const settled = broken.every((c) => c.fix_queued)
  const [force, setForce] = useState(false)
  const [stripOpen, setStripOpen] = useState(false)
  const [parkedOpen, setParkedOpen] = useState(false)
  const parkedRef = useRef<HTMLDivElement>(null)
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
        <div className="d-md">
          <CardList
            issues={p.issues}
            index={p.index}
            sent={p.sent}
            parked={view.parked.length}
            onJump={p.onJump}
            onParked={() => {
              setParkedOpen(true)
              requestAnimationFrame(() => parkedRef.current?.scrollIntoView({ block: 'nearest' }))
            }}
          />
          <div className="d-mdmain">
            <IssueCard {...p} />
            <AgentList agent={p.agent} sent={p.sent} />
            <Parked view={view} readOnly={readOnly} onBringBack={p.onBringBack} open={parkedOpen} setOpen={setParkedOpen} boxRef={parkedRef} />
          </div>
        </div>
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
        need > 0 && <span className="d-needtx">{need === 1 ? '1 check needs attention' : `${need} checks need attention`}</span>,
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
  const { report, readOnly, issues } = p
  const [moreOpen, setMoreOpen] = useState<Record<string, boolean>>({})
  const focusRef = useRef<HTMLTextAreaElement | null>(null)
  const issue = issues[Math.min(p.index, issues.length - 1)]
  const sel = issue ? p.selected(issue) : null
  const tech = issue ? technicalDetail(issue) : null

  // Focus the custom answer's box only when it is picked — never when paging lands here.
  useEffect(() => {
    if (p.ownFocus) focusRef.current?.focus({ preventScroll: true })
  }, [p.ownFocus])


  if (!issue) {
    return (
      <>
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
        <StateLine st={cardState(issue, p.sent)} readOnly={readOnly} />
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
            {tech && (
              <div>
                <dt>Technical detail</dt>
                <dd className="d-tech" data-technical>
                  <span>
                    <b>Title</b> {tech.title}
                  </span>
                  <span>
                    <b>Point A</b> {tech.point_a}
                  </span>
                  <span>
                    <b>Obstacle</b> {tech.obstacle}
                  </span>
                  <span>
                    <b>Point B</b> {tech.point_b}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        )}
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

/** P1445 E: the agent's work as rows — title and a state chip (Not sent / Sent), nothing to answer. */
function AgentList({ agent, sent }: { agent: AgentWork; sent: Readonly<Record<string, string>> }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (agent.open && agent.focus) box.current?.querySelector(`[data-agent-item="${CSS.escape(agent.focus)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [agent.open, agent.focus])
  if (!agent.items.length) return null
  return (
    <div className="d-card d-parked" ref={box} data-agent-list>
      <button type="button" className="d-fold" aria-expanded={agent.open} onClick={() => agent.setOpen(!agent.open)}>
        <span className="d-tri">▶</span>With the agent ({agent.items.length})
      </button>
      {agent.open &&
        agent.items.map((x) => {
          const st = cardState(x, sent)
          return (
            <div className={`d-row${agent.focus === x.fp ? ' d-focusrow' : ''}`} key={x.fp} data-agent-item={x.fp}>
              <span className="d-tx">
                <span className="d-ptitle">{x.title}</span>
              </span>
              <span className={`d-pill d-schip ${st.kind === 'sent' ? 'sent' : 'open'}`} data-agent-state={st.kind === 'sent' ? 'sent' : 'not-sent'} title={st.kind === 'sent' ? `Sent ${clock(st.at)}` : undefined}>
                {st.kind === 'sent' ? 'Sent' : 'Not sent'}
              </span>
            </div>
          )
        })}
    </div>
  )
}

function Parked({ view, readOnly, onBringBack, open, setOpen, boxRef }: { view: DayView; readOnly: boolean; onBringBack: (fp: string) => void; open: boolean; setOpen: (o: boolean) => void; boxRef: RefObject<HTMLDivElement | null> }) {
  if (!view.parked.length) return null
  return (
    <div className="d-card d-parked" ref={boxRef}>
      <button type="button" className="d-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
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
