// P1399: fetch helpers for the Day page. The page reads runs and writes decisions; nothing it
// receives is logged or put in browser storage (spec Invariants).

import type { DayReport, DayView, DecisionInput, Review, RunState } from '../../lib/day'

export interface RunSummary {
  id: string
  startedAt: string | null
  state: RunState | 'unreadable' | 'other-schema'
  readable: boolean
  reviews?: Review[]
}

export type DayIndex =
  | { enabled: false }
  | { enabled: true; state: 'present' | 'absent' | 'error'; runs: RunSummary[]; latestId: string | null }

export type RunPayload =
  | {
      id: string
      isLatest: boolean
      kind: 'ok'
      report: DayReport
      view: DayView
      droppedRows: number
      decisionsBadLines: number
      collectedCount: number
      warnings: ('stale' | 'unfinished')[]
    }
  | { id: string; isLatest: boolean; kind: 'other-schema'; text: string }
  | { id: string; isLatest: boolean; kind: 'unreadable' }

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new HttpError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status)
  return body as T
}

export const getIndex = () => fetch('/api/day').then((r) => json<DayIndex>(r))

export const getRun = (id: string) => fetch(`/api/day/runs/${encodeURIComponent(id)}`).then((r) => json<RunPayload>(r))

export const postDecisions = (runId: string, decisions: DecisionInput[]) =>
  fetch('/api/day/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId, decisions }),
  }).then((r) => json<{ success: true; written: number }>(r))

export const getPrompt = () => fetch('/api/day/prompt').then((r) => json<{ run_id: string; prompt: string; count: number }>(r))

/** Clipboard API first; a hidden textarea + execCommand when it is missing or refused. */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // fall through to the legacy path
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'absolute'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('Copy failed')
}

/** "Sun 4 Oct" in the founder's local time. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return 'Unknown date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
}

/** Only http(s) sign-in links are ever opened. */
export function safeUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}
