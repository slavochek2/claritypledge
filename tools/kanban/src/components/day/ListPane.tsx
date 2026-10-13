// P1435: the list beside the card — every card (or statement) with its state; a click opens it.
// On a wide area it is the left column next to the open item, so the item starts at the top of the
// page; on a narrow one it folds to one line that leads with what still needs the founder, and folds
// again after a pick.
// P1468: ONE list for the whole queue — the cards, the parked row, then a `Stories` divider (a
// label, never a control) and the statements — the same rows whichever item is open.

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

interface Extra {
  title: string
  word: string
  attrs: Record<string, string>
  onClick: () => void
  /** the dot's look: 'parked' (grey) by default */
  dot?: string
}

/** P1468: the second half of the one list, under its divider */
interface Section {
  label: string
  rows: ListRow[]
  /** the open row's index here, or -1 when the open item is in the first half */
  current: number
  onPick: (k: number) => void
}

interface Props {
  label: string
  rows: ListRow[]
  /** the open row's index in `rows`, or -1 when the open item is in `section` */
  current: number
  /** the folded line on a narrow area, e.g. "3 still need you · 16 items" */
  summary: string
  onPick: (k: number) => void
  /** rows after the list that are not cards (the parked row) */
  extra?: Extra | Extra[]
  section?: Section
}

export function ListPane({ label, rows, current, summary, onPick, extra, section }: Props) {
  const [open, setOpen] = useState(false)
  const rowsId = useId()
  const row = (r: ListRow, isCurrent: boolean, pick: () => void) => (
    <li key={r.key}>
      <button
        type="button"
        className="d-clrow"
        aria-current={isCurrent ? 'true' : undefined}
        {...r.attrs}
        onClick={() => {
          setOpen(false)
          pick()
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
  )
  return (
    <nav className={`d-card d-clist ${open ? 'open' : ''}`} aria-label={label} data-card-list>
      <button type="button" className="d-fold d-cltog" aria-expanded={open} aria-controls={rowsId} onClick={() => setOpen((o) => !o)}>
        <span className="d-tri">▶</span>
        {summary}
      </button>
      <ul className="d-clrows" id={rowsId}>
        {rows.map((r, k) => row(r, k === current, () => onPick(k)))}
        {(Array.isArray(extra) ? extra : extra ? [extra] : []).map((x) => (
          <li key={x.title}>
            <button
              type="button"
              className="d-clrow"
              {...x.attrs}
              onClick={() => {
                setOpen(false)
                x.onClick()
              }}
            >
              <span className={`d-sdot ${x.dot ?? 'parked'}`} aria-hidden="true" />
              <span className="d-clt">{x.title}</span>
              <span className="d-clw">{x.word}</span>
            </button>
          </li>
        ))}
        {section && (
          <>
            {/* P1468: the divider names the second half; it is not a control */}
            <li className="d-clsec d-cldiv" data-list-divider>
              <span className="d-clt">{section.label}</span>
            </li>
            {section.rows.map((r, k) => row(r, k === section.current, () => section.onPick(k)))}
          </>
        )}
      </ul>
    </nav>
  )
}
