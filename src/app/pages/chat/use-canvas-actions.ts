/**
 * P1536: what the owner can do to a canvas draft from its thread, wired to the server. Each action is one request, then a
 * re-read of the draft from the database (so the progress is the database's, not ours). Returns the props of the tray and
 * the draft card (`bar`), and `onDiscard` for the header's "…" menu (null when a discard is not on offer). `bar` is null
 * unless the project's canvas flag is exactly true and the draft was read: anything else shows nothing.
 */
import { useState, type ReactNode } from 'react';
import {
  discardCanvasDraft,
  publishCanvasDraft,
  sendCanvasWorkspaceMessage,
  retryCanvasRun,
  startQueuedCanvasRun,
  CanvasDraftRefusal,
  isDraftingRunKind,
  type CanvasRefusalCode,
} from '@/app/data/canvas-draft-service';
import type { ChatMessage } from '@/app/data/chat-service';
import type { BarProps, Busy } from './canvas-thread';
import { buildItems, canDiscardDraft, hasNewSinceRun, type UploadItem } from './canvas-items';
import { DRAFT_ERROR_TEXT } from './canvas-thread-copy';
import { changeRequestMessages, ownerMessagesAfterRoot, type CanvasThread } from './use-canvas-thread';
import { useStartCanvas } from './use-start-canvas';

/** What went wrong with a run, a publish or a discard, in a sentence. */
function refusalText(e: unknown, kind: Busy): string {
  if (e instanceof CanvasDraftRefusal) {
    if (e.code === 'RUN_ACTIVE') return kind === 'discard' ? 'A draft is being written. Try again when it is done.' : 'A draft is being written. Publish when it is done.';
    if (e.code === 'NOTHING_TO_PUBLISH') return 'There is nothing to publish yet. Draft your canvas first.';
    if (e.code === 'CLOSED') return DRAFT_ERROR_TEXT.DRAFT_CLOSED ?? 'This draft is closed.';
  }
  return 'That did not go through. Try again.';
}

/** A typed refusal of Publish or Discard, in the sentences this tray already had. stale_view reads as the generic one. */
function refusedText(code: CanvasRefusalCode, kind: Busy): string {
  if (code === 'busy' || code === 'busy_elsewhere') return refusalText(new CanvasDraftRefusal('RUN_ACTIVE'), kind);
  if (code === 'draft_empty' || code === 'no_changes') return refusalText(new CanvasDraftRefusal('NOTHING_TO_PUBLISH'), kind);
  return refusalText(null, kind); // [FOUNDER DECISION: stale_view wording; S3 owns it]
}

/** What a refused Send says, in the sentences the tray already had. [FOUNDER DECISION: busy_elsewhere and stale_view wording; S3 owns it] */
function sendRefusedText(code: CanvasRefusalCode): string {
  if (code === 'busy' || code === 'busy_elsewhere') return DRAFT_ERROR_TEXT.BUSY ?? 'That did not go through. Try again.';
  if (code === 'cap_reached') return DRAFT_ERROR_TEXT.REVISION_CAP ?? 'That did not go through. Try again.';
  return DRAFT_ERROR_TEXT.FAILED ?? 'That did not go through. Try again.';
}

/** A refused Try again. `not_retryable` is an upload whose file was never kept: the owner sends the file again. [FOUNDER DECISION: wording; the spec's bubble reads "Send the file again."] */
function retryRefusedText(code: CanvasRefusalCode): string {
  if (code === 'not_retryable') return 'Send it again.';
  return sendRefusedText(code);
}

