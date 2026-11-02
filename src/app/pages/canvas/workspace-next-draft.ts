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
import { sendCanvasVoiceNote } from '@/app/data/canvas-voice-service';
import type { VoiceUploadReceipt } from '@/app/data/chat-voice-service';
import { MAX_UPLOAD_BYTES } from '@/app/pages/chat/canvas-thread-copy';
import type { CanvasDraftErrorCode } from '@/app/data/canvas-draft-service';
import { postFile } from '@/app/pages/chat/use-canvas-uploads';
import { createUnresolvedClientIds } from '@/app/pages/chat/unresolved-client-ids';
import { trackCanvasSend } from '@/app/pages/chat/canvas-thread-registry';

/** The client id of each first Send still unresolved, by what it says (canvas, version, text or file). */
const unresolved = createUnresolvedClientIds();
/** Runs whose file this page already delivered: a replay (the first response was lost) posts the bytes only when they are not in yet. */
const delivered = new Set<string>();

/** Tests only. */
export function resetUnresolvedFirstSends(): void {
  unresolved.reset();
  delivered.clear();
}

export type NextDraftResult =
  /** `fileRefusal`: the draft is open but its first file was not read (the post failed or was refused): the caller says so. */
  | { ok: true; versionName: string; fileRefusal?: CanvasDraftErrorCode }
  | { ok: false; why: 'no_version' | 'versions_failed' | 'refused' | 'too_large' | 'stale_view' };

/** J4 "Start over from vN": the open draft of another base that the first Send discards in its own transaction, as the screen last saw it. */
export interface ReplaceDraft { draftId: string; revision: number }


/** What a first Send says it is: the same canvas, version, replaced draft and text/file are the same message (so a repeat replays). */
function sendKey(from: { canvasId: string; id: string }, replace: ReplaceDraft | null, input: { body?: string; file?: File }): string {
  const what = input.file ? `file:${input.file.name}:${input.file.size}:${input.file.lastModified}` : `text:${input.body ?? ''}`;
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
  // The thread this makes is a canvas thread: the mirror must know it before the realtime copy of the message (or the answer) lands.
  const sent = await trackCanvasSend((threadKnown) => sendCanvasWorkspaceMessage({
    canvasId: from.canvasId, fromVersionId: from.id, expectedDraftId: replace?.draftId ?? null, expectedRevision: replace?.revision ?? null, ...(replace ? { replace: true } : {}),
    ...(file ? { attachment: { kind: 'file' as const, label: file.name } } : { body }),
    clientId: unresolved.idFor(key), onThreadKnown: threadKnown,
  }));
  if (!sent.ok) {
    unresolved.settle(key); // a definite refusal: the next attempt is a new one
    return refusalOf(sent.refused, replace);
  }
  unresolved.settle(key);
  // A file is posted with the id of the run the send made; if the post fails the draft is open and the caller says so.
  // A replay means an earlier attempt's response was lost, so its bytes may never have gone: post them unless this page already did.
  let fileRefusal: CanvasDraftErrorCode | undefined;
  if (file && !delivered.has(sent.runId)) {
    const r = await postFile(sent.runId, file).catch(() => ({ ok: false, code: 'FAILED' }) as const);
    if (r.ok) delivered.add(sent.runId);
    else fileRefusal = r.code;
  }
  return { ok: true, versionName: sent.versionName, ...(fileRefusal ? { fileRefusal } : {}) };
}


/** A first voice note's refusal: the page's view is stale (a draft being replaced moved on, or one appeared) or the database refused; the clip is stored and `receipt` retries it. */
export type FirstVoiceResult = NextDraftResult | { ok: false; why: 'refused' | 'stale_view'; receipt: VoiceUploadReceipt };

/**
 * The first voice note on a pending Clone (3c X9): the same first Send as `openNextDraft`, with the recorded clip as the message. The clip is
 * stored and committed by chat-voice, which makes the draft, the thread, the note and its run in one transaction; the run begins on the server
 * when the transcript lands. The upload id is the message's client id, so a retry with the receipt can only replay, never duplicate.
 * Throws a VoiceNoteError when the clip could not be stored or committed (it carries the receipt when the same clip can be committed again).
 */
export async function openNextDraftByVoice(args: {
  conversationId: string; projectTag: string; version: string | null; wav: Blob; replace?: ReplaceDraft | null; resume?: VoiceUploadReceipt;
}): Promise<FirstVoiceResult> {
  const { conversationId, projectTag, version, wav, replace = null, resume } = args;
  let from: Awaited<ReturnType<typeof versionOf>>;
  try {
    from = await versionOf(projectTag, version);
  } catch {
    return { ok: false, why: 'versions_failed' }; // nothing was sent
  }
  if (!from) return { ok: false, why: 'no_version' };
  const r = await trackCanvasSend((threadKnown) => sendCanvasVoiceNote(
    conversationId, wav,
    { canvasId: from.canvasId, fromVersionId: from.id, expectedDraftId: replace?.draftId ?? null, expectedRevision: replace?.revision ?? null, replace: !!replace },
    resume,
  ).then((answer) => { if (answer.ok) threadKnown(answer.sent.threadRootId); return answer; }));
  if (!r.ok) return { ok: false, why: r.refused === 'stale_view' ? 'stale_view' : 'refused', receipt: r.receipt }; // a stale view is told apart with or without a draft to replace: either way the page must re-read
  return { ok: true, versionName: r.sent.versionName };
}
