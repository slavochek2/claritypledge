// P1399: the one status vocabulary (spec §3, rule 7). Colour has three meanings: green = worked,
// amber = needs you, grey = neutral. Red is used only for a connection that is not connected.

import { Fragment, type ReactNode } from 'react'
import type { DayCheck } from '../../lib/day'
import { checkStatus, needsYou } from './statusWords'

/** The status mark: an icon for the eye; the word for screen readers unless the row shows it. */
export function StatusIcon({ status, hideWord }: { status: string; hideWord?: boolean }) {
  const s = checkStatus(status)
  return (
    <span className={`d-ic ${s.cls}`} title={s.title ?? s.word}>
      <span aria-hidden="true">{s.icon}</span>
      {!hideWord && (
        <span className="d-sr" data-status-word>
          {s.word}
        </span>
      )}
    </span>
  )
}

/** One check in the shared row format: name, then "Word · detail" (Status panel, Systems, Money). */
export function CheckRow({ c, extra }: { c: Pick<DayCheck, 'id' | 'label' | 'status' | 'detail'>; extra?: string }) {
  const s = checkStatus(c.status)
  return (
    <div className="d-srow" data-check={c.id} title={s.title}>
      <StatusIcon status={c.status} hideWord />
      <span className="d-tx">
        <b>{c.label}</b>
        <span className="d-w">
          <span className={`d-word ${needsYou(c.status) ? 'need' : s.cls === 'ok' ? 'okw' : ''}`} data-status-word>
            {s.word}
          </span>
          {c.detail ? ` · ${c.detail}` : ''}
          {extra ?? ''}
        </span>
      </span>
    </div>
  )
}

/**
 * Short facts joined by " · ". Each phrase is one inline block with its separator at its end, so
 * a line breaks between phrases (never inside one when it fits, never starting with "·").
 */
export function Phrases({ items }: { items: ReactNode[] }) {
  const xs = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '')
  return (
    <>
      {xs.map((x, i) => (
        <Fragment key={i}>
          <span className="d-ph">
            {x}
            {i < xs.length - 1 ? ' ·' : ''}
          </span>
          {/* The space sits between the blocks, so it survives and is where a line may break. */}
          {i < xs.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </>
  )
}
