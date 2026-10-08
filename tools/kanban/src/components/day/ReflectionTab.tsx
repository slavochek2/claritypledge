// P1399: Reflection — one "change" statement at a time in the product's point-card look, with
// its Disagree / Unsure / Agree control on the product's 7-level scale (-3 … 3).
// P1440: the story box is there with or without a position (a story alone is an answer), its draft
// lives in DayPage and only Accept saves it (a typed story that is not saved says so here and in the
// list), each story says where it is (not sent / sent n× / stuck / done), and stories from earlier
// days that are still open are listed below.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DayAgentView, DayStatement, DayView, StoryEntry } from '../../lib/day'
import { dayLabel } from './api'
import { fromName, toName } from './positions'
import { ListPane } from './ListPane'
// P1445 D: CP's own renderers (extracted, product-free — the boundary test in server/__tests__/day.test.ts
// follows their imports), styled by CP's Tailwind and tokens inside .cp-scope.
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared/presentational/position-buttons'
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell'
import { StoryQuoteRow } from '@/app/components/shared/presentational/story-quote-row'
import 'virtual:cp-tokens.css'
import './cp-scope.css'

const LONG: Record<number, string> = {
  [-3]: 'Strongly Disagree',
  [-2]: 'Disagree',
  [-1]: 'Somewhat Disagree',
  0: 'Unsure',
  1: 'Somewhat Agree',
  2: 'Agree',
  3: 'Strongly Agree',
}
/** the board shows no crowd: CP's counts badge stays hidden */
const NO_COUNTS: SevenPointCounts = { strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 }

/** P1445 D: CP's utilities and tokens need a .cp-scope ancestor — <body>, so body-level portals
 *  (tooltips, the level menu) match too — and the menu portals into a body-level .cp-reset root. */
function useCpScope(): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    document.body.classList.add('cp-scope')
    const el = document.createElement('div')
    el.className = 'cp-reset'
    el.setAttribute('data-cp-portal', '')
    document.body.appendChild(el)
    setRoot(el)
    return () => {
      el.remove()
      document.body.classList.remove('cp-scope')
    }
  }, [])
  return root
}

/** the sticky bottom bar's top: the level menu opens above it, never under it */
const barTop = () => document.querySelector('[data-bottom-bar]')?.getBoundingClientRect().top ?? window.innerHeight

interface Props {
  statements: DayStatement[]
  view: DayView
  readOnly: boolean
  index: number
  onPosition: (id: string, position: number) => void
  onRemove: (id: string) => void
  /** P1435: open statement k from the list */
  onJump: (k: number) => void
  /** this run's pass_id: which ledger entries are this run's own */
  runId: string
  /** P1440: the ledger entries the server sent with the run */
  stories: StoryEntry[]
  /** the story text being typed for a statement, if any (saved only by Accept) */
  draftOf: (id: string) => string | undefined
  /** the box says something the saved story does not */
  unsaved: (id: string) => boolean
  /** stories (run, statement) with a Mark done / Send again in flight */
  busy: ReadonlySet<string>
  onDraft: (id: string, text: string) => void
  onMarkDone: (e: StoryEntry) => void
  onResend: (e: StoryEntry) => void
}

