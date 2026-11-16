/**
 * @file use-workspace-publish.ts
 * @description P1536 W1: Publish from the workspace's bar. After it the page REPLACEs to the new version (the draft's own version row is the one
 * published) with no marker, so the panel closes, and a toast says it (3c X15: the publish reply's first line, with See offer when an offer is open). `closedDraftId` is the draft just published: until the page has read
 * again, the read on screen still shows it open and must not bring the marker back.
 */
import { useCallback, useState } from 'react';
import { useNavigate, useParams, type Location } from 'react-router-dom';
import { toast } from 'sonner';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useCanvasPublish, type PublishedInfo } from '@/app/components/canvas/use-canvas-publish';
import { getMessage } from '@/app/data/chat-service';
import { chatPath } from '@/app/pages/chat/chat-view-model';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import { useEventReturn, usePreparationReturn, useTableReturn } from './use-preparation-return';
import { useEventShareOffer } from './use-event-share-offer';

// [FOUNDER DECISION: wording, built as written in the spec's X15.]
export const SEE_OFFER_LABEL = 'See offer';
/** The toast with an action stays long enough to read its three sentences and reach the action (sonner's default 4 seconds is a reading time for one short line). */
export const SEE_OFFER_TOAST_MS = 12_000;

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
  /** Where Publish returns to; by default the preparation's `afterPublish`, remembered once seen (use-preparation-return, same-origin only). null leaves Publish where it is. */
  returnTo?: string | null;
  /** Only the canvas's owner is preparing it: anyone else gets neither the banner nor the jump. Default true. */
  owner?: boolean;
  /** The page re-reads after a share the dialog made (so a stay-on-page Publish shows the new Share status). */
  onShared?: () => void;
}) {
  const { ready, runActive, pendingClone, setParams, state } = args;
  const { handle, projectTag } = useParams(); // the canvas on screen: the remembered return belongs to it alone
  const remembered = usePreparationReturn(state, `${handle}/${projectTag}`);
  const table = useTableReturn(state, `${handle}/${projectTag}`); // the event room's table this canvas was opened from (its banner), not a Publish target
  const returnTo = args.owner === false ? null : args.returnTo === undefined ? remembered : args.returnTo;
  const navigate = useNavigate();
  const rememberedEvent = useEventReturn(state, `${handle}/${projectTag}`); // the event it was started or opened from, kept for this canvas
  const eventId = args.owner === false ? null : rememberedEvent;
  // After the person answers the share question (or when none is asked), Publish goes where it was going.
  // P1686: a next-version draft opened from the room card returns to the table after Publish. Kept apart from `returnTo`, which also draws the preparation banner.
  const leaveTo = returnTo ?? (args.owner !== false && table?.afterPublish ? table.to : null);
  const leave = useCallback(() => { if (leaveTo) navigate(leaveTo, { replace: true }); }, [navigate, leaveTo]);
  const shareOffer = useEventShareOffer(leave, args.onShared);
  const { ask: askShare } = shareOffer;
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
    void replyFirstLine(replyMessageId, seq).then(text => (seeOffer ? toast.success(text, { action: seeOffer, duration: SEE_OFFER_TOAST_MS }) : toast.success(text)));
    // P1529 UAT round 1: a canvas made in the event's preparation returns there after Publish, where it is shared with the event.
    // F7: a canvas started from an event's room offers to be shared with it first (once answered, the same return).
    if (eventId && projectTag) askShare(eventId, projectTag);
    else leave();
  }, [ready, setParams, state, navigate, eventId, projectTag, askShare, leave]);
  const { state: spot, publishing, publish } = useCanvasPublish(ready, runActive, published, pendingClone);
  return { closedDraftId, spot, publishing, publish, returnTo, table, shareOffer };
}
