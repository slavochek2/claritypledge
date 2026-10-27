// P1578: the words a card says about its send history and its owner. Plain text, one place.

import type { DayLoop } from '../../lib/day'

const day = (iso: string) => iso.slice(0, 10)
const ago = (n: number | undefined) => (n === undefined ? '' : n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`)

/** Lines for the top of a card, most important first. Empty when the runner found nothing out. */
export function loopNotices(loop: DayLoop | undefined): { kind: 'escalated' | 'sent' | 'owner'; text: string }[] {
  if (!loop) return []
  const out: { kind: 'escalated' | 'sent' | 'owner'; text: string }[] = []
  const o = loop.owner
  if (loop.escalated && o) {
    out.push({
      kind: 'escalated',
      text: loop.escalated.why === 'gone' ? `The in-flight work (${o.label}) is gone. What now?` : `This in-flight work (${o.label}) has not moved in ${loop.escalated.days ?? o.idle_days ?? 'several'} days. What now?`,
    })
  }
  if (loop.sent) {
    const n = loop.sent.attempts && loop.sent.attempts > 1 ? `, ${loop.sent.attempts} times` : ''
    out.push({ kind: 'sent', text: loop.sent.outcome === 'still-open' ? `Agent sent ${day(loop.sent.at)}${n}, not fixed.` : `Sent ${day(loop.sent.at)}, the agent never started.` })
  }
  if (o && !loop.escalated) {
    const bits = [o.unshipped ? 'a fix exists and has not shipped' : '', o.since ? `since ${o.since}` : '', o.last_commit_at ? `last commit ${ago(o.idle_days)}` : ''].filter(Boolean)
    out.push({ kind: 'owner', text: `Owned by ${o.label}${bits.length ? ` (${bits.join(', ')})` : ''}${o.state === 'stale' ? `. No commit in ${o.idle_days} days.` : ''}` })
  }
  return out
}

/** The one line of a collapsed waiting row. */
export function waitingText(loop: DayLoop | undefined): string {
  const o = loop?.owner
  return o ? `Waiting on ${o.label}${o.last_commit_at ? `, last commit ${ago(o.idle_days)}` : ''}` : 'Waiting'
}
