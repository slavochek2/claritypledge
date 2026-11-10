/**
 * @file canvas-draft-calls.ts
 * @description P1536 (Design v6): the calls a canvas draft's owner makes. Starting a run by its id and posting an upload's file to
 * the `canvas-draft` edge function; sending a message with `canvas_workspace_send`; opening, publishing and discarding a
 * draft. Refusals about the state of things (busy, stale_view, ...) come back as typed results, never throws.
 * Re-exported by canvas-draft-service.ts, which keeps the reads.
 */

import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { throwDbError } from './db-error-logger';
import { emitCanvasDraftEvent } from './canvas-draft-events';
import { openedResultOf } from './canvas-draft-opened';

/** `open_elsewhere`: the canvas already has an open draft, in another thread. Nothing new was made. */
export type OpenDraftResult = {
  status: 'opened' | 'open_elsewhere';
  draftId: string;
  conversationId: string;
  threadRootId: string;
  canvasName: string;
  /** The published version the (open or new) draft started from, or null for a brand-new canvas. */
  fromSeq: number | null;
  /** The draft's revision when it was opened or found: what a later Discard of it passes. */
  revision: number;
  /** The canvas the draft belongs to (what a Send into it names). */
  canvasId: string;
  /** The draft's own version name, the `?v=` of its workspace; null when the owner's read did not return it. */
  versionName: string | null;
};

/** What the edge function answered to a run or an upload: a stable code the UI turns into a sentence. */
export type CanvasDraftErrorCode =
  | 'BUSY' | 'LIMIT' | 'REVISION_CAP' | 'TERMS_NOT_ACCEPTED' | 'DISABLED' | 'NOT_AVAILABLE'
  | 'TOO_LARGE' | 'UNSUPPORTED' | 'UNREADABLE' | 'DRAFT_CLOSED' | 'CAPPED' | 'BAD_REQUEST' | 'FAILED'
  | 'NOT_READY' | 'GONE' | 'TIMEOUT';

export type RunStart = { ok: true; runId: string; kind: 'tensions' | 'draft' | 'message' | 'focus' | 'fork_first' } | { ok: false; code: CanvasDraftErrorCode };

/**
 * A refusal about the STATE of things, returned by the v6 draft functions with nothing written for the request. UI copy is
 * not decided here: the caller turns the code into words.
 *   busy / busy_elsewhere  a run is active (on this draft / on another of the owner's canvases)
 *   cap_reached            the 30th used run has applied
 *   stale_view             the revision the person last saw is not the draft's now: re-read, then ask again
 *   draft_empty / no_changes  nothing to publish / no difference from the base
 *   not_retryable / not_offered / expired  retry, focus switch, fork
 */
export type CanvasRefusalCode =
  | 'busy' | 'busy_elsewhere' | 'cap_reached' | 'stale_view' | 'not_retryable' | 'not_offered' | 'expired' | 'draft_empty' | 'no_changes'
  | 'box_full' | 'duplicate' | 'not_found';   // P1621 hand-add: box full / same words in the box; remove: the point is not on this draft
const REFUSAL_CODES: ReadonlySet<string> = new Set([
  'busy', 'busy_elsewhere', 'cap_reached', 'stale_view', 'not_retryable', 'not_offered', 'expired', 'draft_empty', 'no_changes',
  'box_full', 'duplicate', 'not_found',
]);
/** The refusal as a typed result; `revision` is the draft's current one, to re-read against. */
export interface CanvasRefused { ok: false; refused: CanvasRefusalCode; revision: number | null }
/** `inProgress`: the run is already running, or already finished well (a second post of the same file): nothing was lost, and nothing more is started. */
export type UploadResult = { ok: true; label: string; chars: number; inProgress?: boolean } | { ok: false; code: CanvasDraftErrorCode };

/* eslint-disable @typescript-eslint/no-explicit-any -- rpc and table rows are jsonb-shaped: mapped field by field below */
export type Row = Record<string, any>;

/** A refusal the person can act on (not a bug, so never reported): too many open drafts, a run is active, nothing to publish. */
export class CanvasDraftRefusal extends Error {
  constructor(readonly code: 'TOO_MANY_DRAFTS' | 'RUN_ACTIVE' | 'NOTHING_TO_PUBLISH' | 'CLOSED') {
    super(code);
    this.name = 'CanvasDraftRefusal';
  }
}

const REFUSALS: Record<string, CanvasDraftRefusal['code']> = {
  '54000': 'TOO_MANY_DRAFTS',
  '55006': 'RUN_ACTIVE',
};