export function useCanvasActions({
  thread,
  available,
  messages,
  ownerId,
  rootId,
  uploads,
}: {
  thread: CanvasThread | null;
  available: boolean | null;
  messages: ChatMessage[];
  ownerId: string;
  rootId: string;
  /** Files being added from this tab (the upload button's, shown in the tray). */
  uploads: UploadItem[];
}): { bar: BarProps | null; onDiscard: (() => void) | null; dialog: ReactNode; onSend: ((body: string) => Promise<boolean>) | null } {
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { start, dialog } = useStartCanvas();
  if (!thread || available !== true) return { bar: null, onDiscard: null, dialog, onSend: null };
  const { draft, run, material, running, waiting, reload, draftHasPoints, viewPath, nextSeq, lastDraftAt } = thread;

  const act = async (kind: Busy, work: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(kind);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (e) {
      setNotice(refusalText(e, kind));
    }
    await reload();
    setBusy(null);
  };

  const bar: BarProps = {
    draft,
    run,
    running,
    waiting,
    items: buildItems({ material, messages, ownerId, rootId, lastDraftAt, uploads }),
    newInput: hasNewSinceRun({ messages, ownerId, rootId, lastDraftAt, material, uploads, newestRunDone: isDraftingRunKind(run?.kind) && run?.state === 'done' }),
    askedAfterPublish: ownerMessagesAfterRoot(messages, ownerId, rootId, draft.closedAt).length > 0,
    busy,
    notice,
    draftHasPoints,
    viewDraftPath: viewPath,
    nextSeq,
    onRun: () =>
      void act('run', async () => {
        // A failed newest run is tried again with canvas_draft_retry (it makes the replacement run); otherwise a run that was made but never started is started.
        if (run?.state === 'failed') {
          const t = await retryCanvasRun({ draftId: draft.id, failedRunId: run.id, expectedRevision: draft.revision, clientId: crypto.randomUUID() });
          if (!t.ok) return retryRefusedText(t.refused);
          return t.start && !t.start.ok && t.start.code !== 'BUSY' ? (DRAFT_ERROR_TEXT[t.start.code] ?? 'That did not go through. Try again.') : null;
        }
        const r = await startQueuedCanvasRun(draft.id);
        // NOT_AVAILABLE here is only "no run is waiting" (a message's run starts when it is sent): nothing to start, and the draft is fine.
        return r.ok || r.code === 'BUSY' || r.code === 'NOT_AVAILABLE' ? null : (DRAFT_ERROR_TEXT[r.code] ?? 'That did not go through. Try again.');
      }),
    onPublish: () =>
      void act('publish', async () => {
        const r = await publishCanvasDraft(draft.id, draft.revision);
        return r.ok ? null : refusedText(r.refused, 'publish');
      }),
    onStartNew: () => void start(draft.versionId, changeRequestMessages(messages, ownerId, rootId, draft.closedAt)),
  };
  // A text message in an open draft's thread is sent with canvas_workspace_send (message + queued run in one call), then its run
  // is started by id. `false` hands the text back to the composer. Voice and a published thread keep the chat's own send.
  const onSend = async (body: string): Promise<boolean> => {
    try {
      const r = await sendCanvasWorkspaceMessage({ canvasId: draft.canvasId, expectedDraftId: draft.id, expectedRevision: draft.revision, body, clientId: crypto.randomUUID() });
      setNotice(!r.ok ? sendRefusedText(r.refused) : r.start && !r.start.ok ? (DRAFT_ERROR_TEXT[r.start.code] ?? null) : null);
      await reload(); // a refusal means the screen is behind: the next Send carries the revision read here
      return r.ok;
    } catch {
      setNotice(DRAFT_ERROR_TEXT.FAILED ?? null);
      return false;
    }
  };
  const onDiscard = () => void act('discard', async () => {
    const r = await discardCanvasDraft(draft.id, draft.revision);
    if (!r.ok) return refusedText(r.refused, 'discard');
    return r.discarded ? null : (DRAFT_ERROR_TEXT.DRAFT_CLOSED ?? null);
  });
  return { bar, onDiscard: canDiscardDraft(bar) ? onDiscard : null, dialog, onSend: draft.state === 'open' ? onSend : null };
}
