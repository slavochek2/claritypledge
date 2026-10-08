// P1399: fetch helpers for the Day page. The page reads runs and writes decisions; nothing it
// receives is logged or put in browser storage (spec Invariants).

import type { DayReport, DayView, DecisionInput, Review, RunState, StoryEntry, StoryRequest } from '../../lib/day'

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
      /** items not yet sent to a terminal */
      collectedCount: number
      /** per quota id: its readings from this week's runs, oldest first (the Subscriptions chart) */
      quotaHistory?: Record<string, { at: string; remaining_pct: number }[]>
      /** when Start fixing last reached a terminal on this run, if ever */
      lastSentAt?: string | null
      /** P1432: each item key sent from this run (started or pending launches) → when it was first sent */
      sentItems?: Record<string, string>
      /** P1440: stories with their state and hash — the latest run gets all of them, an earlier run its own (read-only) */
      stories?: StoryEntry[]
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

/**
 * P1440: mark a story done, or send a stuck one again. The hash is the one the server sent with the
 * run (the page never computes one). Same-origin, so the browser sends the Origin the server requires.
 */
export const postStory = (action: 'done' | 'resend', body: StoryRequest) =>
  fetch(`/api/day/stories/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => json<{ success: true }>(r))

export interface StartResult {
  status: number
  body: { launched?: boolean; how?: 'tab' | 'window'; count?: number; followUp?: boolean; error?: string; reason?: 'already-sent' | 'not-latest' | 'nothing'; fallback?: 'copy' }
}

/**
 * Ask the board server to open a terminal session with the prompt it builds itself (spec §7
 * rule 9). The body is exactly `{ run_id }`: the page never sends prompt text. Same-origin, so
 * the browser sends the board's Origin, which the server requires.
 */
export async function startRun(runId: string): Promise<StartResult> {
  const res = await fetch('/api/day/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId }),
  })
  const body = (await res.json().catch(() => ({}))) as StartResult['body']
  return { status: res.status, body }
}

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