/** Throws the refusal for a Postgres error code the person can act on, else the usual logged error. */
export function failRpc(context: string, error: { code?: string } | null, message: string, byMessage?: (m: string) => CanvasDraftRefusal['code'] | null): never {
  const refusal = (error?.code && REFUSALS[error.code]) || byMessage?.(String((error as { message?: string } | null)?.message ?? ''));
  if (refusal) throw new CanvasDraftRefusal(refusal);
  return throwDbError(context, error as never, message);
}

const CODES: ReadonlySet<string> = new Set([
  'BUSY', 'LIMIT', 'REVISION_CAP', 'TERMS_NOT_ACCEPTED', 'DISABLED', 'NOT_AVAILABLE',
  'TOO_LARGE', 'UNSUPPORTED', 'UNREADABLE', 'DRAFT_CLOSED', 'CAPPED', 'BAD_REQUEST', 'NOT_READY', 'GONE', 'TIMEOUT',
]);

function asCode(v: unknown, status: number): CanvasDraftErrorCode {
  if (typeof v === 'string' && CODES.has(v)) return v as CanvasDraftErrorCode;
  return status === 429 ? 'CAPPED' : 'FAILED';
}

/**
 * The one place the `canvas-draft` function is called: status code and JSON body, whether it succeeded or not.
 * The cache is cleared after every call that writes (a run or an upload writes the draft's points and material); the
 * availability question is a read, and clearing on it would drop the canvas page's Back entry on every page view.
 */
async function callCanvasDraft(body: Record<string, unknown> | FormData, writes = true): Promise<{ status: number; data: Row }> {
  try {
    const { data, error } = await supabase.functions.invoke('canvas-draft', { body });
    if (!error) return { status: 200, data: (data ?? {}) as Row };
    const response = (error as { context?: Response }).context;
    if (response && typeof response.status === 'number') {
      let parsed: Row = {};
      try {
        parsed = (await response.clone().json()) as Row;
      } catch {
        /* not JSON */
      }
      return { status: response.status, data: parsed };
    }
    return { status: 0, data: {} };
  } finally {
    if (writes) clearListReturnCache();
  }
}

/**
 * Whether canvas drafting is on for this project: true or false when the server said so, null when the request failed
 * (network, cold start, auth not ready) and the answer is unknown, so the caller may ask again. Same rule as the mirror's.
 */
export async function getCanvasDraftAvailability(): Promise<boolean | null> {
  const { status, data } = await callCanvasDraft({ availability: true }, false);
  if (status !== 200) return null;
  return data.enabled === true;
}

/**
 * Start one run by its id: the id a user function (`canvas_workspace_send`, a retry, a focus switch, a fork) returned. The
 * function begins it and works after the response. A second call on a running run is answered 202 and starts nothing, so
 * calling again after a reload is safe. NOT_READY: a voice note whose transcript is pending (call again when it is done).
 */
export async function startCanvasRun(runId: string): Promise<RunStart> {
  const { status, data } = await callCanvasDraft({ run_id: runId });
  if (status === 200 || status === 202) {
    const kind = data.kind === 'focus' || data.kind === 'fork_first' ? data.kind : 'message';
    return typeof data.run_id === 'string' ? { ok: true, runId: data.run_id, kind } : { ok: false, code: 'FAILED' };
  }
  return { ok: false, code: asCode(data.code, status) };
}

/**
 * Starts the draft's queued run, if it has one: a message was sent and its run was made, but the call that starts it did not
 * go through (the tab closed, the network dropped). Nothing queued: NOT_AVAILABLE. In v6 a run begins when a message is
 * sent; this is only the way to start one that did not begin.
 */
export async function startQueuedCanvasRun(draftId: string): Promise<RunStart> {
  const { data, error } = await supabase.from('canvas_draft_runs').select('id').eq('draft_id', draftId).eq('state', 'queued')
    .order('created_at', { ascending: false }).limit(1);
  if (error) throwDbError('startQueuedCanvasRun', error, 'Could not read this draft');
  const id = ((data ?? []) as Row[])[0]?.id;
  return typeof id === 'string' ? await startCanvasRun(id) : { ok: false, code: 'NOT_AVAILABLE' };
}

/**
 * The owner's one read of a canvas's drafting state (`get_canvas_draft_state`). Its first step is the server's expire step: a queued run past its
 * 3-minute lease, or a running one past 5 minutes, is failed there (its message then shows Try again). The answer is not used: this is how a client
 * that sees a run still "active" past its lease makes the database settle it, since the plain table reads of the run never do.
 */
export async function getCanvasDraftState(canvasId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('get_canvas_draft_state', { p_canvas: canvasId });
    if (error) throwDbError('getCanvasDraftState', error, 'Could not read this draft');
  } finally {
    clearListReturnCache(); // it can fail a run (a write the cached lists never show, but every function that writes clears, so this one does too)
  }
}

