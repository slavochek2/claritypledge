/**
 * P1536: every way of starting a canvas. `useStartCanvas` starts one (and asks the owner what to do when the canvas already has an
 * open draft) and opens the WORKSPACE on the draft: the canvas page on the draft's version with `ws=1`, never the chat thread (W0:
 * the workspace is the one place an owner edits a canvas). `useCanvasEntry` is what the mirror conversation hangs on its "New
 * canvas" menu item and its paperclip's Canvases tab, so the conversation pane itself only passes the results along.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CanvasDraftRefusal, discardCanvasDraft, getCanvasDraftRevision, sendCanvasWorkspaceMessage } from '@/app/data/canvas-draft-service';
import { OpenDraftDialog } from './OpenDraftDialog';
import { joinCarried } from './canvas-carry';
import { canvasStartErrorText, startCanvasThread, type StartedCanvasThread } from './canvas-start';
import { workspaceHref } from './canvas-links';
import { useChat } from './chat-state';
import { useCanvasDraftAvailability } from './use-canvas-availability';

interface Pending {
  found: StartedCanvasThread;
  fromVersionId: string;
  carry: string[];
}

/** A uuid that is the same for the same (new thread, message position): a send repeated into that thread returns the first copy, never a second. */
async function carryClientId(threadRootId: string, index: number): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`p1536-carry:${threadRootId}:${index}`)));
  const bytes = Array.from(h.slice(0, 16), (b, i) => (i === 6 ? (b & 0x0f) | 0x50 : i === 8 ? (b & 0x3f) | 0x80 : b));
  const x = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * The owner's change requests go into the new thread as its first owner message, sent with canvas_workspace_send so the engine
 * reads it (a plain chat message has no run and is never input). One message is one run, so the requests are joined, oldest first,
 * into that one message, and its run starts at once (no Create step). A thread that was really made new only; a failure is said.
 */
async function carryIntoThread(r: StartedCanvasThread, texts: string[]): Promise<void> {
  if (r.status !== 'opened' || !texts.length) return;
  const { body, leftOut } = joinCarried(texts);
  try {
    if (body) {
      const sent = await sendCanvasWorkspaceMessage({
        canvasId: r.canvasId, expectedDraftId: r.draftId, expectedRevision: r.revision, body,
        clientId: await carryClientId(r.threadRootId, 0),
      });
      if (!sent.ok) throw new Error(sent.refused);
    }
    if (leftOut || !body) throw new Error('left out');
  } catch {
    // [FOUNDER DECISION: wording when only the newest requests fit one message]
    toast.error('Could not carry your message over. Send it again in the new thread.');
  }
}

/** `carry`: the messages of the thread the owner is leaving that the new thread should start with, oldest first. */
export function useStartCanvas(): { start: (fromVersionId?: string | null, carry?: string[]) => Promise<void>; dialog: ReactNode } {
  const chat = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const slug = chat.authors[chat.userId]?.slug ?? null;
  const here = `${location.pathname}${location.search}`;
  /** The draft is made on the server: make sure the mirror is in the list (the workspace's chat needs it), then open the workspace on it. */
  const open = useCallback(
    async (found: StartedCanvasThread, newCanvas = false) => {
      await chat.refresh().catch(() => null);
      if (!slug || !found.canvasName) {
        toast.error(canvasStartErrorText(null));
        return;
      }
      // `from`: ← in the workspace goes back to where the owner started. `tab`: a NEW canvas opens on the Thread tab below 1280px (W1).
      navigate(workspaceHref(slug, found.canvasName, found.versionName ?? null), { state: { from: here, ...(newCanvas ? { tab: 'thread' } : {}) } });
    },
    [chat, slug, here, navigate],
  );

  const start = useCallback(
    async (fromVersionId?: string | null, carry: string[] = []) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await startCanvasThread(fromVersionId);
        if (r.status === 'open_elsewhere' && fromVersionId) setPending({ found: r, fromVersionId, carry });
        else {
          await carryIntoThread(r, carry);
          await open(r, r.status === 'opened' && !fromVersionId);
        }
      } catch (e) {
        toast.error(canvasStartErrorText(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, open],
  );

  const dialog = pending ? (
    <OpenDraftDialog
      fromSeq={pending.found.fromSeq}
      onClose={() => setPending(null)}
      onContinue={() => {
        const found = pending.found;
        setPending(null);
        void open(found);
      }}
      onDiscard={async () => {
        try {
          const gone = await discardCanvasDraft(pending.found.draftId, pending.found.revision);
          if (!gone.ok && gone.refused === 'stale_view') {
            // the draft moved on since the dialog opened: take its revision now, so the next attempt carries it
            const fresh = await getCanvasDraftRevision(pending.found.draftId);
            setPending({ ...pending, found: { ...pending.found, revision: fresh } });
          }
          if (!gone.ok) return canvasStartErrorText(gone.refused === 'busy' || gone.refused === 'busy_elsewhere' ? new CanvasDraftRefusal('RUN_ACTIVE') : null);
          const r = await startCanvasThread(pending.fromVersionId);
          await carryIntoThread(r, pending.carry);
          setPending(null);
          await open(r);
          return null;
        } catch (e) {
          return canvasStartErrorText(e);
        }
      }}
    />
  ) : null;

  return { start, dialog };
}

/** For the mirror conversation: the two entries into a canvas thread, present only while canvas drafting is on. */
export function useCanvasEntry(isMirror: boolean, onPicked: () => void): {
  onNewCanvas: (() => void) | undefined;
  onPickCanvas: ((versionId: string) => void) | undefined;
  dialog: ReactNode;
} {
  const on = useCanvasDraftAvailability(isMirror) === true;
  const { start, dialog } = useStartCanvas();
  return {
    onNewCanvas: on ? () => void start(null) : undefined,
    onPickCanvas: on
      ? (versionId) => {
          onPicked();
          void start(versionId);
        }
      : undefined,
    dialog,
  };
}
