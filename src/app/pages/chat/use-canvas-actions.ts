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
  runCanvasDraft,
  CanvasDraftRefusal,
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

export function useCanvasActions({
  thread,
  available,
  messages,
  ownerId,
  rootId,
  uploads,
  composing,
}: {
  thread: CanvasThread | null;
  available: boolean | null;
  messages: ChatMessage[];
  ownerId: string;
  rootId: string;
  /** Files being added from this tab (the upload button's, shown in the tray). */
  uploads: UploadItem[];
  /** The composer has text (Send is the one primary now). */
  composing: boolean;
}): { bar: BarProps | null; onDiscard: (() => void) | null; dialog: ReactNode } {
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { start, dialog } = useStartCanvas();
  if (!thread || available !== true) return { bar: null, onDiscard: null, dialog };
  const { draft, run, material, running, reload, draftHasPoints, viewPath, nextSeq, lastDraftAt } = thread;

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
    items: buildItems({ material, messages, ownerId, rootId, lastDraftAt, uploads }),
    newInput: hasNewSinceRun({ messages, ownerId, rootId, lastDraftAt, material, uploads }),
    composing,
    askedAfterPublish: ownerMessagesAfterRoot(messages, ownerId, rootId, draft.closedAt).length > 0,
    busy,
    notice,
    draftHasPoints,
    viewDraftPath: viewPath,
    nextSeq,
    onRun: () =>
      void act('run', async () => {
        const r = await runCanvasDraft(draft.id);
        return r.ok || r.code === 'BUSY' ? null : (DRAFT_ERROR_TEXT[r.code] ?? 'That did not go through. Try again.');
      }),
    onPublish: () =>
      void act('publish', async () => {
        await publishCanvasDraft(draft.id);
        return null;
      }),
    onStartNew: () => void start(draft.versionId, changeRequestMessages(messages, ownerId, rootId, draft.closedAt)),
  };
  const onDiscard = () => void act('discard', async () => ((await discardCanvasDraft(draft.id)) ? null : (DRAFT_ERROR_TEXT.DRAFT_CLOSED ?? null)));
  return { bar, onDiscard: canDiscardDraft(bar) ? onDiscard : null, dialog };
}
