/**
 * @file canvas-card-actions.tsx
 * @description The ONE action row under a selected card on the owner's open draft (and on a pending Clone): Mention, Edit and Delete at the left, Open (the secondary, blue-outlined button) at the right.
 * It exists only while the card's box is selected. Edit and Delete are absent while the agent is working; Mention exists only where the workspace carries it (the owner's).
 * Delete is the draft's own Remove, only on the owner's open draft (not a pending Clone, not while a run goes). A hand Remove closes Undo on the server, so it asks first (design-system rule 5: red text, then the shared confirm dialog).
 * Below ~360px of card width the three left actions are icon-only (aria-label and tooltip carry the words); Open keeps its label. Every target is at least 40px.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { pointKey } from '@/app/pages/chat/composer-tags';
import { stripHashtags } from '@/lib/utils';
import type { PointWithUserPosition } from '@/app/types';
import { MentionInChatButton } from './canvas-mention-in-chat';
import { CANVAS_QUIET_ACTION, SECONDARY_PILL_COLOURS } from './canvas-pill-styles';
import { cardEditTestId } from './canvas-point-edit-store';

/** the words of an action hide when the card (a size container) is narrower than 360px */
const LABEL = '[@container_(max-width:359px)]:hidden';
const DELETE_TEXT = 'min-h-10 gap-1.5 px-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-blue-500';

const DELETE_FAILED_TEXT = 'Could not delete this card. Try again.';

export function CanvasCardActions({ point, tag, canEdit, onEdit, onRemove, onOpen }: {
  point: PointWithUserPosition;
  /** the box the card sits in: what a mention of the point names */
  tag: string;
  canEdit: boolean;
  onEdit: () => void;
  /** absent: no Delete (a pending Clone has no draft to remove from) */
  onRemove?: () => Promise<boolean>;
  onOpen: () => void;
}) {
  const words = stripHashtags(point.statement, point.tags);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const canDelete = canEdit && !!onRemove;
  // Focus goes back to Delete when the question closes (the dialog is controlled, so it has no trigger of its own to return to).
  const deleteRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    if (wasAsking.current && !asking) deleteRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  // an agent run that starts while the question is open closes it
  useEffect(() => { if (!canDelete && !busy) setAsking(false); }, [canDelete, busy]);
  const confirm = async () => {
    if (busy || !onRemove) return;
    setBusy(true);
    setFailed(false);
    try {
      // true: off the draft, and this row unmounts with the card. False or a throw: the card stays, the dialog closes and the row says so.
      if (!(await onRemove())) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };
  return (
    <div className="border-t px-1 [container-type:inline-size]" data-box-control data-testid={`canvas-card-actions-${point.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-1 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-1">
          <MentionInChatButton card tag={pointKey(tag, words)} title={words} testId={`canvas-card-mention-${point.id}`} labelClass={LABEL} />
          {canEdit && (
            <Button type="button" variant="ghost" onClick={onEdit} aria-label={`Edit: ${words}`} title="Edit" data-testid={cardEditTestId(point.id)} className={CANVAS_QUIET_ACTION}>
              <Pencil className="h-4 w-4" aria-hidden /><span className={LABEL}>Edit</span>
            </Button>
          )}
          {canDelete && (
            <Button ref={deleteRef} type="button" variant="ghost" onClick={() => { setFailed(false); setAsking(true); }} aria-label={`Delete: ${words}`} title="Delete" data-testid={`canvas-card-delete-${point.id}`} className={DELETE_TEXT}>
              <Trash2 className="h-4 w-4" aria-hidden /><span className={LABEL}>Delete</span>
            </Button>
          )}
        </div>
        <Button type="button" variant="outline" onClick={onOpen} aria-label={`Open: ${words}`} data-testid={`canvas-card-open-${point.id}`} className={`min-h-10 gap-1 px-3 ${SECONDARY_PILL_COLOURS}`}>
          Open<ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      {failed && <p role="alert" className="px-1 pb-1 text-sm text-red-800" data-testid={`canvas-card-delete-error-${point.id}`}>{DELETE_FAILED_TEXT}</p>}
      <ConfirmDialog
        open={asking && canDelete}
        onOpenChange={open => { if (!busy) setAsking(open); }}
        title="Delete this card?"
        description={`"${words}" comes off this draft. Undo can't bring it back.`}
        confirmLabel="Delete this card"
        cancelLabel="Keep"
        loadingLabel="Deleting…"
        isLoading={busy}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
