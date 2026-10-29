/**
 * @file use-canvas-draft-menu.ts
 * @description P1536: the two "…" items an own canvas row gets while the canvas has an open draft, and the state of the
 * confirmation behind the second (drawn by DiscardDraftDialog). "Open draft" opens the DRAFT CANVAS (the canvas page on the
 * draft version, carrying its thread, so a wide screen shows the thread beside it; the chat card's Open goes to the same
 * place). "Discard draft" asks first (the same confirm dialog as the other destructive row actions), calls the checked discard
 * and reloads the list. A canvas without an open draft gets neither. A canvas never published gets no "Open draft": its row and
 * its Open already go to the draft (artifacts-view-model ownCanvasRow).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CanvasDraftRefusal, discardCanvasDraft } from '@/app/data/canvas-draft-service';
import { draftCanvasHref, type ArtifactRow } from './artifacts-view-model';

interface DraftMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

export interface DiscardDialogState {
  open: boolean;
  title: string;
  /** the draft is the canvas's only version: there are no published versions to keep */
  neverPublished: boolean;
  discarding: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function useCanvasDraftMenu(
  row: ArtifactRow,
  userSlug: string | null,
  onChanged: () => void,
): { open: DraftMenuItem[]; discard: DraftMenuItem[]; dialog: DiscardDialogState | null } {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const draft = row.ref.draft;
  const canvasName = row.ref.canvasName;
  if (!draft || !canvasName) return { open: [], discard: [], dialog: null };

  const discard = async () => {
    setDiscarding(true);
    try {
      await discardCanvasDraft(draft.id);
      toast.success('Draft discarded');
      setConfirming(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof CanvasDraftRefusal && e.code === 'RUN_ACTIVE'
        ? 'That draft is being written right now. Try again in a minute.'
        : "Couldn't discard the draft.");
    } finally {
      setDiscarding(false);
    }
  };

  return {
    open: userSlug && !draft.only ? [{ id: 'open-draft', label: 'Open draft', run: () => navigate(draftCanvasHref(userSlug, canvasName, draft)) }] : [],
    discard: [{ id: 'discard-draft', label: 'Discard draft', danger: true, run: () => setConfirming(true) }],
    dialog: {
      open: confirming,
      title: row.title,
      neverPublished: draft.only,
      discarding,
      onOpenChange: open => { if (!open) setConfirming(false); },
      onConfirm: () => void discard(),
    },
  };
}
