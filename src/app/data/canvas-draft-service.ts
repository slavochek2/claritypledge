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
import { canvasDisplayTitle } from '@/lib/canvas-boxes';
import { ARTIFACTS_CANVASES_MINE, newestPublishedHref, publishedViewHref, workspaceHref } from '@/lib/canvas-hrefs';
import { throwDbError } from './db-error-logger';
import { listMyCanvases } from './canvas-artifacts';
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
  /** `voice`: the run waits for a transcript. Null when the server did not say (an older read). */
  inputKind: string | null;
  /** When a voice run's transcript landed (its dispatch lease counts from here); null while it has not. */
  readyAt: string | null;
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
  /** P1536 W8: the owner's display title for the canvas (null: never renamed) */
  canvasTitle?: string | null;
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
    canvasTitle: typeof r.canvas_title === 'string' ? r.canvas_title : null,
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
    .select('id, kind, state, error_code, created_at, started_at, input_kind, ready_at')
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
    inputKind: typeof r.input_kind === 'string' ? r.input_kind : null,
    readyAt: typeof r.ready_at === 'string' ? r.ready_at : null,
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
 * What a canvas-version attachment shows (W0/W4): the canvas title, the state of its version ("Draft" for the viewer's own open
 * draft, "v{seq}" for a published one, "Discarded" for a draft thrown away) and where its Open goes. `null`: neither a version of
 * the viewer's nor their draft ("Not available to you").
 *  - open draft: Open is the workspace on it;
 *  - published version: Open is that version, or the workspace on the canvas's open draft when it has one;
 *  - discarded draft: Open is the canvas at its newest published version, or Artifacts when nothing was ever published.
 * `href` is the same address, kept for callers that link the whole card.
 */
export interface CanvasVersionCardData {
  /** The canvas's display title (the owner's rename, else its tag read as a title): a published version's and an open draft's card both carry it. */
  title?: string;
  /** The canvas the card shows (a card follows its canvas's rename); absent when the read did not name it. */
  canvasId?: string;
  /** An open draft: the number it gets when published (one above the newest published version), when known. */
  nextSeq?: number | null;
  label: string;
  state: 'draft' | 'published' | 'discarded';
  draft: boolean;
  href: string | null;
  /** Where Open goes; null when the viewer's address is not readable. */
  openHref: string | null;
  /** A published card: the number of the version it is (3c X10: "v2 · date" is the version the thread's draft became). */
  seq?: number;
  /** True when the card was read from the draft whose thread this is (X10); absent when it fell back to the version the root attaches. */
  hasThread?: boolean;
  /** The draft whose thread it is, when `hasThread`. */
  draftId?: string;
}

/**
 * What a draft's card says about its canvas (J-W5: "Canvas 4 · v2 · Draft"): the display title and the number the draft gets. A canvas with a
 * published version has both on its version rows; one never published gets its title from the owner's canvases read (a failed read falls back to the
 * tag's own title, never hides the card).
 */
async function draftCardFacts(canvasName: string, versions: CanvasVersionOption[]): Promise<{ title: string; nextSeq: number }> {
  const mine = versions.filter((v) => v.canvasName === canvasName);
  const nextSeq = mine.reduce((top, v) => Math.max(top, v.seq), 0) + 1;
  if (mine[0]) return { title: canvasDisplayTitle(mine[0].canvasTitle, canvasName), nextSeq };
  const row = await listMyCanvases().then((rows) => rows.find((r) => r.name === canvasName), () => undefined);
  return { title: canvasDisplayTitle(row?.title, canvasName), nextSeq };
}

