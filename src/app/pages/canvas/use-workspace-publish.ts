/**
 * @file use-workspace-publish.ts
 * @description P1536 W1: Publish from the workspace's bar. After it the page REPLACEs to the new version (the draft's own version row is the one
 * published) with no marker, so the panel closes, and a toast says it (3c X15: the publish reply's first line, with See offer when an offer is open). `closedDraftId` is the draft just published: until the page has read
 * again, the read on screen still shows it open and must not bring the marker back.
 */
import { useCallback, useState } from 'react';
import { useNavigate, type Location } from 'react-router-dom';
import { toast } from 'sonner';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useCanvasPublish, type PublishedInfo } from '@/app/components/canvas/use-canvas-publish';
import { getMessage } from '@/app/data/chat-service';
import { chatPath } from '@/app/pages/chat/chat-view-model';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';

// [FOUNDER DECISION: wording, built as written in the spec's X15.]
export const SEE_OFFER_LABEL = 'See offer';
/** The toast with an action stays long enough to read its three sentences and reach the action (sonner's default 4 seconds is a reading time for one short line). */
export const SEE_OFFER_TOAST_MS = 12_000;
/**
 * Below 1280px the canvas bar is two rows (about 100px) and the shared Toaster starts toasts 3.5rem from the top, so a toast sat on Clone and Share and blocked them for its whole time
 * (measured at 375px: toast top 56px, bottom 179px). 3.5rem more puts it under the bar; from 1280px the bar is one row and the default place is clear of it.
 */
export const SEE_OFFER_TOAST_CLASS = 'max-[1279px]:mt-14';

/**
 * 3c X15: the toast is the publish reply's FIRST LINE (W1, D17 stand): the panel closes at Publish, so this is the only place the retention sentence is seen without
 * opening anything. A reply that cannot be read, or an answer that carried none, still says the one thing certain: the number the version got.
 */
async function replyFirstLine(replyMessageId: string | null, seq: number): Promise<string> {
  const fallback = `Published v${seq}.`;
  if (!replyMessageId) return fallback;
  try {
    const line = ((await getMessage(replyMessageId))?.body ?? '').split('\n')[0]?.trim();
    return line || fallback;
  } catch {
    return fallback;
  }
}

export function useWorkspacePublish(args: {
  ready: CanvasReady | null;
  runActive: boolean;
  pendingClone: boolean;
  setParams: (next: (prev: URLSearchParams) => URLSearchParams, options: { replace: boolean; state: Location['state'] }) => void;
  state: Location['state'];
}) {
  const { ready, runActive, pendingClone, setParams, state } = args;
  const navigate = useNavigate();
  const [closedDraftId, setClosedDraftId] = useState<string | null>(null);
  const published = useCallback(({ seq, versionName, replyMessageId, openOffers }: PublishedInfo) => {
    const draft = ready?.draft ?? null;
    setClosedDraftId(draft?.id ?? null);
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', versionName);
      next.delete(CANVAS_WORKSPACE_PARAM);
      next.delete('thread');
      return next;
    }, { replace: true, state });
    // With an open offer the toast carries "See offer": the thread opens in the chat's own panel on that root (X11); the offer rows inside it are the mixed-material step's.
    const seeOffer = openOffers > 0 && draft ? { label: SEE_OFFER_LABEL, onClick: () => navigate(chatPath(draft.conversationId, { rootId: draft.threadRootId })) } : undefined;
    void replyFirstLine(replyMessageId, seq).then(text => (seeOffer ? toast.success(text, { action: seeOffer, duration: SEE_OFFER_TOAST_MS, className: SEE_OFFER_TOAST_CLASS }) : toast.success(text)));
  }, [ready, setParams, state, navigate]);
  const { state: spot, publishing, publish } = useCanvasPublish(ready, runActive, published, pendingClone);
  return { closedDraftId, spot, publishing, publish };
}
