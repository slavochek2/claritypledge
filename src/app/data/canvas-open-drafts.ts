/**
 * @file canvas-open-drafts.ts
 * @description P1536: the owner's open canvas drafts, for the Artifacts list ("v3 · Draft", Open draft, Discard draft).
 *
 * One question, answered without a new database function: the owner reads their own `canvas_drafts` rows through the
 * column grant and RLS policy of the P1536 draft migration (canvas name, conversation, thread root, state), and the number
 * the draft gets when published is one above the newest published version of its canvas, from `list_my_canvas_versions`
 * (the same rule the workspace's Publish spot uses). A failed version read leaves the number unknown ("Draft"); a failed draft
 * read throws, so the list can say its drafts could not be read.
 */
import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';
import { listMyCanvasVersions } from './canvas-draft-service';

export interface OpenCanvasDraft {
  draftId: string;
  /** the canvas's name (what the Artifacts row is keyed by) */
  canvasName: string;
  /** the draft version's internal name: what `?v=` opens the draft canvas by */
  versionName: string;
  /** the owner's mirror conversation and the draft's thread in it */
  conversationId: string;
  threadRootId: string;
  /** the number the draft gets when published; null when the versions could not be read */
  nextSeq: number | null;
  /** The draft's revision as this read saw it: Discard passes it back. */
  revision: number;
}

export async function listMyOpenCanvasDrafts(): Promise<OpenCanvasDraft[]> {
  const { data, error } = await supabase
    .from('canvas_drafts')
    .select('id, canvas_id, canvas_name, version_name, conversation_id, thread_root_id, revision')
    .eq('state', 'open');
  if (error) throwDbError('listMyOpenCanvasDrafts', error, 'Could not read your canvas drafts');
  const rows = (data ?? []) as { id: string; canvas_id: string; canvas_name: string; version_name: string; conversation_id: string; thread_root_id: string; revision?: number }[];
  if (rows.length === 0) return [];
  const versions = await listMyCanvasVersions().catch(() => null);
  return rows.map((r) => ({
    draftId: r.id,
    canvasName: r.canvas_name,
    versionName: r.version_name,
    conversationId: r.conversation_id,
    threadRootId: r.thread_root_id,
    revision: Number(r.revision ?? 0),
    nextSeq: versions ? versions.filter((v) => v.canvasId === r.canvas_id).reduce((top, v) => Math.max(top, v.seq), 0) + 1 : null,
  }));
}