export async function getCanvasVersionCard(versionId: string, viewerId: string): Promise<CanvasVersionCardData | null> {
  const versions = await listMyCanvasVersions();
  const v = versions.find((x) => x.id === versionId);
  if (v) {
    const slug = await getProfileSlug(viewerId, 'getCanvasVersionCard');
    const own = slug ? publishedViewHref(slug, v.canvasName, v.name) : null;
    // 3c X10: View is that version, plain, whatever else is open on the canvas (W1's redirect to an open draft is superseded).
    return { title: canvasDisplayTitle(v.canvasTitle, v.canvasName), canvasId: v.canvasId, label: canvasVersionLabel(v.seq, v.publishedAt), state: 'published', draft: false, href: own, openHref: own, seq: v.seq };
  }
  const { data, error } = await supabase.from('canvas_drafts').select('id, canvas_id, canvas_name, version_name, state').eq('version_id', versionId).maybeSingle();
  if (error) throwDbError('getCanvasVersionCard', error, 'Could not read this canvas');
  if (!data) return null;
  const d = data as Row;
  const slug = d.canvas_name ? await getProfileSlug(viewerId, 'getCanvasVersionCard').catch(() => null) : null;
  if (d.state === 'discarded') {
    const kept = versions.some((x) => x.canvasName === d.canvas_name);
    const open = slug && d.canvas_name ? (kept ? newestPublishedHref(slug, d.canvas_name) : ARTIFACTS_CANVASES_MINE) : null;
    return { label: 'Discarded', state: 'discarded', draft: false, href: open, openHref: open };
  }
  const open = slug && d.canvas_name && d.version_name ? workspaceHref(slug, d.canvas_name, d.version_name) : null;
  const facts = d.canvas_name ? await draftCardFacts(String(d.canvas_name), versions) : null;
  return { ...(facts ? { title: facts.title, nextSeq: facts.nextSeq } : {}), ...(d.canvas_id ? { canvasId: String(d.canvas_id) } : {}), label: 'Draft', state: 'draft', draft: true, href: open, openHref: open };
}

/**
 * 3c X10 (a card says what its thread is): a canvas thread root's card, read from the draft whose `thread_root_id` is this message, never from the
 * version the root attaches (a clone's root attaches its BASE, so the attached version said "published" while the draft was live).
 *  - open draft:       the (Draft) tag, the number it gets, Open draft: the workspace;
 *  - published draft:  `v2 · date` (the version the draft became), View: that version, plain, with no `ws=1` whatever else is open;
 *  - discarded draft:  says so; its Open address is kept for the canvas page, but the card draws no button for it.
 * A root with no draft row the viewer can read falls back to the attached version's own card, as before, and says so (`hasThread` absent).
 */
async function readCanvasRootCard(rootId: string, versionId: string, viewerId: string): Promise<CanvasVersionCardData | null> {
  const draft = await getCanvasDraftByThread(rootId);
  if (!draft) return getCanvasVersionCard(versionId, viewerId);
  const versions = await listMyCanvasVersions();
  const slug = draft.canvasName ? await getProfileSlug(viewerId, 'getCanvasRootCard').catch(() => null) : null;
  const thread = { hasThread: true, draftId: draft.id };
  if (draft.state === 'discarded') {
    const title = draft.canvasName ? (await draftCardFacts(draft.canvasName, versions)).title : undefined;
    const kept = versions.some((x) => x.canvasName === draft.canvasName);
    const open = slug && draft.canvasName ? (kept ? newestPublishedHref(slug, draft.canvasName) : ARTIFACTS_CANVASES_MINE) : null;
    return { ...(title ? { title } : {}), canvasId: draft.canvasId, label: 'Discarded', state: 'discarded', draft: false, href: open, openHref: open, ...thread };
  }
  if (draft.state === 'published') {
    const v = versions.find((x) => x.id === draft.versionId);
    const view = slug && v ? publishedViewHref(slug, v.canvasName, v.name) : null;
    return {
      title: v ? canvasDisplayTitle(v.canvasTitle, v.canvasName) : 'Canvas', canvasId: draft.canvasId, label: v ? canvasVersionLabel(v.seq, v.publishedAt) : 'Published',
      state: 'published', draft: false, href: view, openHref: view, ...(v ? { seq: v.seq } : {}), ...thread,
    };
  }
  const open = slug && draft.canvasName && draft.versionName ? workspaceHref(slug, draft.canvasName, draft.versionName) : null;
  const facts = draft.canvasName ? await draftCardFacts(draft.canvasName, versions) : null;
  return { ...(facts ? { title: facts.title, nextSeq: facts.nextSeq } : {}), canvasId: draft.canvasId, label: 'Draft', state: 'draft', draft: true, href: open, openHref: open, ...thread };
}

/** Reads of a root's card still in flight, shared: the card and its "N replies" link of one message mount together and ask once. Dropped when settled, so nothing here goes stale. */
const rootCardReads = new Map<string, Promise<CanvasVersionCardData | null>>();

export function getCanvasRootCard(rootId: string, versionId: string, viewerId: string): Promise<CanvasVersionCardData | null> {
  const key = `${viewerId}|${rootId}|${versionId}`;
  const open = rootCardReads.get(key);
  if (open) return open;
  const read = readCanvasRootCard(rootId, versionId, viewerId).finally(() => rootCardReads.delete(key));
  rootCardReads.set(key, read);
  return read;
}
