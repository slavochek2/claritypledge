// P1609: the Day page's one checklist. A check has exactly one outcome and every outcome has one
// home; this is the pure function that says which. No React, no clock: the same view and sent map
// always give the same rows, so it is unit-tested (server/__tests__/day-checklist.test.ts).

import { cardState, connectionBroken, isAgentWork, type CheckView, type ConnectionView, type DayView, type IssueView } from '../../lib/day'

/**
 * A card recommended for the agent that the founder answered otherwise (his own question, Park, a
 * different option) is his: it stays a card. Moved here from DayPage so the list and the page agree.
 */
export const isAgentOnly = (i: IssueView) => isAgentWork(i) && (!i.decision || i.options.find((o) => o.id === i.decision?.option_id)?.agent === true)

export type DestKind = 'ok' | 'skipped' | 'card' | 'none' | 'fix' | 'agent' | 'waiting' | 'parked' | 'accepted' | 'answered'

/** Which destination wins when a check has several cards: the one that most needs someone. */
const RANK: DestKind[] = ['card', 'none', 'fix', 'agent', 'waiting', 'parked', 'accepted', 'answered']

export const DEST_WORD: Record<DestKind, string> = {
  ok: 'Worked',
  skipped: 'Skipped',
  card: 'Your card',
  none: 'No card: report this',
  fix: 'Reconnect first',
  agent: 'With the agent',
  waiting: 'Waiting',
  parked: 'Parked',
  accepted: 'Accepted',
  answered: 'You chose',
}

export interface Dest {
  kind: DestKind
  /** the card to open, when that place is on screen (card, answered, agent) */
  fp?: string
  /** further cards this check has beyond the one named */
  more: number
}

export interface ChecklistRow {
  check: CheckView
  dest: Dest
  /** the broken connection this check waits on (kind 'fix') */
  connection?: string
}

export interface Checklist {
  /** broken connections first (each carries its Fix), then problems by destination, then passes, then skipped */
  connections: ConnectionView[]
  rows: ChecklistRow[]
  counts: Record<DestKind, number> & { reconnect: number; total: number }
}

type Home = { kind: DestKind; fp: string }

/** Where each of a check's cards lives right now. */
function homes(view: DayView, sent: Readonly<Record<string, string>>): Map<string, Home[]> {
  const out = new Map<string, Home[]>()
  const add = (i: IssueView, kind: DestKind) => {
    if (!i.check) return
    const l = out.get(i.check) ?? []
    l.push({ kind, fp: i.fp })
    out.set(i.check, l)
  }
  for (const i of view.issues) {
    const st = cardState(i, sent)
    if (isAgentOnly(i) || st.kind === 'sent') add(i, 'agent')
    else if (st.kind === 'answered') add(i, 'answered')
    else add(i, 'card')
  }
  for (const i of view.parked) add(i, 'parked')
  // owned by an open spec reads as waiting: no card, someone else has it
  for (const i of [...view.waiting, ...view.owned]) add(i, 'waiting')
  for (const i of view.evaluated) add(i, 'accepted')
  return out
}

export function buildChecklist(view: DayView, sent: Readonly<Record<string, string>> = {}): Checklist {
  const where = homes(view, sent)
  const broken = new Set(view.connections.filter((c) => connectionBroken(c.state)).map((c) => c.id))
  const rows: ChecklistRow[] = view.checks.map((check) => {
    if (check.status === 'ok') return { check, dest: { kind: 'ok', more: 0 } }
    if (check.status === 'skipped') return { check, dest: { kind: 'skipped', more: 0 } }
    const mine = where.get(check.id) ?? []
    if (mine.length) {
      const first = RANK.map((k) => mine.find((h) => h.kind === k)).find(Boolean) as Home
      return { check, dest: { kind: first.kind, fp: first.kind === 'card' || first.kind === 'answered' || first.kind === 'agent' ? first.fp : undefined, more: mine.length - 1 } }
    }
    // no card: a broken connection explains it, else it is a defect shown as one
    // only a connection that is actually broken can explain it: anything else would hide the row
    const via = [check.covered_by, check.connection].find((id) => id && broken.has(id))
    if (via) return { check, dest: { kind: 'fix', more: 0 }, connection: via }
    return { check, dest: { kind: 'none', more: 0 } }
  })
  const order = (r: ChecklistRow) => (r.dest.kind === 'ok' ? 100 : r.dest.kind === 'skipped' ? 101 : RANK.indexOf(r.dest.kind))
  const sorted = rows.map((r, k) => ({ r, k })).sort((a, b) => order(a.r) - order(b.r) || a.k - b.k).map((x) => x.r)
  const counts = { ok: 0, skipped: 0, card: 0, none: 0, fix: 0, agent: 0, waiting: 0, parked: 0, accepted: 0, answered: 0 } as Checklist['counts']
  for (const r of rows) counts[r.dest.kind]++
  counts.total = rows.length
  const connections = view.connections.filter((c) => connectionBroken(c.state))
  counts.reconnect = connections.length
  return { connections, rows: sorted, counts }
}

/** The summary line's phrases, destinations not failures. Zero-count extras are left out. */
export function summaryParts(c: Checklist['counts']): { text: string; kind: DestKind | 'reconnect' }[] {
  const out: { text: string; kind: DestKind | 'reconnect' }[] = [
    { text: `${c.card} for you`, kind: 'card' },
    { text: `${c.agent} with the agent`, kind: 'agent' },
    { text: `${c.ok} clean`, kind: 'ok' },
  ]
  if (c.answered) out.push({ text: `${c.answered} answered`, kind: 'answered' })
  if (c.waiting) out.push({ text: `${c.waiting} waiting`, kind: 'waiting' })
  if (c.parked) out.push({ text: `${c.parked} parked`, kind: 'parked' })
  if (c.accepted) out.push({ text: `${c.accepted} accepted`, kind: 'accepted' })
  if (c.skipped) out.push({ text: `${c.skipped} skipped`, kind: 'skipped' })
  if (c.reconnect) out.push({ text: `${c.reconnect} to reconnect`, kind: 'reconnect' })
  if (c.fix) out.push({ text: `${c.fix} waiting on a reconnect`, kind: 'fix' })
  if (c.none) out.push({ text: `${c.none} with no card`, kind: 'none' })
  return out
}

