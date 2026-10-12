// P1399: Daily report — the Status panel (connections, new people, every check) and the Issues
// flow, one card at a time. Paging lives in the shell's bottom bar; this file renders and
// reports clicks.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { OWN, cardDetail, cardState, isAnswered, daysOpen, technicalDetail, type CardState, type ConnectionView, type DayReport, type DayView, type IssueView } from '../../lib/day'
import { CheckRow, StatusIcon } from './status'
import { agentWord, checkStatus, connectionStatus, needsYou } from './statusWords'
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
  /** P1463: the statements after the cards — how many still to rate, and the jump to them */
  reflection?: { open: number; go: () => void }
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
      return readOnly ? 'Not answered on this run' : `Not answered yet · recommended: ${st.recommended}`
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

/**
 * Every card of the set the pager walks, with its state (P1432); beside the card on a wide area
 * (P1435). Parked cards live outside the pager, so they are one row that opens the Parked section.
 */
function CardList(p: { issues: IssueView[]; index: number; sent: Props['sent']; parked: number; onJump: (fp: string) => void; onParked: () => void; reflection?: Props['reflection'] }) {
  if (p.issues.length + p.parked < 2 && !p.reflection) return null
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
        // P1463: a done row's ✓ already says it — the word is only for what is not done
        word: isDone(states[k]) ? '' : STATE_WORD[states[k].kind],
        attrs: { 'data-list-card': i.fp, 'data-list-state': states[k].kind },
      }))}
      current={Math.min(p.index, p.issues.length - 1)}
      summary={need === 0 ? `All ${plural(p.issues.length, 'card')} answered` : `${need} still need you · ${plural(p.issues.length, 'card')}`}
      allDone={need === 0}
      noHead
      onPick={(k) => p.onJump(p.issues[k].fp)}
      extra={[
        ...(p.parked > 0 ? [{ title: `${p.parked} parked`, word: 'Parked', attrs: { 'data-list-parked': '' }, onClick: p.onParked }] : []),
        // P1463: the queue goes on into the statements — this row is the divider and the jump
        ...(p.reflection
          ? [{ title: 'Reflection', word: p.reflection.open ? `${p.reflection.open} to rate` : 'rated', attrs: { 'data-list-reflection': '' }, onClick: p.reflection.go, dot: p.reflection.open ? 'section' : 'done' }]
          : []),
      ]}
    />
  )
}

/**
 * P1463 round 3: Status is sorted by OUTCOME, not by kind. What didn't work is grouped by its
 * cause: a broken connection carries the checks it breaks (a check names its connection, or the
 * view says a connection covers it); every other failing check stands alone.
 */
interface Failure {
  key: string
  conn?: ConnectionView
  /** a failing check with no broken connection behind it */
  check?: DayView['checks'][number]
  /** the checks a broken connection explains */
  under: DayView['checks']
}

function failures(view: DayView): Failure[] {
  const broken = view.connections.filter((c) => c.state !== 'ok')
  const brokenIds = new Set(broken.map((c) => c.id))
  const cause = (c: DayView['checks'][number]) => c.covered_by ?? (c.connection && brokenIds.has(c.connection) ? c.connection : undefined)
  const bad = view.checks.filter((c) => needsYou(c.status))
  return [
    ...broken.map((c) => ({ key: `c:${c.id}`, conn: c, under: bad.filter((x) => cause(x) === c.id) })),
    ...bad.filter((x) => !cause(x)).map((x) => ({ key: `k:${x.id}`, check: x, under: [] })),
  ]
}