/**
 * The file of an upload run (`canvas_workspace_send` with a file attachment made the run): ONE request. The function claims
 * the run, reads the file to text (the bytes are never stored), writes it as material of the message and drafts, all in that
 * invocation; a file it cannot read fails the run there.
 */
export async function uploadCanvasMaterial(runId: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('run_id', runId);
  form.append('file', file);
  const { status, data } = await callCanvasDraft(form);
  if ((status === 200 || status === 202) && data.state === 'running' && typeof data.label !== 'string') return { ok: true, label: '', chars: 0, inProgress: true };
  if ((status === 200 || status === 202) && typeof data.label === 'string') return { ok: true, label: data.label, chars: typeof data.chars === 'number' ? data.chars : 0 };
  // A repeat of a post the server had already served (the first answer was lost): the run is over and it ended well, so the file WAS applied.
  // GONE with any other state (failed, capped, cancelled, undone) is a real refusal.
  if (status === 409 && data.code === 'GONE' && data.state === 'done') return { ok: true, label: '', chars: 0, inProgress: true };
  return { ok: false, code: asCode(data.code, status) };
}

// ── v6 draft functions: typed results ──────────────────────────────────────

/** The refusal in an RPC answer ({status:'refused', code, revision}), or null for a success. */
export function refusalOf(data: Row | null): CanvasRefused | null {
  if (!data || data.status !== 'refused') return null;
  const code = String(data.code);
  if (!REFUSAL_CODES.has(code)) return null;
  return { ok: false, refused: code as CanvasRefusalCode, revision: typeof data.revision === 'number' ? data.revision : null };
}

export interface SendCanvasMessageArgs {
  /** The canvas, or null for a new one (then no version, draft or replace). */
  canvasId: string | null;
  /** A published version to open the draft from when none is open. */
  fromVersionId?: string | null;
  /** The open draft the screen shows (null: it shows none) and the revision of it the person last saw. */
  expectedDraftId?: string | null;
  expectedRevision?: number | null;
  /** Discard the open draft first, in the same transaction ("Start over from vN"). */
  replace?: boolean;
  body?: string | null;
  /** The boxes the message is tagged with (Add to chat). */
  boxRefs?: string[] | null;
  /** `{kind:'file', label}` (post the file with `uploadCanvasMaterial` next). A voice note is not sent here: it goes through chat-voice (canvas-voice-service), which the database requires. */
  attachment?: { kind: 'file'; label: string } | null;
  /** Makes the send idempotent: a repeat returns the first result. */
  clientId: string;
  /** Called with the thread's root as soon as the database has answered OK, before the run is started (that request can be slow). */
  onThreadKnown?: (rootId: string) => void;
}
export interface CanvasSent {
  ok: true;
  runId: string;
  revision: number;
  draftId: string;
  canvasId: string;
  canvasName: string;
  versionName: string;
  threadRootId: string;
  conversationId: string;
  messageId: string;
  replayed: boolean;
  /** A text message is started at once; a file waits for its upload and a voice note for its transcript (null). */
  start: RunStart | null;
}

/** The success answer of the canvas send (`canvas_workspace_send`, and `canvas_voice_send` through chat-voice) as the client reads it. */
export function canvasSentOf(r: Row): CanvasSent {
  return {
    ok: true, runId: String(r.run_id), revision: Number(r.revision), draftId: String(r.draft_id), canvasId: String(r.canvas_id),
    canvasName: String(r.canvas_name ?? ''), versionName: String(r.version_name ?? ''), threadRootId: String(r.thread_root_id),
    conversationId: String(r.conversation_id), messageId: String(r.message_id), replayed: r.replayed === true, start: null,
  };
}

/**
 * Sends one owner message (text or an upload) and makes the one queued run that applies it, in one database
 * call: this replaces `canvas_draft_open` followed by a separate send. A text message then starts its run. Refusals are a
 * typed result (`ok: false`), never a throw: busy, busy_elsewhere, cap_reached, stale_view.
 */
export async function sendCanvasWorkspaceMessage(a: SendCanvasMessageArgs): Promise<CanvasSent | CanvasRefused> {
  try {
    const { data, error } = await supabase.rpc('canvas_workspace_send', {
      p_canvas: a.canvasId,
      p_from_version: a.fromVersionId ?? null,
      p_expected_draft: a.expectedDraftId ?? null,
      p_expected_revision: a.expectedRevision ?? null,
      p_replace: a.replace === true,
      p_body: a.body ?? null,
      p_box_refs: a.boxRefs?.length ? a.boxRefs : null,
      p_attachment: a.attachment ?? null,
      p_client_id: a.clientId,
    });
    if (error || !data) failRpc('sendCanvasWorkspaceMessage', error, 'Could not send this message');
    const r = data as Row;
    const refused = refusalOf(r);
    if (refused) return refused;
    const sent = canvasSentOf(r);
    a.onThreadKnown?.(sent.threadRootId);
    if (!a.attachment && !sent.replayed) sent.start = await startCanvasRun(sent.runId);
    return sent;
  } finally {
    clearListReturnCache();
  }
}

