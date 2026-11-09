/**
 * @file use-canvas-undo.ts
 * @description P1536 D7 / J6 / D15 (client): what a canvas draft's thread knows about Undo, and the one action. The SERVER names the run Undo would undo and its reply
 * (`readCanvasUndoTarget`); the client only asks, and draws Undo there.
 *
 * Reads (docs/technical/metered-services.md): no timer. One `get_canvas_draft_state` per CHANGE of the draft once its newest run has settled (the key below: draft, revision, newest
 * run and its state; every mutation moves the revision), and never while the tab is hidden: coming back reads once. A run that is going reads nothing, except one cold read when this
 * tab arrived mid-run and does not yet know where the status goes ("read" is kept PER DRAFT: a panel that switches drafts reads the new one). A thread re-read with the draft unchanged reads
 * nothing. A failed read is SAID ("Undo did not load." with Try again) and retried once when the tab comes back; it never retries on a timer (no loop).
 *
 * A successful Undo moves Undo to the next reply at once (`nextTargetAfterUndo`: the undo call named the next run, the last read named the replies), so it does not blink out while the
 * read for the new revision is in flight; that read confirms it. The tap passes the run and the revision the screen holds. A refusal changes nothing here and says why: busy and busy_elsewhere in the existing sentence, stale_view (another tab
 * acted) in its own, and the screen re-reads, so a loser's tap never undoes a second run.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';
import { nextTargetAfterUndo, readCanvasUndoTarget, undoCanvasRun, type CanvasUndoTarget } from '@/app/data/canvas-draft-undo';
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
  /** A hand save, Edit or Remove closed Undo (the server says so): no button, and the spot says why. */
  handClosed: boolean;
  /** The read that says where Undo goes failed (and nothing known stands in for it): Try again shows. */
  failed: boolean;
  retry: () => void;
}

const TERMINAL = new Set(['done', 'undone', 'failed', 'capped', 'cancelled']);
const isSettled = (thread: CanvasThread): boolean => !thread.running && !!thread.run && TERMINAL.has(thread.run.state);

/** What was read, and about which draft: the screen switching drafts never borrows another draft's answer. */
interface Read { draftId: string; key: string; target: CanvasUndoTarget | null }
/** The key of a target the screen worked out itself after an undo: good until the real read for the new revision lands. */
const PROVISIONAL = 'provisional';

/** The one key a read is for: the draft as the last settled read of it saw it. `null`: nothing to read now. */
function readKey(thread: CanvasThread | null, haveRead: boolean): string | null {
  if (!thread || !thread.run) return null;
  const { draft, run } = thread;
  if (draft.state !== 'open') return `${draft.id}:closed`; // J6: a published or discarded draft's thread reads its undone marks ONCE, when opened (the draft cannot change any more)
  if (!isSettled(thread)) return haveRead ? null : `${draft.id}:going`; // a going run: one cold read, to know where the status goes
  return `${draft.id}:${draft.revision}:${run.id}:${run.state}`;
}

interface UndoTarget { target: CanvasUndoTarget | null; settledRead: boolean; failed: boolean; askAgain: () => void; provide: (t: CanvasUndoTarget) => void }

/** The server's answer for this draft, read once per change of it (see the file header). `askAgain` forces one more read (after a refusal, or Try again). */
function useUndoTarget(thread: CanvasThread | null): UndoTarget {
  const visible = usePageVisible();
  const [read, setRead] = useState<Read | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [again, setAgain] = useState(0);
  const asked = useRef<string | null>(null);
  const canvasId = thread?.draft.canvasId ?? null;
  const draftId = thread?.draft.id ?? null;
  const closed = !!thread && thread.draft.state !== 'open';
  const key = readKey(thread, !!draftId && read?.draftId === draftId);
  const keyNow = useRef(key);
  keyNow.current = key;
  const closedNow = useRef(closed);
  closedNow.current = closed;

  useEffect(() => {
    if (!key || !visible || !canvasId || !draftId) return;
    const mark = `${key}:${again}`;
    if (asked.current === mark) return;
    asked.current = mark;
    void readCanvasUndoTarget(canvasId, draftId).then(
      target => { if (keyNow.current === key) { setRead({ draftId, key, target }); setFailedKey(null); } },
      () => {
        // Said, not swallowed: Try again shows. No timer; coming back to the tab (visible turns true again) asks once more.
        if (asked.current === mark) asked.current = null;
        if (keyNow.current === key && !closedNow.current) setFailedKey(key); // a closed thread has no Undo to retry: its marks stay absent until the tab returns
      },
    );
  }, [key, visible, canvasId, draftId, again]);

  // What was read about another draft is not about this one.
  const mine = read && read.draftId === draftId ? read : null;
  const settledRead = !!mine && (mine.key === key || mine.key === PROVISIONAL);
  return {
    target: mine?.target ?? null,
    settledRead,
    failed: failedKey !== null && failedKey === key && !settledRead,
    askAgain: useCallback(() => { setFailedKey(null); asked.current = null; setAgain(n => n + 1); }, []),
    provide: useCallback((t: CanvasUndoTarget) => setRead({ draftId: t.draftId, key: PROVISIONAL, target: t }), []),
  };
}

