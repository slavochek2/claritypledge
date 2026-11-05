/**
 * @file canvas-panel-point-edit.tsx
 * @description P1621: on the opened point in the side panel, the owner of an open draft gets Edit (gone while the agent works). It uses P1614's editor and store: while the editor is open it takes
 * the card's place in the panel, and the grid behind draws none for that box. A save gives the point a new id; `onSaved` tells the page so the panel follows it and stays open.
 * Readers, published versions and a draft with no edit config get the card as it was.
 */
import { useEffect, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canvasBoxOf } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import { CANVAS_QUIET_ACTION } from './canvas-pill-styles';
import { PointEditor, type PointEditConfig } from './canvas-point-edit';
import { claimPanelBox, openPointEdit, panelEditTestId, pointEditKey, usePointEdits } from './canvas-point-edit-store';

export function PanelPointEdit({ point, boxes, edit, onSaved, children }: {
  point: PointWithUserPosition;
  /** the canvas's boxes: the point's own box is found here (a save that may have landed is recognised against its points) */
  boxes: ReadonlyMap<string, PointWithUserPosition[]> | null;
  /** the owner's open draft only; absent: just the card */
  edit: PointEditConfig | undefined;
  onSaved: (from: string, to: string) => void;
  /** the point's card */
  children: ReactNode;
}) {
  const tag = canvasBoxOf(point.systemTags ?? []) ?? '';
  const boxPoints = boxes?.get(tag) ?? [];
  const entry = usePointEdits().get(pointEditKey(edit?.draftId ?? '', point.id));
  const editing = !!entry;
  // While the editor is open here, the grid behind the panel draws none for this box: one editor per point.
  useEffect(() => (editing ? claimPanelBox(tag) : undefined), [editing, tag]);
  if (!edit) return <>{children}</>;
  if (entry) {
    return (
      <PointEditor
        entry={entry}
        point={point}
        edit={edit}
        boxIds={boxPoints.map(p => p.id)}
        onSaved={to => onSaved(point.id, to)}
        returnFocusTo={panelEditTestId}
      />
    );
  }
  return (
    <>
      {children}
      {/* Gone while a run goes, as on the card. */}
      {!edit.runActive && (
        <div className="mt-1 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => openPointEdit({ draftId: edit.draftId, box: tag, originId: point.id, text: point.statement })}
            data-testid={panelEditTestId(point.id)}
            className={CANVAS_QUIET_ACTION}
          >
            <Pencil className="h-4 w-4" aria-hidden />Edit
          </Button>
        </div>
      )}
    </>
  );
}
