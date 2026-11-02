/**
 * @file use-canvas-undo.ts
 * @description P1536 D7 / J6 / D15 (client): what a canvas draft's thread knows about Undo, and the one action. The SERVER names the run Undo would undo and its reply
 * (`readCanvasUndoTarget`); the client only asks, and draws Undo there.
 *
 * Reads (docs/technical/metered-services.md): no timer. One `get_canvas_draft_state` per CHANGE of the draft once its newest run has settled (the key below: draft, revision, newest
 * run and its state; every mutation moves the revision), and never while the tab is hidden: coming back reads once. A run that is going reads nothing, except one cold read when this
 * tab arrived mid-run and does not yet know where the status goes. A thread re-read with the draft unchanged reads nothing. A failed read leaves Undo absent until the draft changes
 * again; it never retries on its own (no loop).
 *
 * The tap passes the run and the revision the screen holds. A refusal changes nothing here and says why: busy and busy_elsewhere in the existing sentence, stale_view (another tab
 * acted) in its own, and the screen re-reads, so a loser's tap never undoes a second run.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { readCanvasUndoTarget, undoCanvasRun, type CanvasUndoTarget } from '@/app/data/canvas-draft-undo';
import { DRAFT_ERROR_TEXT, UNDO_STALE_TEXT } from './canvas-thread-copy';
import { usePageVisible } from './chat-hooks';
import type { CanvasThread } from './use-canvas-thread';

export interface CanvasUndoView {
  /** The reply message Undo (or its waiting status) is drawn under; null: nowhere. */
  replyId: string | null;
  /** An update is going: the spot is a status. */
  waiting: boolean;
  busy: boolean;
  undo: () => void;
  /** The owner messages whose run was undone (marked "Undone"). */
  undoneIds: string[];
}

const TERMINAL = new Set(['done', 'undone', 'failed', 'capped', 'cancelled']);
const isSettled = (thread: CanvasThread): boolean => !thread.running && !!thread.run && TERMINAL.has(thread.run.state);

/** The one key a read is for: the draft as the last settled read of it saw it. `null`: nothing to read now. */
function readKey(thread: CanvasThread | null, haveRead: boolean): string | null {
  if (!thread || thread.draft.state !== 'open' || !thread.run) return null;
  const { draft, run } = thread;
  if (!isSettled(thread)) return haveRead ? null : `${draft.id}:going`; // a going run: one cold read, to know where the status goes
  return `${draft.id}:${draft.revision}:${run.id}:${run.state}`;
}

/** The server's answer for this draft, read once per change of it (see the file header). `askAgain` forces one more read (after a refusal). */
function useUndoTarget(thread: CanvasThread | null): { target: CanvasUndoTarget | null; settledRead: boolean; askAgain: () => void } {
  const visible = usePageVisible();
  const [read, setRead] = useState<{ key: string; target: CanvasUndoTarget | null } | null>(null);
  const [again, setAgain] = useState(0);
  const asked = useRef<string | null>(null);
  const key = readKey(thread, !!read);
  const keyNow = useRef(key);
  keyNow.current = key;
  const canvasId = thread?.draft.canvasId ?? null;
  const draftId = thread?.draft.id ?? null;

  useEffect(() => {
    if (!key || !visible || !canvasId || !draftId) return;
    const mark = `${key}:${again}`;
    if (asked.current === mark) return;
    asked.current = mark;
    void readCanvasUndoTarget(canvasId, draftId).then(
      target => { if (keyNow.current === key) setRead({ key, target }); },
      () => undefined, // no retry loop: the next change of the draft asks again
    );
  }, [key, visible, canvasId, draftId, again]);

  // What was read about another draft is not about this one.
  const mine = read?.target && read.target.draftId === draftId ? read : null;
  return { target: mine?.target ?? null, settledRead: !!mine && mine.key === key, askAgain: useCallback(() => setAgain(n => n + 1), []) };
}

/** What a refused Undo says: busy and busy_elsewhere in the existing sentence, stale_view (another tab acted) in its own. */
const refusedText = (code: string): string => (code === 'stale_view' ? UNDO_STALE_TEXT : (DRAFT_ERROR_TEXT.BUSY ?? DRAFT_ERROR_TEXT.FAILED ?? ''));

export function useCanvasUndo(thread: CanvasThread | null): CanvasUndoView {
  const { target, settledRead, askAgain } = useUndoTarget(thread);
  const [busy, setBusy] = useState(false);
  const waiting = !!thread && thread.draft.state === 'open' && !!thread.run && !isSettled(thread) && !!target?.runId;

  const undo = useCallback(() => {
    if (busy || !target?.runId) return;
    setBusy(true);
    void (async () => {
      try {
        const r = await undoCanvasRun({ draftId: target.draftId, expectedRunId: target.runId as string, expectedRevision: target.revision });
        // A refusal changes nothing; the screen is behind, so it re-reads (and asks again even if the revision did not move, e.g. busy). A success moves the revision, which asks by itself.
        if (!r.ok) {
          toast.error(refusedText(r.refused));
          askAgain();
        }
        // The reply's rewrite to "Undone." arrives like any edit of a message (the chat's live UPDATE); re-reading the whole thread here would blank its list while it loads.
        await thread?.reload().catch(() => undefined);
      } catch {
        toast.error(DRAFT_ERROR_TEXT.FAILED);
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, target, thread, askAgain]);

  return {
    replyId: target?.replyMessageId && (waiting || settledRead) ? target.replyMessageId : null,
    waiting,
    busy,
    undo,
    undoneIds: target?.undoneMessageIds ?? [],
  };
}
