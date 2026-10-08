// P1440 A: stories become work items. The server-only half: the story hash (node:crypto, so
// src/lib/day.ts stays browser-safe and the board never hashes — it echoes the hashes the server
// sends), and the checks that the "mark done" / "send again" route and the CLI share, so the two
// writers can never disagree on what may be marked.

import { createHash } from 'crypto'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  parseReport,
  sentKey,
  statementsByRun,
  storyLedger,
  type DayReport,
  type RunStatements,
  type StoryEntry,
  type StoryRequest,
} from '../src/lib/day'
import { Refusal, type ParsedLines } from './dayStore'

/** `\r\n` → `\n`, trimmed, every run of whitespace one space: an edit that only re-wraps is the same story. */
export function normaliseStory(s: string): string {
  return s.replace(/\r\n/g, '\n').trim().replace(/\s+/g, ' ')
}

/** Lowercase hex sha256 of the UTF-8 normalised story — the version a marker closes. */
export function storyHash(s: string): string {
  return createHash('sha256').update(normaliseStory(s), 'utf8').digest('hex')
}

export const storyKey = sentKey.story

export function ledgerOf(existing: Pick<ParsedLines, 'lines' | 'markers' | 'launches'>, runs: Record<string, RunStatements>): StoryEntry[] {
  return storyLedger(existing.lines, existing.markers, runs, existing.launches, storyHash)
}

/** Every readable run's statements, straight from <dir>/reports (the CLI has no board to ask). */
export function loadRunStatements(dir: string): Record<string, RunStatements> {
  let names: string[] = []
  try {
    names = readdirSync(join(dir, 'reports')).filter((n) => n.endsWith('.json'))
  } catch {
    return {}
  }
  const reports: DayReport[] = []
  for (const n of names) {
    try {
      const p = parseReport(JSON.parse(readFileSync(join(dir, 'reports', n), 'utf-8')))
      if (p.kind === 'ok') reports.push(p.report)
    } catch {
      // an unreadable run has no statements to name
    }
  }
  return statementsByRun(reports)
}

function entryFor(ledger: StoryEntry[], req: Pick<StoryRequest, 'run_id' | 'target' | 'story_hash' | 'version'>): StoryEntry {
  const e = ledger.find((x) => x.run_id === req.run_id && x.target === req.target)
  if (!e) throw new Refusal('No story on that run and statement')
  // Both: the same text can come back (A → B → A) as a new version with a new edit time.
  if (e.hash !== req.story_hash || e.edited_at !== req.version) throw new Refusal('That story was edited since: this version is gone')
  return e
}

/**
 * The story_done line for a request, or a Refusal: unknown (run, target), a stale version, already done.
 * Every marker carries `notBefore: edited_at`, so the writer stamps it after the edit it closes.
 */
export function markLine(ledger: StoryEntry[], req: StoryRequest): object {
  const e = entryFor(ledger, req)
  if (e.state === 'done') throw new Refusal('That story is already marked done')
  return { kind: 'story_done', run_id: e.run_id, target: e.target, story_hash: e.hash, outcome: req.outcome, ...(req.note ? { note: req.note } : {}), notBefore: e.edited_at }
}

/** "Send again" for a stuck story: resets its send count for this version. */
export function resendLine(ledger: StoryEntry[], req: Pick<StoryRequest, 'run_id' | 'target' | 'story_hash' | 'version'>): object {
  const e = entryFor(ledger, req)
  if (e.state !== 'stuck') throw new Refusal('Only a stuck story can be sent again')
  return { kind: 'story_resend', run_id: e.run_id, target: e.target, story_hash: e.hash, notBefore: e.edited_at }
}

/** Backfill: one batch-closed marker per story version not done whose latest edit is before the cutoff. A rerun finds none. */
export function batchCloseLines(ledger: StoryEntry[], cutoff: number): object[] {
  return ledger
    .filter((e) => e.state !== 'done' && Date.parse(e.edited_at) < cutoff)
    .map((e) => ({ kind: 'story_done', run_id: e.run_id, target: e.target, story_hash: e.hash, outcome: 'batch-closed', notBefore: e.edited_at }))
}
