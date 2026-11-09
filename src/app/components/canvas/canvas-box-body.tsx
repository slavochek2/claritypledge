/**
 * @file canvas-box-body.tsx
 * @description The inside of a box under its header: the loading skeleton, the empty state (the question the drafting agent left for the owner, or "Empty"), or the cards. P1621: a
 * selected empty box on the owner's draft draws its new-card editor under the question; a filled one draws the editor under its cards.
 */
import type { ReactNode } from 'react';
import type { PointWithUserPosition } from '@/app/types';
import { CanvasBoxPlaceholder } from '@/app/pages/canvas-page-placeholders';
import { FIXED_BOX_QUESTIONS } from '@/lib/canvas-box-questions';
import type { CanvasBoxTag } from '@/lib/canvas-boxes';
import { BoxEdits, type PointEditConfig } from './canvas-point-edit';
import { CanvasGoneNewCards } from './canvas-new-card-gone';
import { BOX_LIMIT } from './use-box-editor';

export function CanvasBoxBody({ tag, points, edit, renderCard, expanded, question, editorVisible, editor, showGone, openDraftId, canvasId }: {
  tag: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  edit?: PointEditConfig;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  expanded: boolean;
  question?: string;
  editorVisible: boolean;
  /** the new-card editor, or null */
  editor: ReactNode;
  /** text typed for a draft that is gone is kept on screen: only for the owner, never for a reader or a signed-out visitor */
  showGone: boolean;
  /** the owner's open draft, whichever version is on screen */
  openDraftId?: string | null;
  /** the canvas on screen: only its buffers are ever shown as gone */
  canvasId?: string;
}) {
  if (points === null) return <CanvasBoxPlaceholder empty={false} />;
  // Round 3: where hand edits are possible (the owner's draft, a pending Clone) an empty box always asks: the agent's question, else the box's fixed one. Readers read "Empty".
  const ask = question ?? (edit ? FIXED_BOX_QUESTIONS[tag as CanvasBoxTag] : undefined);
  if (points.length > 0) {
    return (
      <div className="flex flex-col gap-2" data-testid="canvas-box-list">
        <BoxEdits tag={tag} points={points} edit={edit} renderCard={renderCard} limit={expanded ? undefined : BOX_LIMIT} />
        {editor}
        {showGone && <CanvasGoneNewCards tag={tag} canvasId={canvasId} editing={!!edit} openDraftId={openDraftId} />}
      </div>
    );
  }
  // P1536: the owner's draft says what it could not fill and asks; everyone else reads "Empty". Muted italic: a question to answer must not read like an answer (visual QA).
  // P1614: an open editor whose last point was just removed stays on screen beside this state (its text is the owner's).
  // P1621: a selected empty box opens its editor with the question above it; a box with no question shows just the editor.
  return (
    <div className="flex flex-col gap-2">
      <BoxEdits tag={tag} points={points} edit={edit} renderCard={renderCard} limit={BOX_LIMIT} />
      {ask
        ? <p className="break-words rounded-md border border-dashed border-blue-300 bg-background p-2 text-sm italic text-foreground/70" data-testid="canvas-box-question">{ask}</p>
        : !editorVisible && <CanvasBoxPlaceholder empty />}
      {editor}
      {showGone && <CanvasGoneNewCards tag={tag} canvasId={canvasId} editing={!!edit} openDraftId={openDraftId} />}
    </div>
  );
}