export function ReflectionTab({ statements, view, readOnly, index, onPosition, onRemove, onJump, runId, stories, draftOf, unsaved, busy, onDraft, onMarkDone, onResend }: Props) {
  const portal = useCpScope()
  const s = statements[Math.min(index, statements.length - 1)]

  const earlier = stories.filter((e) => e.run_id !== runId && e.state !== 'done')
  const earlierList = earlier.length > 0 && <EarlierStories entries={earlier} readOnly={readOnly} busy={busy} onMarkDone={onMarkDone} onResend={onResend} />
  if (!s)
    return (
      <>
        <div className="d-card d-pad">No statements in this run.</div>
        {earlierList}
      </>
    )
  const d = view.reflection[s.id]
  const entry = stories.find((e) => e.run_id === runId && e.target === s.id)
  const pos = d && typeof d.position === 'number' ? d.position : null

  /** P1435: a position is a number; 0 is "Unsure", never "Not rated" */
  const posOf = (id: string) => {
    const v = view.reflection[id]?.position
    return typeof v === 'number' ? v : null
  }
  const hasStory = (id: string) => !!view.reflection[id]?.story
  // P1440 review O5: a story alone is an answer (done, with a story) — just not a rating
  const storyOnly = statements.filter((x) => posOf(x.id) === null && hasStory(x.id)).length
  const unanswered = statements.filter((x) => posOf(x.id) === null && !hasStory(x.id)).length
  const summary =
    unanswered === 0
      ? storyOnly
        ? `All ${statements.length} answered · ${storyOnly} story only`
        : `All ${statements.length} rated`
      : `${unanswered} not rated${storyOnly ? ` · ${storyOnly} story only` : ''} · ${statements.length} statements`
  return (
    <section className="d-issues" aria-label="Statements">
      <div className="d-md">
        {statements.length > 1 && (
          <ListPane
            label="Statements"
            rows={statements.map((x) => {
              const p = posOf(x.id)
              return {
                key: x.id,
                title: x.text,
                done: p !== null || hasStory(x.id),
                kind: 'open',
                // P1440: a story without a position is kept (answered, not rated); a typed one not saved says so
                word: unsaved(x.id) ? 'Unsaved' : p === null ? (hasStory(x.id) ? 'Story, no position' : 'Not rated') : LONG[p],
                attrs: { 'data-list-statement': x.id, 'data-list-state': unsaved(x.id) ? 'unsaved' : p === null ? (hasStory(x.id) ? 'story' : 'unrated') : 'rated' },
              }
            })}
            current={Math.min(index, statements.length - 1)}
            summary={summary}
            allDone={unanswered === 0}
            onPick={onJump}
          />
        )}
        <div className="d-pwrap d-mdmain">
          <div className="cp-reset d-cpcard">
            <PointCardShell
              aria-label={`Statement: ${s.text}`}
              data-statement={s.id}
              statement={<p className="d-pst min-w-0 flex-1 text-base font-medium text-foreground break-words">{s.text}</p>}
              footer={s.agent && <AgentRow agent={s.agent} />}
            >
              {s.review && <span className="d-runbadge sm">{s.review === 'weekly' ? 'Weekly review' : 'Monthly review'}</span>}
              <div className="mt-2" role="group" aria-label="Your position" data-position-control>
                <PositionButtons
                  userPosition={pos === null ? null : toName(pos)}
                  counts={NO_COUNTS}
                  onPositionClick={(p) => onPosition(s.id, fromName(p))}
                  onClear={readOnly ? undefined : () => onRemove(s.id)}
                  disabled={readOnly}
                  portalContainer={portal}
                  menuLimit={barTop}
                />
                {!readOnly && (
                  <div className="d-keyhint" aria-hidden="true">
                    1 · 2 · 3
                  </div>
                )}
              </div>
              <Story key={s.id} id={s.id} saved={d?.story ?? ''} draft={draftOf(s.id)} readOnly={readOnly} onDraft={onDraft} />
              {unsaved(s.id) && (
                // Accept is right below in the bar; why Done waits is in Done's own tooltip
                <p className="d-unsaved" data-story-unsaved>
                  Not saved
                </p>
              )}
              {entry && (
                <StoryState
                  entry={entry}
                  readOnly={readOnly}
                  busy={busy}
                  blocked={unsaved(s.id) ? 'Accept the edited story first: Done would close the version saved before.' : undefined}
                  onMarkDone={onMarkDone}
                  onResend={onResend}
                />
              )}
            </PointCardShell>
          </div>
          {earlierList}
        </div>
      </div>
    </section>
  )
}

/**
 * P1445 C+D: "Agent on Slava" — the writer's own entity, rendered as CP renders an agent's story
 * under a point: AgentByline, its own stance (PositionBadge), the quoted story. Its position is a
 * prediction shown beside the founder's control; it never sets his.
 */
function AgentRow({ agent }: { agent: DayAgentView }) {
  return (
    <div className="px-4 py-2.5 border-t border-border" data-agent-view>
      <StoryQuoteRow
        name={agent.name}
        isAgent
        authorPosition={toName(agent.position)}
        meta={
          <details className="d-agent-src">
            <summary>{agent.sources.length === 1 ? '1 source' : `${agent.sources.length} sources`}</summary>
            <ul>
              {agent.sources.map((q, i) => (
                <li key={i}>
                  <span className="d-agent-ref">{q.ref}</span> “{q.quote}”
                </li>
              ))}
            </ul>
          </details>
        }
        textClassName="text-sm whitespace-pre-line"
      >
        {agent.story}
      </StoryQuoteRow>
    </div>
  )
}

