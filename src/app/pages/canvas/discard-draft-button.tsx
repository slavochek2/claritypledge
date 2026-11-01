/**
 * @file discard-draft-button.tsx
 * @description P1536 W6: Discard in the thread panel's header, beside the draft's state. A secondary pill with destructive text, behind
 * the project's confirm dialog. It calls the CHECKED discard (`discardCanvasDraft(draft, revision)`; the database keeps the canvas and
 * version rows). stale_view re-reads the draft's revision and says so (the next press carries it); busy says the draft is being written.
 * After a discard the page leaves the draft: a draft from vN returns to vN (published view, no ws=1); a canvas never published
 * lands on Artifacts > Canvases. Not drawn in the pending Clone state: nothing is written there, and × cancels.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { CANVAS_DESTRUCTIVE_PILL } from '@/app/components/canvas/canvas-pill-styles';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CanvasDraftRefusal, discardCanvasDraft, getCanvasDraftRevision } from '@/app/data/canvas-draft-service';
import { canvasStartErrorText } from '@/app/pages/chat/canvas-start';
import { discardLanding } from './discard-draft-landing';

const DISCARD_LABEL = 'Discard';
// [FOUNDER DECISION: wording] Texts follow the Artifacts row's confirm (discard-draft-dialog.tsx) and its toasts.
const STALE_TEXT = 'This draft just changed. Discard it again if you still want to.';
const FAILED_TEXT = "Couldn't discard the draft.";

export function DiscardDraftButton({ ready, ownerSlug, canvasName }: { ready: CanvasReady; ownerSlug: string; canvasName: string }) {
  const draft = ready.draft;
  const navigate = useNavigate();
  const location = useLocation();
  const [asking, setAsking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // The revision a stale_view taught us, for THIS draft: the next attempt carries it.
  const [fresh, setFresh] = useState<{ draftId: string; revision: number } | null>(null);
  if (!draft) return null;
  const neverPublished = !ready.versions.some(v => !v.draft && v.seq !== null);

  const discard = async () => {
    if (discarding) return;
    setDiscarding(true);
    try {
      const revision = fresh?.draftId === draft.id ? Math.max(fresh.revision, draft.revision) : draft.revision;
      const r = await discardCanvasDraft(draft.id, revision);
      if (!r.ok) {
        if (r.refused === 'stale_view') {
          setFresh({ draftId: draft.id, revision: await getCanvasDraftRevision(draft.id) });
          toast.error(STALE_TEXT);
        } else {
          toast.error(r.refused === 'busy' || r.refused === 'busy_elsewhere' ? canvasStartErrorText(new CanvasDraftRefusal('RUN_ACTIVE')) : FAILED_TEXT);
        }
        return;
      }
      setAsking(false);
      const { href, published } = discardLanding({ ownerSlug, canvasName, ready });
      // `state` keeps ← pointing where the owner came from; Artifacts has no use for it.
      navigate(href, { replace: true, ...(published ? { state: location.state } : {}) });
    } catch (e) {
      toast.error(e instanceof CanvasDraftRefusal && e.code === 'RUN_ACTIVE' ? canvasStartErrorText(e) : FAILED_TEXT);
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <>
      <button type="button" className={CANVAS_DESTRUCTIVE_PILL} aria-label="Discard draft" onClick={() => setAsking(true)} data-testid="canvas-discard">
        {DISCARD_LABEL}
      </button>
      <ConfirmDialog
        open={asking}
        onOpenChange={o => { if (!o && !discarding) setAsking(false); }}
        title="Discard draft"
        description={neverPublished
          ? 'Discard this draft? Nothing of this canvas was published.'
          : 'Discard this draft? Its changes are removed. Published versions stay as they are.'}
        confirmLabel={discarding ? 'Discarding...' : 'Discard'}
        isLoading={discarding}
        onConfirm={() => void discard()}
      />
    </>
  );
}
