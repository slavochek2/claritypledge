/**
 * @file canvas-draft-service.ts
 * @description P1536: the client side of a canvas draft version, made in a thread with the owner's mirror.
 *
 * The database and the `canvas-draft` edge function own every rule (supabase/migrations/*_p1536_*, supabase/functions/canvas-draft).
 * Nothing here decides who may see or publish what: every read is RLS-filtered to the owner, every write is a checked
 * function that proves ownership, and the model call is gated, capped and paid for on the server.
 *
 * Every write clears the list-return cache after it (success or failure): a draft opened or published changes what the
 * 'canvas' Back entry shows (src/tests/p1364-cache-invalidation-drift-guard derives the writing names from the migrations).
 */

import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { canvasTitle } from '@/lib/canvas-boxes';
import { throwDbError } from './db-error-logger';
import { emitCanvasDraftEvent } from './canvas-draft-events';

export type CanvasDraftState = 'open' | 'published' | 'discarded';
/** `cancelled`: erasing a person's data stopped the run (the database already writes it). */
export type CanvasRunState = 'queued' | 'running' | 'done' | 'failed' | 'capped' | 'cancelled';

export interface CanvasDraft {
  id: string;
  /** The draft's own version row (what a published thread's "Start a new version?" starts from). */
  versionId: string;
  canvasId: string;
  baseVersionId: string | null;
  conversationId: string;
  threadRootId: string;
  state: CanvasDraftState;
  /** Draft runs that finished and counted: above 0 there is something to publish. */
  runCount: number;
  /** When the draft was published or discarded (null while open): what separates "before Publish" from "after". */
  closedAt: string | null;
  /**
   * The draft's own address, when the database lets the owner read it (null otherwise). Together they make the canvas
   * page on the draft version: `/p/<slug>/canvas/<canvasName>?v=<versionName>`.
   */
  canvasName: string | null;
  versionName: string | null;
}

export interface CanvasDraftRun {
  id: string;
  kind: 'tensions' | 'draft' | 'extract';
  state: CanvasRunState;
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
}

/** One thing the owner gave the draft: the text that was read, never the file. */
export interface CanvasMaterialItem {
  id: string;
  kind: 'file' | 'link';
  label: string;
  chars: number;
  /** When the text was kept (the database's own clock): what a reload still knows about "added since the last draft". */
  createdAt: string;
}

/** A published version of one of the caller's canvases (what the paperclip lists). */
export interface CanvasVersionOption {
  id: string;
  canvasId: string;
  canvasName: string;
  /** The internal name that keys `?v=`; never shown to a person. */
  name: string;
  seq: number;
  publishedAt: string;
  hasOpenDraft: boolean;
}

/** `open_elsewhere`: the canvas already has an open draft, in another thread. Nothing new was made. */
export type OpenDraftResult = {
  status: 'opened' | 'open_elsewhere';
  draftId: string;
  conversationId: string;
  threadRootId: string;
  canvasName: string;
  /** The published version the (open or new) draft started from, or null for a brand-new canvas. */
  fromSeq: number | null;
};

/** What the edge function answered to a run or an upload: a stable code the UI turns into a sentence. */
export type CanvasDraftErrorCode =
  | 'BUSY' | 'LIMIT' | 'REVISION_CAP' | 'TERMS_NOT_ACCEPTED' | 'DISABLED' | 'NOT_AVAILABLE'
  | 'TOO_LARGE' | 'UNSUPPORTED' | 'UNREADABLE' | 'DRAFT_CLOSED' | 'CAPPED' | 'BAD_REQUEST' | 'FAILED';

export type RunStart = { ok: true; runId: string; kind: 'tensions' | 'draft' } | { ok: false; code: CanvasDraftErrorCode };
export type UploadResult = { ok: true; label: string; chars: number } | { ok: false; code: CanvasDraftErrorCode };

/* eslint-disable @typescript-eslint/no-explicit-any -- rpc and table rows are jsonb-shaped: mapped field by field below */
type Row = Record<string, any>;

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
function failRpc(context: string, error: { code?: string } | null, message: string, byMessage?: (m: string) => CanvasDraftRefusal['code'] | null): never {
  const refusal = (error?.code && REFUSALS[error.code]) || byMessage?.(String((error as { message?: string } | null)?.message ?? ''));
  if (refusal) throw new CanvasDraftRefusal(refusal);
  return throwDbError(context, error as never, message);
}

