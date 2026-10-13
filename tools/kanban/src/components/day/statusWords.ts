// P1399: the one status vocabulary (spec §3, rule 7) as data, shared by every status row.

import type { CheckStatus, ConnectionState } from '../../lib/day'

const CHECK: Record<CheckStatus, { icon: string; word: string; cls: 'ok' | 'need' | 'dnr'; title?: string }> = {
  ok: { icon: '✓', word: 'Worked', cls: 'ok' },
  problem: { icon: '!', word: 'Problem', cls: 'need' },
  unproven: { icon: '?', word: 'Not proven', cls: 'need' },
  // A check that did not run proves nothing: it reads as not proven, never as fine.
  'not-run': { icon: '?', word: 'Not proven', cls: 'need' },
  // One word everywhere; "on purpose" lives in the tooltip.
  skipped: { icon: '–', word: 'Skipped', cls: 'dnr', title: 'Skipped on purpose' },
}

/** Unknown statuses (the lib already maps them, this is the belt to its braces) read "Not proven". */
export function checkStatus(s: string) {
  return CHECK[s as CheckStatus] ?? CHECK.unproven
}

export const needsYou = (s: string) => s !== 'ok' && s !== 'skipped'

export function connectionStatus(s: ConnectionState) {
  return s === 'not-connected'
    ? { icon: '✕', word: 'Not connected', cls: 'bad' as const }
    : { icon: '!', word: 'Connected, didn’t work', cls: 'need' as const }
}

/**
 * P1468 review F4: what the bar shows, so the header never names a button that is not there —
 * `first`: "Start fixing" (nothing sent yet); `follow-up`: "Send N changes" (after a first send);
 * `read-only`: an earlier run, no button at all.
 */
export type AgentHeader = 'first' | 'follow-up' | 'read-only'

/**
 * P1468: the agent's work is named once — the panel header under the open item. It counts the rows
 * not sent yet, because that is the part of "Send N changes" they add; once every row is sent it
 * says where they went.
 */
export const agentWord = (notSent: number, total: number, header: AgentHeader) =>
  header === 'read-only'
    ? `The fixing agent’s work · ${total}`
    : notSent === 0
      ? `Sent to the fixing agent · ${total}`
      : header === 'first'
        ? `Start fixing also sends these · ${notSent} not sent`
        : `Sent with your answers · ${notSent} not sent yet`

/**
 * P1468: the folded list's one line, the same on a card and on a statement (cards still yours +
 * statements not answered). Review F12: when every item still needs the founder, the count is said once.
 */
export const listSummary = (open: number, total: number) => (open === 0 ? `All ${total} answered` : open === total ? `${open} still need you` : `${open} still need you · ${total} items`)
