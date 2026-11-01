/**
 * @file workspace-next-draft.ts
 * @description P1536 J3: the words and the one call of the workspace's chat on a published canvas with no open draft. Nothing is
 * written until the first Send (text or a file), which opens the next draft from the version on screen (`canvas_workspace_send`).
 *
 * IDEMPOTENCE: the call carries a client id so a repeat returns the first result. The id is kept for the SAME message until its
 * outcome is known (a success, or a definite refusal): a lost response (a thrown error) leaves it in place, so the retry replays
 * instead of opening a second draft.
 */
import { listMyCanvasVersions, sendCanvasWorkspaceMessage } from '@/app/data/canvas-draft-service';
import { MAX_UPLOAD_BYTES } from '@/app/pages/chat/canvas-thread-copy';
import { postFile } from '@/app/pages/chat/use-canvas-uploads';

// [FOUNDER DECISION F1: spec J3 proposes this exact sentence as the chat's empty state on a published canvas.]
export const WORKSPACE_EMPTY_TEXT = 'Talk about any box. Nothing changes for readers until you publish.';

/** The client id of each first Send still unresolved, by what it says (canvas, version, text or file). */
const unresolved = new Map<string, string>();
/** Runs whose file this page already delivered: a replay (the first response was lost) posts the bytes only when they are not in yet. */
const delivered = new Set<string>();

/** Tests only. */
export function resetUnresolvedFirstSends(): void {
  unresolved.clear();
  delivered.clear();
}

function clientIdFor(key: string): string {
  let id = unresolved.get(key);
  if (!id) {
    id = crypto.randomUUID();
    unresolved.set(key, id);
  }
  return id;
}

export type NextDraftResult =
  | { ok: true; versionName: string }
  | { ok: false; why: 'no_version' | 'versions_failed' | 'refused' | 'too_large' | 'stale_view' };

/** J4 "Start over from vN": the open draft of another base that the first Send discards in its own transaction, as the screen last saw it. */
export interface ReplaceDraft { draftId: string; revision: number }


/** What a first Send says it is: the same canvas, version, replaced draft and text/file are the same message (so a repeat replays). */
function sendKey(from: { canvasId: string; id: string }, replace: ReplaceDraft | null, input: { body?: string; file?: File }): string {
  const what = input.file ? `file:${input.file.name}:${input.file.size}` : `text:${input.body ?? ''}`;
  return `${from.canvasId}|${from.id}|${replace ? `replace:${replace.draftId}:${replace.revision}|` : ''}${what}`;
}

/** The refusal as the caller sees it. J4: a stale_view over a draft being replaced is its own case (ask again, keep the text). */
function refusalOf(refused: string, replace: ReplaceDraft | null): NextDraftResult {
  return { ok: false, why: replace && refused === 'stale_view' ? 'stale_view' : 'refused' };
}

async function versionOf(projectTag: string, version: string | null) {
  const all = await listMyCanvasVersions();
  return all.find(v => v.canvasName === projectTag && v.name === version) ?? null;
}

/**
 * The first Send on a published canvas: opens the next draft from the version on screen and queues its first run.
 * Throws when the outcome is unknown (the network): call again with the same message and the same id is used.
 */
export async function openNextDraft(args: { projectTag: string; version: string | null; body?: string; file?: File; replace?: ReplaceDraft | null }): Promise<NextDraftResult> {
  const { projectTag, version, body, file, replace = null } = args;
  if (file && file.size > MAX_UPLOAD_BYTES) return { ok: false, why: 'too_large' };
  let from: Awaited<ReturnType<typeof versionOf>>;
  try {
    from = await versionOf(projectTag, version);
  } catch {
    return { ok: false, why: 'versions_failed' }; // nothing was sent: not an unknown outcome
  }
  if (!from) return { ok: false, why: 'no_version' };
  const key = sendKey(from, replace, { body, file });
  const sent = await sendCanvasWorkspaceMessage({
    canvasId: from.canvasId, fromVersionId: from.id, expectedDraftId: replace?.draftId ?? null, expectedRevision: replace?.revision ?? null, ...(replace ? { replace: true } : {}),
    ...(file ? { attachment: { kind: 'file' as const, label: file.name } } : { body }),
    clientId: clientIdFor(key),
  });
  if (!sent.ok) {
    unresolved.delete(key); // a definite refusal: the next attempt is a new one
    return refusalOf(sent.refused, replace);
  }
  unresolved.delete(key);
  // A file is posted with the id of the run the send made; if the post fails the draft is open and a toast says so.
  // A replay means an earlier attempt's response was lost, so its bytes may never have gone: post them unless this page already did.
  if (file && !delivered.has(sent.runId)) {
    const r = await postFile(sent.runId, file).catch(() => null);
    if (r?.ok) delivered.add(sent.runId);
  }
  return { ok: true, versionName: sent.versionName };
}