const CODES: ReadonlySet<string> = new Set([
  'BUSY', 'LIMIT', 'REVISION_CAP', 'TERMS_NOT_ACCEPTED', 'DISABLED', 'NOT_AVAILABLE',
  'TOO_LARGE', 'UNSUPPORTED', 'UNREADABLE', 'DRAFT_CLOSED', 'CAPPED', 'BAD_REQUEST',
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
 * Start one run. The client only ever asks for the fast speed (one create button, the draft starts straight away). An
 * answer that begins with the tensions pass (an older server) is still read, so the run's progress shows.
 */
export async function runCanvasDraft(draftId: string): Promise<RunStart> {
  const { status, data } = await callCanvasDraft({ draft_id: draftId, speed: 'fast' });
  if (status === 200 || status === 202) {
    if (typeof data.run_id === 'string') return { ok: true, runId: data.run_id, kind: data.kind === 'tensions' ? 'tensions' : 'draft' };
    return { ok: false, code: 'FAILED' };
  }
  return { ok: false, code: asCode(data.code, status) };
}

/** One file, one at a time (the server reads it to text and keeps only the text). */
export async function uploadCanvasMaterial(draftId: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('draft_id', draftId);
  form.append('file', file);
  const { status, data } = await callCanvasDraft(form);
  if (status === 200 && typeof data.label === 'string') return { ok: true, label: data.label, chars: typeof data.chars === 'number' ? data.chars : 0 };
  return { ok: false, code: asCode(data.code, status) };
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
    return {
      status: r.status === 'open_elsewhere' ? 'open_elsewhere' : 'opened',
      draftId: String(r.draft_id),
      conversationId: String(r.conversation_id),
      threadRootId: String(r.thread_root_id),
      canvasName: String(r.canvas_name ?? ''),
      fromSeq: typeof r.from_seq === 'number' ? r.from_seq : null,
    };
  } finally {
    clearListReturnCache();
  }
}

/** Discards an open draft. False when it was already closed. Refused (55006) while a run is active. */
export async function discardCanvasDraft(draftId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_discard', { p_draft: draftId });
    if (error) failRpc('discardCanvasDraft', error, 'Could not discard this draft');
    // Whoever else shows this draft (the canvas page beside its thread) re-reads: it is closed now, wherever it was closed.
    emitCanvasDraftEvent({ kind: 'discarded', draftId });
    return data === true;
  } finally {
    clearListReturnCache();
  }
}

/** Publishes an open draft. `seq` is the version number it got; `skippedLinks` counts supersede links that were not kept. */
export async function publishCanvasDraft(draftId: string): Promise<{ seq: number; skippedLinks: number }> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_publish', { p_draft: draftId });
    if (error || !data) {
      failRpc('publishCanvasDraft', error, 'Could not publish this draft', (m) =>
        m.includes('nothing to publish') ? 'NOTHING_TO_PUBLISH' : m.includes('closed') ? 'CLOSED' : null);
    }
    const r = data as Row;
    emitCanvasDraftEvent({ kind: 'published', draftId });
    return { seq: Number(r.seq), skippedLinks: Number(r.skipped_links ?? 0) };
  } finally {
    clearListReturnCache();
  }
}

/** The caller's published canvas versions, newest first. */
export async function listMyCanvasVersions(): Promise<CanvasVersionOption[]> {
  const { data, error } = await supabase.rpc('list_my_canvas_versions');
  if (error) throwDbError('listMyCanvasVersions', error, 'Could not load your canvases');
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    canvasId: String(r.canvas_id),
    canvasName: String(r.canvas_name),
    name: String(r.name),
    seq: Number(r.seq),
    publishedAt: String(r.published_at),
    hasOpenDraft: r.has_open_draft === true,
  }));
}

