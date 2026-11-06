/**
 * @file canvas-new-card-gone.tsx
 * @description P1621: new-card text typed for a draft that is gone (published, discarded or replaced while the owner typed) stays ON SCREEN to copy: read-only, with P1614's kept-text
 * sentence and a Dismiss, as P1614's editor of a gone point does. It cannot be saved (there is no draft to save to). Shown whatever is selected, in the box it was typed in.
 */
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { boxTitleTestId } from './canvas-box-ids';
import { requestFocus } from './canvas-focus-request';
import { closeNewCard, newCardKey, useGoneNewCards } from './canvas-new-card-store';
import { GONE_POINT_TEXT, Notice } from './canvas-point-edit';

export function CanvasGoneNewCards({ tag, canvasId, editing, openDraftId }: { tag: string; canvasId: string | undefined; editing: boolean; openDraftId?: string | null }) {
  const gone = useGoneNewCards(tag, canvasId, editing, openDraftId);
  return <>{gone.map(e => <GoneNewCard key={newCardKey(e.canvasId, e.box)} canvasId={e.canvasId} tag={tag} text={e.text} />)}</>;
}

function GoneNewCard({ canvasId, tag, text }: { canvasId: string; tag: string; text: string }) {
  const noteId = useId();
  return (
    <div className="flex flex-col gap-2" data-box-control data-testid={`canvas-new-card-gone-${tag}`}>
      <Notice id={noteId} testId="canvas-new-card-gone-notice" text={GONE_POINT_TEXT} />
      <Button
        type="button"
        variant="outline"
        className="min-h-10 self-end"
        onClick={() => { closeNewCard(newCardKey(canvasId, tag)); requestFocus(boxTitleTestId(tag)); }}
        data-testid="canvas-new-card-gone-dismiss"
      >
        Dismiss
      </Button>
      <Textarea value={text} readOnly rows={3} aria-label="Unsaved new card" aria-describedby={noteId} className="min-h-20 resize-none bg-muted text-base" data-testid="canvas-new-card-gone-text" />
    </div>
  );
}
