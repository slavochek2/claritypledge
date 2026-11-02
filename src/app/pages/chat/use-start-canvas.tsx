/**
 * P1536: every way of starting a canvas. `useStartCanvas` starts one (and asks the owner what to do when the canvas already has an
 * open draft) and opens the WORKSPACE on the draft: the canvas page on the draft's version with `ws=1`, never the chat thread (W0:
 * the workspace is the one place an owner edits a canvas). The mirror chat's + (CanvasPlusMenu) calls it for "New canvas".
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CanvasDraftRefusal, discardCanvasDraft, getCanvasDraftRevision } from '@/app/data/canvas-draft-service';
import { OpenDraftDialog } from './OpenDraftDialog';
import { canvasStartErrorText, startCanvasThread, type StartedCanvasThread } from './canvas-start';
import { workspaceHref } from './canvas-links';
import { useChat } from './chat-state';

interface Pending {
  found: StartedCanvasThread;
  fromVersionId: string;
}

export function useStartCanvas(): { start: (fromVersionId?: string | null) => Promise<void>; dialog: ReactNode } {
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
    async (fromVersionId?: string | null) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await startCanvasThread(fromVersionId);
        if (r.status === 'open_elsewhere' && fromVersionId) setPending({ found: r, fromVersionId });
        else await open(r, r.status === 'opened' && !fromVersionId);
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