export function DailyReport(p: Props) {
  const { view, readOnly } = p
  // P1463: Status is one line by default; the full panel is one click away.
  const [statusOpen, setStatusOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [parkedOpen, setParkedOpen] = useState(false)
  const parkedRef = useRef<HTMLDivElement>(null)
  const fails = failures(view)
  const cardList = p.issues.length + view.parked.length >= 2 || !!p.reflection
  // a card can sit in the pager, the agent list or Parked: "Open card" goes to whichever holds it
  const shown = new Set([...view.issues, ...view.parked].map((i) => i.fp))
  const toCard = (fp?: string) => (fp && shown.has(fp) ? () => p.onJump(fp) : undefined)

  return (
    // P1463: Status never takes a column — opened, it sits full-width above the cards, so they keep their width
    <div className="d-rgrid collapsed">
      {statusOpen ? (
        <StatusPanel view={view} readOnly={readOnly} fails={fails} toCard={toCard} onCollapse={() => setStatusOpen(false)} onFix={p.onFix} onUndoFix={p.onUndoFix} />
      ) : (
        <StatusLine view={view} report={p.report} fails={fails.length} onOpen={() => setStatusOpen(true)} peopleOpen={peopleOpen} onPeople={() => setPeopleOpen((o) => !o)} />
      )}
      {peopleOpen && (
        <div className="d-card d-peoplebox" data-people-box>
          <NewPeople people={p.report.people} />
        </div>
      )}
      <section className="d-issues" aria-label="Issues">
        <div className={cardList ? 'd-md' : 'd-md d-single'}>
          {cardList && (
            <CardList
              issues={p.issues}
              index={p.index}
              sent={p.sent}
              parked={view.parked.length}
              onJump={p.onJump}
              reflection={p.reflection}
              onParked={() => {
                setParkedOpen(true)
                requestAnimationFrame(() => parkedRef.current?.scrollIntoView({ block: 'nearest' }))
              }}
            />
          )}
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
  return typeof n === 'number' && n > 0 ? plural(n, 'unpushed commit') : null
}

/**
 * P1463 round 3: the whole Status in one glance — what worked, what didn't (both open the panel,
 * where the details and every Fix live). New people and unpushed commits are not status: they are
 * chips beside it, and people open their own box.
 */
function StatusLine(p: { view: DayView; report: DayReport; fails: number; onOpen: () => void; peopleOpen: boolean; onPeople: () => void }) {
  const { view, report } = p
  const good = view.checks.filter((c) => c.status === 'ok').length
  const queued = view.connections.filter((c) => c.state !== 'ok' && c.fix_queued).length
  const newPeople = report.people?.length ?? 0
  return (
    <div className="d-sline" data-status-line>
      <button type="button" className="d-slt" aria-expanded="false" data-status-toggle onClick={p.onOpen}>
        <span className="d-tri">▶</span>
        <span className="ok">✓</span> <b>{good} worked</b>
      </button>
      {p.fails > 0 && (
        <button type="button" className="d-chip need" data-status-fails onClick={p.onOpen}>
          ✕ {p.fails} didn’t work
        </button>
      )}
      {queued > 0 && <span className="d-chip">{plural(queued, 'connection fix', 'connection fixes')} in Start fixing</span>}
      <span className="d-sgap" />
      {newPeople > 0 && (
        <button type="button" className="d-chip" aria-expanded={p.peopleOpen} data-people-chip onClick={p.onPeople}>
          {`${newPeople} new ${newPeople === 1 ? 'person' : 'people'}`}
        </button>
      )}
      {unpushed(report) && <span className="d-chip">{unpushed(report)}</span>}
    </div>
  )
}

function StatusPanel({
  view,
  readOnly,
  fails,
  toCard,
  onCollapse,
  onFix,
  onUndoFix,
}: {
  view: DayView
  readOnly: boolean
  fails: Failure[]
  toCard: (fp?: string) => (() => void) | undefined
  onCollapse: () => void
  onFix: (c: ConnectionView) => void
  onUndoFix: (c: ConnectionView) => void
}) {
  const [passOpen, setPassOpen] = useState(false)
  const skipped = view.checks.filter((c) => c.status === 'skipped')
  const good = view.checks.filter((c) => c.status === 'ok')
  const openCard = (fp?: string) => {
    const go = toCard(fp)
    return go ? (
      <button type="button" className="d-link sm d-tap" data-open-card onClick={go}>
        Open card ›
      </button>
    ) : null
  }

  return (
    <aside className="d-status" aria-label="Status">
      <div className="d-spanel open">
        <div className="d-sh can">
          <span className="d-shtitle">Status</span>
          <button type="button" className="d-link d-tap" onClick={onCollapse}>
            Collapse
          </button>
        </div>

        {fails.length > 0 ? (
          <div className="d-sgl need" data-fails-head>
            Didn’t work ({fails.length})
          </div>
        ) : (
          <div className="d-srow">
            <span className="d-ic ok">✓</span>
            <span className="d-tx">
              <b>Everything worked</b>
            </span>
          </div>
        )}
        {fails.map((f) =>
          f.conn ? (
            <div key={f.key} className="d-fgroup" data-fail={f.key}>
              <ConnectionRow c={f.conn} readOnly={readOnly} onFix={onFix} onUndo={onUndoFix} />
              {f.under.map((c) => (
                <div key={c.id} className="d-srow d-under" data-check={c.id}>
                  <span className="d-tx">
                    <span>{c.label}</span>
                  </span>
                  {openCard(c.issue_fp)}
                </div>
              ))}
            </div>
          ) : (
            f.check && (
              <div key={f.key} className="d-srow" data-check={f.check.id} data-fail={f.key}>
                <StatusIcon status={f.check.status} hideWord />
                <span className="d-tx">
                  <b>{f.check.label}</b>
                  <span className="d-w">
                    <span className="d-word need" data-status-word>
                      {checkStatus(f.check.status).word}
                    </span>
                    {f.check.detail ? ` · ${f.check.detail}` : ''}
                  </span>
                </span>
                {openCard(f.check.issue_fp)}
              </div>
            )
          ),
        )}

        <button type="button" className="d-sfold" aria-expanded={passOpen} onClick={() => setPassOpen((o) => !o)}>
          <span className="d-tri">▶</span>Worked ({good.length}){skipped.length ? ` · skipped ${skipped.length}` : ''}
        </button>
        {passOpen && (
          <div className="d-plist">
            {good.map((c) => (
              <div key={c.id} data-check={c.id}>
                <StatusIcon status={c.status} /> {c.label}
              </div>
            ))}
            {skipped.map((c) => (
              <CheckRow key={c.id} c={c} />
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
          placeholder="Ending with ? makes it a question the agent answers first"
          value={ownText}
          onChange={(e) => p.onDraft(issue, e.target.value)}
          onBlur={() => p.onDraftBlur(issue)}
        />
      )
    ) : null

  const head = (
    <div className="d-ihead">
      {/* P1463 round 3: the title says what it is about — the topic word only restated it */}
      <span className="d-topic">{issue.review && <span className="d-runbadge sm">{reviewLabel(issue.review)}</span>}</span>
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
            {detail.evidence_text && (
              <div>
                <dt>What the check found</dt>
                <dd>{detail.evidence_text}</dd>
              </div>
            )}
            {detail.more_info && (
              <div>
                <dt>Details</dt>
                <dd>{detail.more_info}</dd>
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
  return (
    <div className="d-card d-parked" ref={box} data-agent-list>
      <button type="button" className="d-fold" aria-expanded={agent.open} onClick={() => agent.setOpen(!agent.open)}>
        <span className="d-tri">▶</span>
        {agentWord(agent.items.length)}
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