/** What a refused Undo says: busy and busy_elsewhere in the existing sentence, stale_view (another tab acted) in its own. */
const refusedText = (code: string): string => (code === 'stale_view' ? UNDO_STALE_TEXT : (DRAFT_ERROR_TEXT.BUSY ?? DRAFT_ERROR_TEXT.FAILED ?? ''));

/** The server says a hand save, Edit or Remove closed Undo, and nothing is left to undo, for a read that is about the draft as it is now. */
const handClosedOf = (target: CanvasUndoTarget | null, settledRead: boolean, thread: CanvasThread | null): boolean =>
  !!target?.handClosed && !target.runId && settledRead && thread?.draft.state === 'open';

/**
 * A hand save, Edit or Remove closes Undo on the server and asks the page to re-read ('updated'); the thread does not hear its own kind of event, so this makes it re-read once, and the revision
 * that brings is what makes the one Undo read (its key): the button goes promptly, not only after a stale tap. No timer; a closed draft or another draft's event does nothing, and a hidden tab waits for its return.
 */
function useReloadOnHandWrite(thread: CanvasThread | null): void {
  const reloadNow = useRef(thread?.reload);
  reloadNow.current = thread?.reload;
  const openDraftId = thread && thread.draft.state === 'open' ? thread.draft.id : null;
  useEffect(() => {
    if (!openDraftId) return;
    // A hidden tab reads nothing (metered-services rule 3): writes made meanwhile are remembered, and the tab's return re-reads once for all of them.
    let waiting = false;
    const hidden = () => document.visibilityState === 'hidden';
    const run = () => { waiting = false; void reloadNow.current?.().catch(() => undefined); };
    const off = subscribeCanvasDraftEvents(e => {
      if (e.kind !== 'updated' || e.draftId !== openDraftId) return;
      if (hidden()) waiting = true;
      else run();
    });
    const onShown = () => { if (waiting && !hidden()) run(); };
    document.addEventListener('visibilitychange', onShown);
    return () => { off(); document.removeEventListener('visibilitychange', onShown); };
  }, [openDraftId]);
}

export function useCanvasUndo(thread: CanvasThread | null): CanvasUndoView {
  const { target, settledRead, failed, askAgain, provide } = useUndoTarget(thread);
  const [busy, setBusy] = useState(false);
  useReloadOnHandWrite(thread);
  const waiting = !!thread && thread.draft.state === 'open' && !!thread.run && !isSettled(thread) && !!target?.runId;

  const undo = useCallback(() => {
    if (busy || !target?.runId) return;
    setBusy(true);
    void (async () => {
      let r: Awaited<ReturnType<typeof undoCanvasRun>>;
      try {
        r = await undoCanvasRun({ draftId: target.draftId, expectedRunId: target.runId as string, expectedRevision: target.revision });
      } catch {
        toast.error(DRAFT_ERROR_TEXT.FAILED);
        return;
      } finally {
        setBusy(false); // the call is over: the next Undo (already placed, below) may be tapped while the re-reads run
      }
      if (r.ok) provide(nextTargetAfterUndo(target, r)); // Undo moves on at once; the read for the new revision (the revision moved) confirms it
      else {
        // A refusal changes nothing; the screen is behind, so it re-reads (even if the revision did not move, e.g. busy).
        toast.error(refusedText(r.refused));
        askAgain();
      }
      // The reply's rewrite to "Undone." arrives like any edit of a message (the chat's live UPDATE); re-reading the whole thread here would blank its list while it loads.
      await thread?.reload().catch(() => undefined);
    })();
  }, [busy, target, thread, askAgain, provide]);

  return {
    replyId: target?.replyMessageId && (waiting || settledRead) ? target.replyMessageId : null,
    waiting,
    busy,
    undo,
    undoneIds: target?.undoneMessageIds ?? [],
    handClosed: handClosedOf(target, settledRead, thread),
    failed,
    retry: askAgain,
  };
}
