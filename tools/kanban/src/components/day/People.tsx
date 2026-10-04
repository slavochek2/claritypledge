// P1399: "New people" in the Status panel — who signed up since the last run and what they did.
// Read-only information: never part of the prompt or of Start fixing. `people` absent means the
// run did not collect it; an empty list means nobody new. Folded by default so the checks list
// stays near the top: the header carries the names and the not-confirmed count.

import { useState } from 'react'
import type { DayPerson } from '../../lib/day'
import { safeUrl } from './api'

/** "Sat 19:12" in the founder's local time. */
function joined(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

export function NewPeople({ people }: { people?: DayPerson[] }) {
  const [open, setOpen] = useState(false)
  if (!people) {
    return (
      <div className="d-sgl" data-people="not-collected">
        New people · not collected yet
      </div>
    )
  }
  if (!people.length) {
    return (
      <div data-people="0">
        <div className="d-sgl">New people (0)</div>
        <div className="d-w d-nopeople">No new people</div>
      </div>
    )
  }
  const unconfirmed = people.filter((p) => p.confirmed === false).length
  return (
    <div data-people={people.length}>
      <button type="button" className="d-pfold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="d-tri">▶</span>
        <span className="d-tx">
          <span className="d-pfh">New people ({people.length})</span>
          <span className="d-w">
            {people.map((p) => p.name).join(', ')}
            {unconfirmed > 0 && <span className="d-unconf"> · {unconfirmed} not confirmed</span>}
          </span>
        </span>
      </button>
      {open && people.map((p) => <PersonRow key={p.id} p={p} />)}
    </div>
  )
}

function PersonRow({ p }: { p: DayPerson }) {
  const [open, setOpen] = useState(false)
  const url = safeUrl(p.linkedin_url)
  const where = [p.source, joined(p.joined_at)].filter(Boolean).join(' · ')
  const what = [p.did, p.stopped_at].filter(Boolean).join(' ')
  return (
    <div className="d-srow d-person" data-person={p.id}>
      <span className="d-ic dnr" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </span>
      <span className="d-tx">
        <span>
          <b>{p.name}</b>
          {p.returning && <span className="d-w"> · returning</span>}
        </span>
        {where && <span className="d-w">{where}</span>}
        {what && <span className="d-w">{what}</span>}
        {p.confirmed === false && <span className="d-unconf">email not confirmed</span>}
        {(url || p.background) && (
          <span className="d-plinks">
            {url && (
              <a className="d-link sm" href={url} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            )}
            {p.background && (
              <button type="button" className="d-link sm d-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <span className="d-tri">▶</span> More
              </button>
            )}
          </span>
        )}
        {open && p.background && <span className="d-w d-bg">{p.background}</span>}
      </span>
    </div>
  )
}
