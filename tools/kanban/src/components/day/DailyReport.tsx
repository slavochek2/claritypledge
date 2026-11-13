// P1399: Daily report — the Status panel (connections, new people, every check) and the Issues
// flow, one card at a time. Paging lives in the shell's bottom bar; this file renders and
// reports clicks.
// P1468: this is the ONE layout of the queue — the status line, the list and the agent panel sit
// around whichever item is open, a card or a statement (the statement card is passed in), so moving
// from a card into the statements never moves the page.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { evaluatedSummary, loopNotices, waitingText } from './loops'
import { OWN, cardDetail, cardState, isAnswered, isInsightCard, daysOpen, technicalDetail, type CardState, type ConnectionView, type DayReport, type DayView, type IssueView } from '../../lib/day'
import { CheckRow, Phrases, StatusIcon } from './status'
import { agentWord, checkStatus, connectionStatus, listSummary, type AgentHeader } from './statusWords'
import { safeUrl } from './api'
import { NewPeople } from './People'
import { type DestKind, DEST_WORD, buildChecklist, summaryParts, type Checklist as ChecklistT, type ChecklistRow } from './checklist'
import { ListPane, type ListRow } from './ListPane'

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
  /** P1468 review F4: which button the header may name — the one on screen, or none on a read-only run */
  header: AgentHeader
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
  /** P1468: the statements, as rows of the same list under the `Stories` divider */
  statements: StatementRows
  /** P1468: the open statement's card — rendered where the card goes; absent = a card is open */
  statement?: ReactNode
  /** P1468: under the open statement, after the agent panel (earlier stories) */
  afterStatement?: ReactNode
  /** P1468: show the card view (the parked row, clicked while a statement is open) */
  onCards: () => void
}

/** P1468: the statement half of the one list */
export interface StatementRows {
  rows: ListRow[]
  /** the open statement, or -1 when a card is open */
  current: number
  /** statements with neither a position nor a story */
  open: number
  onPick: (k: number) => void
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
      return `Sent ${clock(st.at)}`
    case 'answered':
      return readOnly ? `Answered on this run · ${clock(st.at)}` : `Your answer · saved ${clock(st.at)}`
    case 'before':
      // P1463: a re-reported card is not done — it leads with that, not with the old answer
      return `Back again · you answered on ${shortDate(st.at)}: ${st.label}`
    case 'agent':
      return readOnly ? 'Not answered on this run' : `Goes with Start fixing · recommended: ${st.recommended}`
    case 'open':
      return readOnly ? 'Not answered on this run' : st.recommended ? `Not answered yet · recommended: ${st.recommended}` : 'Not answered yet'
  }
}