/** "v2 · Oct 26, 2026": versions are labelled automatically; the owner never names one. */
export function canvasVersionLabel(seq: number, publishedAt: string): string {
  return `v${seq} · ${new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const DRAFT_COLUMNS = 'id, version_id, canvas_id, base_version_id, conversation_id, thread_root_id, state, run_count, closed_at, canvas_name, version_name';

function mapDraft(r: Row): CanvasDraft {
  return {
    id: r.id,
    versionId: r.version_id,
    canvasId: r.canvas_id,
    baseVersionId: r.base_version_id ?? null,
    conversationId: r.conversation_id,
    threadRootId: r.thread_root_id,
    state: r.state === 'published' || r.state === 'discarded' ? r.state : 'open',
    runCount: Number(r.run_count ?? 0),
    closedAt: r.closed_at ?? null,
    canvasName: r.canvas_name ?? null,
    versionName: r.version_name ?? null,
  };
}

async function getProfileSlug(profileId: string, context: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('slug').eq('id', profileId).maybeSingle();
  if (error) throwDbError(context, error, 'Could not read this canvas');
  return (data as { slug?: string | null } | null)?.slug ?? null;
}

/**
 * The canvas page on the draft's own version (what "View draft" opens), or null while the draft's names are not
 * readable. Every segment is encoded, so the path is a plain in-app address by construction.
 */
export async function getCanvasDraftViewPath(draft: Pick<CanvasDraft, 'canvasName' | 'versionName'>, viewerId: string): Promise<string | null> {
  if (!draft.canvasName || !draft.versionName) return null;
  const slug = await getProfileSlug(viewerId, 'getCanvasDraftViewPath');
  return slug ? `/p/${slug}/canvas/${encodeURIComponent(draft.canvasName)}?v=${encodeURIComponent(draft.versionName)}` : null;
}

/** How many draft runs of this draft finished well: above 0 there are points to publish, whatever the newest run did. */
export async function countDoneCanvasDraftRuns(draftId: string): Promise<number> {
  const { count, error } = await supabase
    .from('canvas_draft_runs')
    .select('id', { count: 'exact', head: true })
    .eq('draft_id', draftId)
    .eq('kind', 'draft')
    .eq('state', 'done');
  if (error) throwDbError('countDoneCanvasDraftRuns', error, 'Could not read this draft');
  return count ?? 0;
}

/**
 * When the newest DRAFT-kind run that finished began, or null: the one baseline for "new since the last canvas", for a
 * link that "could not be read" and for the Update offer. Extract and tension runs, and failed, capped or cancelled
 * ones, never move it.
 */
export async function getLastDoneCanvasDraftRunAt(draftId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('canvas_draft_runs')
    .select('started_at, created_at')
    .eq('draft_id', draftId)
    .eq('kind', 'draft')
    .eq('state', 'done')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throwDbError('getLastDoneCanvasDraftRunAt', error, 'Could not read this draft');
  const r = ((data ?? []) as Row[])[0];
  return r ? (r.started_at ?? r.created_at ?? null) : null;
}

/** The draft whose thread starts at this message, or null (an ordinary thread, or someone else's). Owner-only through RLS. */
export async function getCanvasDraftByThread(rootId: string): Promise<CanvasDraft | null> {
  const { data, error } = await supabase.from('canvas_drafts').select(DRAFT_COLUMNS).eq('thread_root_id', rootId).maybeSingle();
  if (error) throwDbError('getCanvasDraftByThread', error, 'Could not read this draft');
  return data ? mapDraft(data as Row) : null;
}

/** The newest run of a draft, or null when it has none yet. */
export async function getLatestCanvasRun(draftId: string): Promise<CanvasDraftRun | null> {
  const { data, error } = await supabase
    .from('canvas_draft_runs')
    .select('id, kind, state, error_code, created_at, started_at')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throwDbError('getLatestCanvasRun', error, 'Could not read this draft');
  const r = ((data ?? []) as Row[])[0];
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    state: r.state,
    errorCode: r.error_code ?? null,
    createdAt: r.created_at,
    startedAt: r.started_at ?? null,
  };
}

/** What the draft has read so far (labels and sizes only: the owner never gets the text back). */
export async function listCanvasMaterial(draftId: string): Promise<CanvasMaterialItem[]> {
  const { data, error } = await supabase
    .from('canvas_draft_material')
    .select('id, kind, label, chars, created_at')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true });
  if (error) throwDbError('listCanvasMaterial', error, 'Could not read this draft');
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id, kind: r.kind === 'link' ? 'link' : 'file', label: r.label, chars: Number(r.chars ?? 0), createdAt: r.created_at }));
}

/**
 * What a canvas-version attachment shows: "v{seq}" and a link to its page when it is one of the viewer's published
 * versions, "Draft" when it is the viewer's own draft (linked to its page once the draft's address is readable), null
 * when it is neither ("Not available to you").
 */
export interface CanvasVersionCardData {
  /** The canvas's title (its name, read as a title), when the version is a published one. */
  title?: string;
  label: string;
  draft: boolean;
  href: string | null;
}

export async function getCanvasVersionCard(versionId: string, viewerId: string): Promise<CanvasVersionCardData | null> {
  const versions = await listMyCanvasVersions();
  const v = versions.find((x) => x.id === versionId);
  if (v) {
    const slug = await getProfileSlug(viewerId, 'getCanvasVersionCard');
    return {
      title: canvasTitle(v.canvasName),
      label: canvasVersionLabel(v.seq, v.publishedAt),
      draft: false,
      href: slug ? `/p/${slug}/canvas/${encodeURIComponent(v.canvasName)}?v=${encodeURIComponent(v.name)}` : null,
    };
  }
  const { data, error } = await supabase.from('canvas_drafts').select('id, canvas_name, version_name').eq('version_id', versionId).maybeSingle();
  if (error) throwDbError('getCanvasVersionCard', error, 'Could not read this canvas');
  if (!data) return null;
  const d = data as Row;
  const href = await getCanvasDraftViewPath({ canvasName: d.canvas_name ?? null, versionName: d.version_name ?? null }, viewerId).catch(() => null);
  return { label: 'Draft', draft: true, href };
}