/**
 * Opens a draft: a new canvas (no version) or a new version started from one of the caller's published versions.
 * Throws on a database refusal; the error keeps its Postgres `code` (54000: too many open drafts).
 */
export async function openCanvasDraft(fromVersionId: string | null = null): Promise<OpenDraftResult> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_open', { p_from_version: fromVersionId });
    if (error || !data) failRpc('openCanvasDraft', error, 'Could not start a canvas draft');
    const r = data as Row;
    return openedResultOf(r, r.status === 'open_elsewhere' ? 'open_elsewhere' : 'opened', await readOpenedDraft(String(r.draft_id)));
  } finally {
    clearListReturnCache();
  }
}

/** The draft's revision as it is now (owner column grant). A failed read is an error, never a made-up 0 (which would make the next action stale_view). */
export async function readOpenedDraft(draftId: string): Promise<{ revision: number; canvasId: string; versionName: string | null }> {
  const { data, error } = await supabase.from('canvas_drafts').select('revision, canvas_id, version_name').eq('id', draftId).maybeSingle();
  if (error) throwDbError('readOpenedDraft', error, 'Could not read this draft');
  const row = data as { revision?: unknown; canvas_id?: unknown; version_name?: unknown } | null;
  if (typeof row?.revision !== 'number' || typeof row.canvas_id !== 'string') throw new Error('Could not read this draft');
  return { revision: row.revision, canvasId: row.canvas_id, versionName: typeof row.version_name === 'string' ? row.version_name : null };
}

/** The draft's revision as it is now. */
export async function getCanvasDraftRevision(draftId: string): Promise<number> {
  return (await readOpenedDraft(draftId)).revision;
}

/** A stale_view means the screen holds an old revision: tell whoever shows this draft to re-read, so the next attempt sends the new one. */
export function staleToEvent(refused: CanvasRefused, draftId: string): CanvasRefused {
  if (refused.refused === 'stale_view') emitCanvasDraftEvent({ kind: 'updated', draftId });
  return refused;
}

/**
 * Discards an open draft the person last saw at `expectedRevision`. `{ ok: true, discarded: false }`: it was already closed.
 * A refusal is a typed result: busy while a run is active, stale_view when the draft changed since.
 */
export async function discardCanvasDraft(draftId: string, expectedRevision: number): Promise<{ ok: true; discarded: boolean } | CanvasRefused> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_discard', { p_draft: draftId, p_expected_revision: expectedRevision });
    if (error) failRpc('discardCanvasDraft', error, 'Could not discard this draft');
    const refused = refusalOf(data as Row | null);
    if (refused) return staleToEvent(refused, draftId);
    // Whoever else shows this draft (the canvas page beside its thread) re-reads: it is closed now, wherever it was closed.
    emitCanvasDraftEvent({ kind: 'discarded', draftId });
    const r = data as Row | boolean | null;
    return { ok: true, discarded: typeof r === 'object' && r !== null ? r.discarded !== false : r === true };
  } finally {
    clearListReturnCache();
  }
}

/**
 * Publishes an open draft the person last saw at `expectedRevision`. `seq` is the version number it got; `skippedLinks` counts
 * supersede links that were not kept. `replyMessageId` is the publish reply the server posted into the thread (null when the answer carried none: the
 * toast reads its first line, 3c X15) and `openOffers` the offers still open on it (the toast's "See offer"). Refusals are typed results: busy,
 * stale_view, draft_empty, no_changes.
 */
export async function publishCanvasDraft(draftId: string, expectedRevision: number): Promise<{ ok: true; seq: number; skippedLinks: number; replyMessageId: string | null; openOffers: number } | CanvasRefused> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_publish', { p_draft: draftId, p_expected_revision: expectedRevision });
    if (error || !data) {
      failRpc('publishCanvasDraft', error, 'Could not publish this draft'); // v6 raises only for authorization or a bad link: every state refusal is a typed result
    }
    const r = data as Row;
    const refused = refusalOf(r);
    if (refused) return staleToEvent(refused, draftId);
    emitCanvasDraftEvent({ kind: 'published', draftId });
    return { ok: true, seq: Number(r.seq), skippedLinks: Number(r.skipped_links ?? 0), replyMessageId: typeof r.reply_message_id === 'string' ? r.reply_message_id : null, openOffers: Number(r.open_offers ?? 0) };
  } finally {
    clearListReturnCache();
  }
}

