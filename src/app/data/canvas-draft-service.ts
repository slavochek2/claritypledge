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
import { canvasTitle } from '@/lib/canvas-boxes';
import { throwDbError } from './db-error-logger';
export * from './canvas-draft-calls';
export * from './canvas-draft-retry';

export type CanvasDraftState = 'open' | 'published' | 'discarded';
/** `cancelled`: erasing a person's data stopped the run (the database already writes it). */
/* eslint-disable @typescript-eslint/no-explicit-any -- rows are jsonb-shaped: mapped field by field below */
type Row = Record<string, any>;

export type CanvasRunState = 'queued' | 'running' | 'done' | 'undone' | 'failed' | 'capped' | 'cancelled';

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
  /** Bumped by every change to the draft: Publish, Discard and Send pass the value the person last saw (stale_view otherwise). */
  revision: number;
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
  kind: 'tensions' | 'draft' | 'extract' | 'message' | 'focus' | 'fork_first';
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

const DRAFT_COLUMNS = 'id, version_id, canvas_id, base_version_id, conversation_id, thread_root_id, state, run_count, revision, closed_at, canvas_name, version_name';

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
    revision: Number(r.revision ?? 0),
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

/** The run kinds that draft points: v6's message, focus and fork_first, and the earlier 'draft' (a legacy draft keeps working). */
export const DRAFTING_RUN_KINDS = ['draft', 'message', 'focus', 'fork_first'] as const;
export const isDraftingRunKind = (kind: string | undefined | null): boolean => DRAFTING_RUN_KINDS.some((k) => k === kind);

/** How many draft runs of this draft finished well: above 0 there are points to publish, whatever the newest run did. */
export async function countDoneCanvasDraftRuns(draftId: string): Promise<number> {
  const { count, error } = await supabase
    .from('canvas_draft_runs')
    .select('id', { count: 'exact', head: true })
    .eq('draft_id', draftId)
    .in('kind', DRAFTING_RUN_KINDS)
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
    .in('kind', DRAFTING_RUN_KINDS)
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
