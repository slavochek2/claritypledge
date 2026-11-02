/**
 * @file use-canvas-publish.ts
 * @description P1536: what tapping Publish does, and what the spot shows meanwhile. One request: `publishCanvasDraft(draft, revision)`.
 * A typed refusal is never an error text: draft_empty and no_changes put the matching status in the spot (until the draft moves on),
 * and stale_view / busy re-read the canvas (the page listens to the draft's events). Only an unexpected failure says so, once, as a toast.
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { publishCanvasDraft } from '@/app/data/canvas-draft-service';
import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
import type { CanvasReady } from './canvas-page-data';
import { publishSpotState, stateAfterRefusal, type PublishSpotState } from './canvas-publish-spot-state';

// [FOUNDER DECISION: wording of an unexpected Publish failure; this is the sentence the old Publish button already used.]
const FAILED_TEXT = 'Could not publish this draft. Try again.';

/**
 * `onPublished`: told once the server confirmed, with the number the version got, the name that keys its `?v=` (the draft's own version row is the one that was
 * published), the publish reply the server posted (its id, for the toast's first line) and how many offers are still open on it.
 */
export type PublishedInfo = { seq: number; versionName: string; replyMessageId: string | null; openOffers: number };
export function useCanvasPublish(
  ready: CanvasReady | null,
  runActive: boolean,
  onPublished?: (published: PublishedInfo) => void,
  /** W3: a Clone is pending: the spot reads "Nothing to publish yet". */
  pendingClone = false,
): { state: PublishSpotState; publishing: boolean; publish: () => void } {
  const [publishing, setPublishing] = useState(false);
  // A refusal's status holds only for the DRAFT and revision it answered: another draft, or any change to this one, clears it.
  const [forced, setForced] = useState<{ draftId: string; revision: number; state: PublishSpotState } | null>(null);
  const inFlight = useRef(false);
  const draft = ready?.draft ?? null;
  const computed = publishSpotState(ready, runActive, pendingClone);
  const state = forced && draft && forced.draftId === draft.id && forced.revision === draft.revision && computed.kind === 'publish' ? forced.state : computed;

  const publish = () => {
    if (inFlight.current || !draft) return;
    inFlight.current = true;
    setPublishing(true);
    void (async () => {
      try {
        const r = await publishCanvasDraft(draft.id, draft.revision);
        if (r.ok) {
          onPublished?.({ seq: r.seq, versionName: draft.version, replyMessageId: r.replyMessageId, openOffers: r.openOffers });
          return;
        }
        const next = stateAfterRefusal(r.refused);
        if (next === 'unknown') toast.error(FAILED_TEXT);
        else if (next === 'reread') emitCanvasDraftEvent({ kind: 'updated', draftId: draft.id });
        else setForced({ draftId: draft.id, revision: draft.revision, state: next });
      } catch {
        toast.error(FAILED_TEXT);
      } finally {
        inFlight.current = false;
        setPublishing(false);
      }
    })();
  };
  return { state, publishing, publish };
}
