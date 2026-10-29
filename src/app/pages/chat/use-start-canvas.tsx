/**
 * P1536: the chat's way into a canvas thread. `useStartCanvas` starts one (and asks the owner what to do when the
 * canvas already has an open draft); `useCanvasEntry` is what the mirror conversation hangs on its "New canvas" menu
 * item and its paperclip's Canvases tab, so the conversation pane itself only passes the results along.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { discardCanvasDraft } from '@/app/data/canvas-draft-service';
import { sendMessage } from '@/app/data/chat-service';
import { OpenDraftDialog } from './OpenDraftDialog';
import { canvasStartErrorText, startCanvasThread, type StartedCanvasThread } from './canvas-start';
import { useChat } from './chat-state';
import { useChatNavigate } from './chat-hooks';
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
 * The owner's change requests go into the new thread as its first owner messages, one each and in order (plain
 * messages of theirs, so the next draft reads them as their own words). Only a thread that was really made new takes
 * them; the first failure stops the rest (so nothing lands out of order) and is said, not hidden.
 */
async function carryIntoThread(r: StartedCanvasThread, texts: string[]): Promise<void> {
  if (r.status !== 'opened') return;
  try {
    for (const [i, body] of texts.entries()) {
      await sendMessage({ conversationId: r.conversationId, threadRootId: r.threadRootId, body, clientId: await carryClientId(r.threadRootId, i) });
    }
  } catch {
    toast.error('Could not carry your message over. Send it again in the new thread.');
  }
}

/** `carry`: the messages of the thread the owner is leaving that the new thread should start with, oldest first. */
export function useStartCanvas(): { start: (fromVersionId?: string | null, carry?: string[]) => Promise<void>; dialog: ReactNode } {
  const chat = useChat();
  const go = useChatNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  /** The thread is made on the server: make sure the mirror is in the list, then open it. */
  const open = useCallback(
    async (path: string) => {
      await chat.refresh().catch(() => null);
      go(path);
    },
    [chat, go],
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
          await open(r.path);
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
        const path = pending.found.path;
        setPending(null);
        void open(path);
      }}
      onDiscard={async () => {
        try {
          await discardCanvasDraft(pending.found.draftId);
          const r = await startCanvasThread(pending.fromVersionId);
          await carryIntoThread(r, pending.carry);
          setPending(null);
          await open(r.path);
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
