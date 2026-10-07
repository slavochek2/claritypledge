// P1435: the list beside the card — every card (or statement) with its state; a click opens it.
// Shared by the Daily report and Reflection. On a wide area it is the left column next to the
// card, so the card starts at the top of the page; on a narrow one it folds to one line that leads
// with what still needs the founder, and folds again after a pick.

import { useId, useState } from 'react'

export interface ListRow {
  key: string
  title: string
  done: boolean
  /** the dot's look when not done: 'before' | 'agent' | 'open' */
  kind: string
  word: string
  attrs?: Record<string, string>
}

interface Props {
  label: string
  rows: ListRow[]
  current: number
  /** what still needs the founder, e.g. "3 still need you · 16 cards" */
  summary: string
  /** nothing needs the founder: the summary says so in green */
  allDone: boolean
  onPick: (k: number) => void
  /** one row after the list that is not a card (the parked row) */
  extra?: { title: string; word: string; attrs: Record<string, string>; onClick: () => void }
}

export function ListPane({ label, rows, current, summary, allDone, onPick, extra }: Props) {
  const [open, setOpen] = useState(false)
  const rowsId = useId()
  return (
    <nav className={`d-card d-clist ${open ? 'open' : ''}`} aria-label={label} data-card-list>
      <button type="button" className="d-fold d-cltog" aria-expanded={open} aria-controls={rowsId} onClick={() => setOpen((o) => !o)}>
        <span className="d-tri">▶</span>
        {summary}
      </button>
      <div className={`d-clhead ${allDone ? 'done' : ''}`} data-list-summary>
        {allDone && '✓ '}
        {summary}
      </div>
      <ul className="d-clrows" id={rowsId}>
        {rows.map((r, k) => (
          <li key={r.key}>
            <button
              type="button"
              className="d-clrow"
              aria-current={k === current ? 'true' : undefined}
              {...r.attrs}
              onClick={() => {
                setOpen(false)
                onPick(k)
              }}
            >
              <span className={`d-sdot ${r.done ? 'done' : r.kind}`} aria-hidden="true">
                {r.done ? '✓' : ''}
              </span>
              <span className="d-clt" title={r.title}>
                {r.title}
              </span>
              <span className="d-clw">{r.word}</span>
            </button>
          </li>
        ))}
        {extra && (
          <li>
            <button
              type="button"
              className="d-clrow"
              {...extra.attrs}
              onClick={() => {
                setOpen(false)
                extra.onClick()
              }}
            >
              <span className="d-sdot parked" aria-hidden="true" />
              <span className="d-clt">{extra.title}</span>
              <span className="d-clw">{extra.word}</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  )
}
