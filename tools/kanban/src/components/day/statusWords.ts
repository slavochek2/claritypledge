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