/** The list's one word per card. */
const STATE_WORD: Record<CardState['kind'], string> = {
  sent: 'Sent',
  answered: 'Answered',
  before: 'Back again',
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

/** P1468: the list shows when the queue holds two rows or more (cards + the parked row + statements). */
const listShown = (cards: number, parked: number, statements: number) => cards + (parked > 0 ? 1 : 0) + statements >= 2

/**
 * Every card of the set the pager walks, with its state (P1432); beside the card on a wide area
 * (P1435). Parked cards live outside the pager, so they are one row that opens the Parked section.
 * P1468: the statements follow under a `Stories` divider — one list, whichever item is open.
 */
function CardList(p: { issues: IssueView[]; index: number; cardOpen: boolean; sent: Props['sent']; parked: number; onJump: (fp: string) => void; onParked: () => void; statements: StatementRows }) {
  const states = p.issues.map((i) => cardState(i, p.sent))
  // P1673: a weekly insight is listed first but is not one of the day's cards: it does not count in the totals
  const need = states.filter((st, k) => !isDone(st) && !isInsightCard(p.issues[k])).length
  return (
    <ListPane
      label="Cards and stories"
      rows={p.issues.map((i, k) => ({
        key: i.fp,
        title: i.title,
        // P1673: an insight is done only when decided, and then it is gone: a saved note never ticks its row
        done: isDone(states[k]) && !isInsightCard(i),
        kind: states[k].kind,
        // P1463: a done row's ✓ already says it — the word is only for what is not done
        word: isInsightCard(i) ? 'Insight' : isDone(states[k]) ? '' : STATE_WORD[states[k].kind],
        attrs: { 'data-list-card': i.fp, 'data-list-state': states[k].kind },
      }))}
      current={p.cardOpen ? Math.min(p.index, p.issues.length - 1) : -1}
      summary={listSummary(need + p.statements.open, p.issues.filter((i) => !isInsightCard(i)).length + p.statements.rows.length)}
      onPick={(k) => p.onJump(p.issues[k].fp)}
      extra={p.parked > 0 ? { title: `${p.parked} parked`, word: 'Parked', attrs: { 'data-list-parked': '' }, onClick: p.onParked } : undefined}
      section={p.statements.rows.length ? { label: 'Stories', rows: p.statements.rows, current: p.statements.current, onPick: p.statements.onPick } : undefined}
    />
  )
}

export function DailyReport(p: Props) {
  const { view, readOnly } = p
  // P1609: the checklist is one summary line under the cards, folded by default; that line is its only toggle.
  const [statusOpen, setStatusOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [parkedOpen, setParkedOpen] = useState(false)
  const parkedRef = useRef<HTMLDivElement>(null)
  // P1468: the parked row asks for Parked — scrolled to once it has rendered (from a statement, the
  // card view and its Parked section mount in the same commit)
  const [parkedAsk, setParkedAsk] = useState(0)
  useEffect(() => {
    if (parkedAsk) parkedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [parkedAsk])
  const cardList = listShown(p.issues.length, view.parked.length, p.statements.rows.length)
  const checklist = buildChecklist(view, p.sent)

  return (
    // P1609: the checklist sits full-width below the cards and the agent work, so working a card never needs a scroll up
    <div className="d-rgrid collapsed">
      <section className="d-issues" aria-label="Issues">
        <div className={cardList ? 'd-md' : 'd-md d-single'}>
          {cardList && (
            <CardList
              issues={p.issues}
              index={p.index}
              cardOpen={!p.statement}
              sent={p.sent}
              parked={view.parked.length}
              onJump={p.onJump}
              statements={p.statements}
              onParked={() => {
                if (p.statement) p.onCards()
                setParkedOpen(true)
                setParkedAsk((n) => n + 1)
              }}
            />
          )}
          {/* P1468: the open item, then the agent's work under it — in both halves, in one box (review F2: no
              narrower column for a statement) */}
          <div className="d-mdmain">
            {p.statement ?? <IssueCard {...p} />}
            <AgentList agent={p.agent} sent={p.sent} />
            <Waiting view={view} />
            <Evaluated view={view} />
            {p.statement && p.afterStatement}
            {/* every founder card parked: there is no card view to open, so Parked sits under the statement (Codex re-review).
                Bring back from there asks for the card view, as the parked row does, so the returned card opens (review) */}
            {(!p.statement || !p.issues.length) && (
              <Parked
                view={view}
                readOnly={readOnly}
                onBringBack={(fp) => {
                  if (p.statement) p.onCards()
                  p.onBringBack(fp)
                }}
                open={parkedOpen}
                setOpen={setParkedOpen}
                boxRef={parkedRef}
              />
            )}
          </div>
        </div>
      </section>
      <Checklist
        checklist={checklist}
        report={p.report}
        readOnly={readOnly}
        open={statusOpen}
        onToggle={() => setStatusOpen((o) => !o)}
        peopleOpen={peopleOpen}
        onPeople={() => setPeopleOpen((o) => !o)}
        onJump={p.onJump}
        onFix={p.onFix}
        onUndoFix={p.onUndoFix}
      />
      {peopleOpen && (
        <div className="d-card d-peoplebox" data-people-box>
          <NewPeople people={p.report.people} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------
// Checklist

function unpushed(report: DayReport) {
  const n = report.unpushed_commits
  return typeof n === 'number' && n > 0 ? plural(n, 'unpushed commit') : null
}

/**
 * P1609: every check once, saying where its problem went. The summary line counts destinations and
 * is the one toggle (left triangle, it never moves); the list opens beneath it: connections with
 * their Fix, problems by destination, then passes. New people and unpushed commits are chips on the
 * line, not status.
 */
function Checklist(p: {
  checklist: ChecklistT
  report: DayReport
  readOnly: boolean
  open: boolean
  onToggle: () => void
  peopleOpen: boolean
  onPeople: () => void
  onJump: (fp: string) => void
  onFix: (c: ConnectionView) => void
  onUndoFix: (c: ConnectionView) => void
}) {
  const { checklist: cl, report } = p
  const parts = summaryParts(cl.counts)
  const queued = cl.connections.filter((c) => c.fix_queued).length
  const newPeople = report.people?.length ?? 0
  const underOf = (id: string) => cl.rows.filter((r) => r.connection === id)
  const loose = cl.rows.filter((r) => r.dest.kind !== 'fix')
  const problems = loose.filter((r) => r.dest.kind !== 'ok' && r.dest.kind !== 'skipped')
  const passes = loose.filter((r) => r.dest.kind === 'ok')
  const skipped = loose.filter((r) => r.dest.kind === 'skipped')
  return (
    <div className="d-checklist">
      <div className="d-sline" data-status-line>
        <button type="button" className="d-slt wrap" aria-expanded={p.open} data-status-toggle onClick={p.onToggle}>
          <span className="d-tri">▶</span>
          <span>
            <Phrases
              items={parts.map((x) => (
                <span key={x.kind} className={x.kind === 'none' || x.kind === 'reconnect' || (x.kind === 'card' && cl.counts.card > 0) ? 'need' : undefined} data-sum={x.kind}>
                  {x.text}
                </span>
              ))}
            />
          </span>
        </button>
        {queued > 0 && <span className="d-chip">{plural(queued, 'connection fix', 'connection fixes')} in Start fixing</span>}
        <span className="d-sgap" />
        {newPeople > 0 && (
          <button type="button" className="d-chip" aria-expanded={p.peopleOpen} data-people-chip onClick={p.onPeople}>
            {`${newPeople} new ${newPeople === 1 ? 'person' : 'people'}`}
          </button>
        )}
        {unpushed(report) && <span className="d-chip">{unpushed(report)}</span>}
      </div>
      {p.open && (
        <aside className="d-status" aria-label="Checklist">
          <div className="d-spanel open" data-checklist>
            {cl.connections.map((c) => (
              <div key={c.id} className="d-fgroup" data-fail={`c:${c.id}`}>
                <ConnectionRow c={c} readOnly={p.readOnly} onFix={p.onFix} onUndo={p.onUndoFix} />
                {underOf(c.id).map((r) => (
                  <div key={r.check.id} className="d-srow d-under" data-check={r.check.id} data-dest="fix">
                    <span className="d-tx">
                      <span>{r.check.label}</span>
                    </span>
                    <span className="d-dest">{DEST_WORD.fix}</span>
                  </div>
                ))}
              </div>
            ))}
            {problems.map((r) => (
              <ProblemRow key={r.check.id} r={r} onJump={p.onJump} />
            ))}
            {passes.map((r) => (
              <div key={r.check.id} className="d-srow d-pass" data-check={r.check.id} data-dest="ok">
                <StatusIcon status="ok" />
                <span className="d-tx">{r.check.label}</span>
              </div>
            ))}
            {skipped.map((r) => (
              <CheckRow key={r.check.id} c={r.check} />
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}

/** Destinations that live in a folded section on this page: the row scrolls there and opens it. */
const SECTION_OF: Partial<Record<DestKind, string>> = { parked: '[data-parked-list]', waiting: '[data-waiting-list]', accepted: '[data-evaluated-list]' }

function openSection(selector: string) {
  const box = document.querySelector(selector)
  box?.scrollIntoView({ block: 'nearest' })
  const fold = box?.querySelector<HTMLButtonElement>('.d-fold[aria-expanded="false"]')
  fold?.click()
}

function ProblemRow({ r, onJump }: { r: ChecklistRow; onJump: (fp: string) => void }) {
  const { check, dest } = r
  const word = DEST_WORD[dest.kind]
  const fp = dest.fp
  const section = SECTION_OF[dest.kind]
  return (
    <div className="d-srow" data-check={check.id} data-dest={dest.kind} data-fail={`k:${check.id}`}>
      <StatusIcon status={check.status} hideWord />
      <span className="d-tx">
        <b>{check.label}</b>
        <span className="d-w">
          <span className="d-word need" data-status-word>
            {checkStatus(check.status).word}
          </span>
          {check.detail ? ` · ${check.detail}` : ''}
        </span>
      </span>
      <span className="d-destbox">
        {fp ? (
          <button type="button" className="d-link sm d-tap" data-dest-link onClick={() => onJump(fp)}>
            {word} ›
          </button>
        ) : section ? (
          <button type="button" className="d-link sm d-tap" data-dest-link onClick={() => openSection(section)}>
            {word} ›
          </button>
        ) : (
          <span className={`d-dest ${dest.kind === 'none' ? 'need' : ''}`} data-dest-word>
            {word}
          </span>
        )}
        {dest.more > 0 && <span className="d-more"> +{dest.more} more</span>}
      </span>
    </div>
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
  /** P1463 round 3: answered cards the founder asked to see in full again (Change) */
  const [reopened, setReopened] = useState<Record<string, boolean>>({})
  /**
   * Whether the card was already answered when the founder arrived on it. Only such a card is
   * folded — a pick made here must never fold the card away under the cursor.
   */
  const arrival = useRef<{ fp: string; done: boolean } | null>(null)
  const focusRef = useRef<HTMLTextAreaElement | null>(null)
  const issue = issues[Math.min(p.index, issues.length - 1)]
  const sel = issue ? p.selected(issue) : null
  const tech = issue ? technicalDetail(issue) : null
  const detail = issue ? cardDetail(issue).show : {}
  // P1673: a weekly insight's own link, only when it is a safe one
  const insightHref = issue ? safeUrl(issue.insight_link) : null

  // Focus the custom answer's box only when it is picked — never when paging lands here.
  useEffect(() => {
    if (p.ownFocus) focusRef.current?.focus({ preventScroll: true })
  }, [p.ownFocus])


  if (!issue) {
    return (
      <>
        <div className="d-card d-row">
          <span className="d-ic ok">✓</span>
          <b>{p.agent.items.length ? "Nothing needs you" : "No issues today"}</b>
        </div>
      </>
    )
  }

  const days = daysOpen(issue.first_seen, report.started_at)
  const st = cardState(issue, p.sent)
  if (arrival.current?.fp !== issue.fp) arrival.current = { fp: issue.fp, done: isDone(st) }
  const folded = arrival.current.done && isDone(st) && !reopened[issue.fp]
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
          placeholder={issue.insight_key ? 'A note, saved here. It is not sent to the agent.' : 'Ending with ? makes it a question the agent answers first'}
          value={ownText}
          onChange={(e) => p.onDraft(issue, e.target.value)}
          onBlur={() => p.onDraftBlur(issue)}
        />
      )
    ) : null

  const head = (
    <div className="d-ihead">
      {/* P1463 round 3: the title says what it is about — the topic word only restated it */}
      <span className="d-topic">
        {issue.review && <span className="d-runbadge sm">{reviewLabel(issue.review)}</span>}
        {issue.insight_key && <span className="d-runbadge sm" data-insight-tag>Weekly insight</span>}
      </span>
      <span className="d-pills">
        {issue.came_back && <span className="d-back">Came back</span>}
        {/* a checked cause is the normal case: only the exception is worth a label */}
        {issue.evidence === 'unverified' && <span className="d-cause">Cause suspected</span>}
        {issue.urgent && <span className="d-pill urg">Urgent</span>}
        {issue.important && <span className="d-pill imp">Important</span>}
        {days ? <span className="d-age">{plural(days, 'day')} open</span> : null}
      </span>
    </div>
  )

  if (folded) {
    // P1463 round 3: an answered card is its answer — the reasoning is one click away
    const chosen = issue.decision?.option_id === OWN ? ownText || 'Your answer' : (issue.options.find((o) => o.id === issue.decision?.option_id)?.label ?? 'Your answer')
    return (
      <article className="d-card d-focus d-folded" data-issue={issue.fp} data-folded>
        {head}
        <StateLine st={st} readOnly={readOnly} />
        <h2>{issue.title}</h2>
        <div className="d-chose" data-chosen>
          <span>
            You chose: <b>{chosen}</b>
          </span>
          <button type="button" className="d-link d-tap" onClick={() => setReopened((r) => ({ ...r, [issue.fp]: true }))}>
            {readOnly ? 'Show the card' : 'Change'}
          </button>
        </div>
      </article>
    )
  }

  return (
    <>
      <article className="d-card d-focus" data-issue={issue.fp}>
        {head}
        <StateLine st={st} readOnly={readOnly} />
        {loopNotices(issue.loop).map((n) => (
          <div className={`d-loop ${n.kind}`} key={n.kind} data-loop={n.kind}>
            {n.text}
          </div>
        ))}
        <h2>{issue.title}</h2>
        {/* P1445 F: a field that only restates the title (or a field above it) is not shown */}
        {(detail.point_a || detail.obstacle || detail.point_b) && (
          <dl className="d-abc">
            {detail.point_a && (
              <div>
                <dt>Point A</dt>
                <dd>{detail.point_a}</dd>
              </div>
            )}
            {detail.obstacle && (
              <div>
                <dt>Obstacle</dt>
                <dd>{detail.obstacle}</dd>
              </div>
            )}
            {detail.point_b && (
              <div>
                <dt>Point B</dt>
                <dd>{detail.point_b}</dd>
              </div>
            )}
          </dl>
        )}
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
            {!issue.insight_key && (
              <div>
                <dt>First seen</dt>
                <dd>{firstSeen(issue, report.started_at)}</dd>
              </div>
            )}
            {issue.source && (
              <div>
                <dt>Source</dt>
                <dd>{issue.source}</dd>
              </div>
            )}
            {detail.evidence_text && (
              <div>
                <dt>What the check found</dt>
                <dd>{detail.evidence_text}</dd>
              </div>
            )}
            {detail.more_info && (
              <div>
                <dt>Details</dt>
                <dd className={issue.insight_key ? 'd-preline' : undefined}>{detail.more_info}</dd>
              </div>
            )}
            {insightHref && (
              <div>
                <dt>Where to look</dt>
                <dd>
                  <a className="d-link sm d-tap" href={insightHref} target="_blank" rel="noopener noreferrer">
                    Open the link
                  </a>
                </dd>
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
                  <span className={`d-rec ${fitRated ? '' : 'dim'}`} title="Fit: how likely this fixes the real cause without breaking something else">{fitRated ? `Recommended · Fit ${fit}%` : 'Recommended · Fit not rated'}</span>
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
  // P1468: the header counts what is not sent yet — the part these rows add to "Send N changes"
  const notSent = agent.items.filter((x) => cardState(x, sent).kind !== 'sent').length
  return (
    <div className="d-card d-parked" ref={box} data-agent-list>
      <button type="button" className="d-fold" aria-expanded={agent.open} onClick={() => agent.setOpen(!agent.open)}>
        <span className="d-tri">▶</span>
        {agentWord(notSent, agent.items.length, agent.header)}
      </button>
      {agent.open &&
        agent.items.map((x) => {
          const st = cardState(x, sent)
          return (
            <div className={`d-row${agent.focus === x.fp ? ' d-focusrow' : ''}`} key={x.fp} data-agent-item={x.fp}>
              <span className="d-tx">
                <span className="d-ptitle">{x.title}</span>
              </span>
              {/* P1463 round 2: a sent row is a ✓ (eight "Sent" pills said one thing eight times); "Not sent" stays words */}
              {st.kind === 'sent' ? (
                <span className="d-sdot done" data-agent-state="sent" role="img" aria-label={`Sent ${clock(st.at)}`} title={`Sent ${clock(st.at)}`}>
                  ✓
                </span>
              ) : (
                <span className="d-pill d-schip open" data-agent-state="not-sent">
                  Not sent
                </span>
              )}
            </div>
          )
        })}
    </div>
  )
}

function Parked({ view, readOnly, onBringBack, open, setOpen, boxRef }: { view: DayView; readOnly: boolean; onBringBack: (fp: string) => void; open: boolean; setOpen: (o: boolean) => void; boxRef: RefObject<HTMLDivElement | null> }) {
  if (!view.parked.length) return null
  return (
    <div className="d-card d-parked" ref={boxRef} data-parked-list>
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

/** P1605: faults an earlier record already evaluated. One line with the breakdown; the rows open from it. */
function Evaluated({ view }: { view: DayView }) {
  const [open, setOpen] = useState(false)
  if (!view.evaluated.length) return null
  return (
    <div className="d-card d-waiting" data-evaluated-list>
      <button type="button" className="d-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="d-tri">▶</span>
        {evaluatedSummary(view.evaluated)}
      </button>
      {open &&
        view.evaluated.map((x) => (
          <div className="d-row" key={x.fp} data-evaluated={x.fp}>
            <span className="d-tx">
              <span className="d-ptitle">{x.title}</span>
              <span className="d-w">
                {x.loop?.evaluated?.verdict}, {x.loop?.evaluated?.cause}, until {x.loop?.evaluated?.expires}
              </span>
            </span>
          </div>
        ))}
    </div>
  )
}

/** P1578 C: what only waits on in-flight work. One collapsed row each, no question, never sent. */
function Waiting({ view }: { view: DayView }) {
  const [open, setOpen] = useState(false)
  if (!view.waiting.length) return null
  return (
    <div className="d-card d-waiting" data-waiting-list>
      <button type="button" className="d-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="d-tri">▶</span>Waiting on in-flight work ({view.waiting.length})
      </button>
      {open &&
        view.waiting.map((x) => (
          <div className="d-row" key={x.fp} data-waiting={x.fp}>
            <span className="d-tx">
              <span className="d-ptitle">{x.title}</span>
              <span className="d-w">{waitingText(x.loop)}</span>
            </span>
          </div>
        ))}
    </div>
  )
}
