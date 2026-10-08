// P1399: Reflection — one "change" statement at a time in the product's point-card look, with
// its Disagree / Unsure / Agree control on the product's 7-level scale (-3 … 3).
// P1440: the story box is there with or without a position (a story alone is an answer), its draft
// lives in DayPage and only Accept saves it (a typed story that is not saved says so here and in the
// list), each story says where it is (not sent / sent n× / stuck / done), and stories from earlier
// days that are still open are listed below.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DayStatement, DayView, StoryEntry } from '../../lib/day'
import { dayLabel } from './api'
import { sideOf, DEFAULT_POS, type Side } from './positions'
import { ListPane } from './ListPane'

const SHORT: Record<number, string> = { [-3]: 'Disagree+', [-2]: 'Disagree', [-1]: 'Disagree−', 0: 'Unsure', 1: 'Agree−', 2: 'Agree', 3: 'Agree+' }
const LONG: Record<number, string> = {
  [-3]: 'Strongly Disagree',
  [-2]: 'Disagree',
  [-1]: 'Somewhat Disagree',
  0: 'Unsure',
  1: 'Somewhat Agree',
  2: 'Agree',
  3: 'Strongly Agree',
}
const LEVELS: Record<Side, number[]> = { disagree: [-1, -2, -3], unsure: [0], agree: [1, 2, 3] }
const SIDES: { side: Side; label: string; icon: JSX.Element }[] = [
  { side: 'disagree', label: 'Disagree', icon: <path d="M18 6 6 18M6 6l12 12" /> },
  {
    side: 'unsure',
    label: 'Unsure',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  { side: 'agree', label: 'Agree', icon: <path d="M20 6 9 17l-5-5" /> },
]

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
  const [menu, setMenu] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** open the strength menu upward when it would land under the sticky bottom bar */
  const [up, setUp] = useState(false)
  const s = statements[Math.min(index, statements.length - 1)]

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menu])

  useEffect(() => setMenu(null), [s?.id])

  useLayoutEffect(() => {
    if (!menu) return setUp(false)
    const el = menuRef.current
    const bar = document.querySelector('[data-bottom-bar]')?.getBoundingClientRect().top ?? window.innerHeight
    if (el && el.getBoundingClientRect().bottom > bar - 8) setUp(true)
  }, [menu])

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
  const active = pos === null ? null : sideOf(pos)

  const click = (side: Side) => {
    if (active === side) setMenu((m) => (m === s.id ? null : s.id))
    else {
      setMenu(null)
      onPosition(s.id, DEFAULT_POS[side])
    }
  }

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
                word: unsaved(x.id) ? 'Story not saved' : p === null ? (hasStory(x.id) ? 'Story, no position' : 'Not rated') : LONG[p],
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
          <article className="d-pcard" data-statement={s.id}>
            <div className="d-pin" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(45deg)' }}>
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
              </svg>
            </div>
            <div className="d-pbody">
              <p className="d-pst">{s.text}</p>
              {s.review && <span className="d-runbadge sm">{s.review === 'weekly' ? 'Weekly review' : 'Monthly review'}</span>}
              <div className="d-pbwrap" ref={wrap}>
                <div className="d-pbrow" role="group" aria-label="Your position">
                  {SIDES.map(({ side, label, icon }) => {
                    const on = active === side
                    return (
                      <div className="d-pbseg" key={side}>
                        <button
                          type="button"
                          className={`d-pb ${on ? 'on' : ''}`}
                          aria-pressed={on}
                          aria-expanded={on ? menu === s.id : undefined}
                          data-side={side}
                          disabled={readOnly}
                          onClick={() => click(side)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={on ? '' : 'dim'} aria-hidden="true">
                            {icon}
                          </svg>
                          <span>{on && pos !== null ? SHORT[pos] : label}</span>
                        </button>
                        {on && menu === s.id && (
                          <div className={`d-pmenu ${up ? 'up' : ''}`} role="menu" ref={menuRef}>
                            {LEVELS[side].map((lv) => (
                              <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={pos === lv}
                                key={lv}
                                onClick={() => {
                                  setMenu(null)
                                  if (pos !== lv) onPosition(s.id, lv)
                                }}
                              >
                                <span className="d-ck">{pos === lv ? '✓' : ''}</span>
                                {LONG[lv]}
                              </button>
                            ))}
                            <div className="d-psep" />
                            <button
                              type="button"
                              role="menuitem"
                              className="d-prm"
                              onClick={() => {
                                setMenu(null)
                                onRemove(s.id)
                              }}
                            >
                              Remove position
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!readOnly && (
                  <div className="d-keyhint" aria-hidden="true">
                    1 · 2 · 3
                  </div>
                )}
              </div>
              <Story key={s.id} id={s.id} saved={d?.story ?? ''} draft={draftOf(s.id)} readOnly={readOnly} onDraft={onDraft} />
              {unsaved(s.id) && (
                <p className="d-sub d-wrap" data-story-unsaved>
                  Not saved — press Accept to save
                </p>
              )}
              {entry && (
                <StoryState
                  entry={entry}
                  readOnly={readOnly}
                  busy={busy}
                  blocked={unsaved(s.id) ? 'Accept the edited story first: Mark done would close the version saved before.' : undefined}
                  onMarkDone={onMarkDone}
                  onResend={onResend}
                />
              )}
            </div>
          </article>
          {earlierList}
        </div>
      </div>
    </section>
  )
}

const OUTCOME: Record<string, string> = { acted: 'acted on', answered: 'answered', declined: 'declined', 'batch-closed': 'closed in a batch' }

/** P1440: where a story is — the founder sees whether the agent got it and whether it was handled. */
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
  /** why Mark done must wait (an edited story not saved yet), if it must */
  blocked?: string
  onMarkDone: (e: StoryEntry) => void
  onResend: (e: StoryEntry) => void
}) {
  const line =
    entry.state === 'done'
      ? `Story: done · ${OUTCOME[entry.outcome ?? ''] ?? entry.outcome ?? 'marked'}`
      : entry.state === 'stuck'
        ? `Story: stuck — sent ${entry.sends} times, still open`
        : entry.state === 'sent'
          ? `Story: sent to the agent (${entry.sends}×)`
          : 'Story: not sent yet'
  const inFlight = busy.has(`${entry.run_id}\u0000${entry.target}`)
  const open = !readOnly && entry.state !== 'done'
  return (
    <>
      <div className="d-sub d-wrap" data-story-state={entry.state}>
        <span data-story-line>{line}</span>
        {open && entry.state === 'stuck' && (
          <>
            {' · '}
            <button type="button" className="d-link d-tap" data-story-resend aria-label={`Send again: ${entry.statement}`} disabled={inFlight} onClick={() => onResend(entry)}>
              Send again
            </button>
          </>
        )}
        {open && (
          <>
            {' · '}
            <button
              type="button"
              className="d-link d-tap"
              data-story-done
              aria-label={`Mark done: ${entry.statement}`}
              disabled={inFlight || !!blocked}
              title={blocked}
              onClick={() => onMarkDone(entry)}
            >
              Mark done
            </button>
          </>
        )}
      </div>
      {open && blocked && (
        <p className="d-sub d-wrap" data-story-done-hint>
          {blocked}
        </p>
      )}
    </>
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
      <h3 className="d-sub1">Earlier stories not yet handled ({entries.length})</h3>
      {entries.map((e) => (
        <div className="d-note-item" key={`${e.run_id}/${e.target}`} data-earlier-story={`${e.run_id}/${e.target}`}>
          <p className="d-sub d-wrap">
            {dayLabel(e.run_started_at ?? e.edited_at)} · “{e.statement}”
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
