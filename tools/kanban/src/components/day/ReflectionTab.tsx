// P1399: Reflection — one "change" statement at a time in the product's point-card look, with
// its Disagree / Unsure / Agree control on the product's 7-level scale (-3 … 3).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DayStatement, DayView } from '../../lib/day'
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
  onStory: (id: string, story: string) => void
  /** P1435: open statement k from the list */
  onJump: (k: number) => void
}

export function ReflectionTab({ statements, view, readOnly, index, onPosition, onRemove, onStory, onJump }: Props) {
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

  if (!s) return <div className="d-card d-pad">No statements in this run.</div>
  const d = view.reflection[s.id]
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
  const unrated = statements.filter((x) => posOf(x.id) === null).length
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
                done: p !== null,
                kind: 'open',
                word: p === null ? 'Not rated' : LONG[p],
                attrs: { 'data-list-statement': x.id, 'data-list-state': p === null ? 'unrated' : 'rated' },
              }
            })}
            current={Math.min(index, statements.length - 1)}
            summary={unrated === 0 ? `All ${statements.length} rated` : `${unrated} not rated · ${statements.length} statements`}
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
              {pos !== null && <Story key={s.id} id={s.id} saved={d?.story ?? ''} readOnly={readOnly} onStory={onStory} />}
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function Story({ id, saved, readOnly, onStory }: { id: string; saved: string; readOnly: boolean; onStory: (id: string, story: string) => void }) {
  const [text, setText] = useState(saved)
  if (readOnly) return saved ? <p className="d-story-ro">{saved}</p> : null
  return (
    <div className="d-story">
      <label className="d-slab" htmlFor={`st-${id}`}>
        Add your story <span>(optional)</span>
      </label>
      <textarea
        id={`st-${id}`}
        className="d-stxt"
        maxLength={2000}
        placeholder="What happened that makes you think so?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() !== saved.trim()) onStory(id, text.trim())
        }}
      />
    </div>
  )
}
