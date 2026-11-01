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
  | { ok: false; why: 'no_version' | 'versions_failed' | 'refused' | 'too_large' };


async function versionOf(projectTag: string, version: string | null) {
  const all = await listMyCanvasVersions();
  return all.find(v => v.canvasName === projectTag && v.name === version) ?? null;
}

/**
 * The first Send on a published canvas: opens the next draft from the version on screen and queues its first run.
 * Throws when the outcome is unknown (the network): call again with the same message and the same id is used.
 */
export async function openNextDraft(args: { projectTag: string; version: string | null; body?: string; file?: File }): Promise<NextDraftResult> {
  const { projectTag, version, body, file } = args;
  if (file && file.size > MAX_UPLOAD_BYTES) return { ok: false, why: 'too_large' };
  let from: Awaited<ReturnType<typeof versionOf>>;
  try {
    from = await versionOf(projectTag, version);
  } catch {
    return { ok: false, why: 'versions_failed' }; // nothing was sent: not an unknown outcome
  }
  if (!from) return { ok: false, why: 'no_version' };
  const key = `${from.canvasId}|${from.id}|${file ? `file:${file.name}:${file.size}` : `text:${body ?? ''}`}`;
  const sent = await sendCanvasWorkspaceMessage({
    canvasId: from.canvasId, fromVersionId: from.id, expectedDraftId: null, expectedRevision: null,
    ...(file ? { attachment: { kind: 'file' as const, label: file.name } } : { body }),
    clientId: clientIdFor(key),
  });
  if (!sent.ok) {
    unresolved.delete(key); // a definite refusal: the next attempt is a new one
    return { ok: false, why: 'refused' };
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