const OUTCOME: Record<string, string> = { acted: 'acted', answered: 'answered', declined: 'declined', 'batch-closed': 'closed' }

/** P1440: where a story is, as a chip (grey · amber when stuck · green when done), and its one or two actions. */
function StoryState({
  entry,
  readOnly,
  busy,
  blocked,
  onMarkDone,
  onResend,
}: {
  entry: StoryEntry
  readOnly: boolean
  busy: ReadonlySet<string>
  /** why Done must wait (an edited story not saved yet): disables it; said in its tooltip and accessible name only */
  blocked?: string
  onMarkDone: (e: StoryEntry) => void
  onResend: (e: StoryEntry) => void
}) {
  const chip =
    entry.state === 'done'
      ? `Done · ${OUTCOME[entry.outcome ?? ''] ?? entry.outcome ?? ''}`
      : entry.state === 'stuck'
        ? 'Stuck'
        : entry.state === 'sent'
          ? `Sent ×${entry.sends}`
          : 'Not sent'
  const inFlight = busy.has(`${entry.run_id}\u0000${entry.target}`)
  const open = !readOnly && entry.state !== 'done'
  return (
    <div className="d-schips" data-story-state={entry.state}>
      <span className={`d-pill d-schip ${entry.state}`} data-story-line title={entry.state === 'stuck' ? `Sent ${entry.sends} times, still open` : undefined}>
        {chip}
      </span>
      {open && entry.state === 'stuck' && (
        <button type="button" className="d-link d-tap" data-story-resend aria-label={`Send again: ${entry.statement}`} disabled={inFlight} onClick={() => onResend(entry)}>
          Resend
        </button>
      )}
      {open && (
        <button
          type="button"
          className="d-link d-tap"
          data-story-done
          aria-label={`Mark done: ${entry.statement}${blocked ? ` (${blocked})` : ''}`}
          disabled={inFlight || !!blocked}
          title={blocked}
          onClick={() => onMarkDone(entry)}
        >
          Done
        </button>
      )}
    </div>
  )
}

/** P1440: stories from earlier runs that are not done — still the agent's work, so still on the board. */
function EarlierStories({
  entries,
  readOnly,
  busy,
  onMarkDone,
  onResend,
}: {
  entries: StoryEntry[]
  readOnly: boolean
  busy: ReadonlySet<string>
  onMarkDone: (e: StoryEntry) => void
  onResend: (e: StoryEntry) => void
}) {
  return (
    <section className="d-card d-pad d-notes d-wrap" data-earlier-stories aria-label="Earlier stories not yet handled">
      <h3 className="d-sub1">Earlier stories ({entries.length})</h3>
      {entries.map((e) => (
        <div className="d-note-item" key={`${e.run_id}/${e.target}`} data-earlier-story={`${e.run_id}/${e.target}`}>
          <p className="d-sub d-ell" title={e.statement}>
            {dayLabel(e.run_started_at ?? e.edited_at)} · {e.statement}
          </p>
          <p className="d-story-ro">{e.story}</p>
          <StoryState entry={e} readOnly={readOnly} busy={busy} onMarkDone={onMarkDone} onResend={onResend} />
        </div>
      ))}
    </section>
  )
}

function Story({
  id,
  saved,
  draft,
  readOnly,
  onDraft,
}: {
  id: string
  saved: string
  draft: string | undefined
  readOnly: boolean
  onDraft: (id: string, text: string) => void
}) {
  const text = draft ?? saved
  // The box grows with its text instead of scrolling inside the page (the board has one scroller).
  const box = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [text])
  if (readOnly) return saved ? <p className="d-story-ro">{saved}</p> : null
  return (
    <div className="d-story">
      <label className="d-slab" htmlFor={`st-${id}`}>
        Add your story <span>(optional)</span>
      </label>
      <textarea
        ref={box}
        id={`st-${id}`}
        className="d-stxt"
        maxLength={2000}
        placeholder="What happened that makes you think so?"
        value={text}
        onChange={(e) => onDraft(id, e.target.value)}
      />
    </div>
  )
}
