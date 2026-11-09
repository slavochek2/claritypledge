/**
 * @file canvas-panel-point-edit.tsx
 * @description P1621: on the opened point in the side panel, the owner of an open draft gets Edit (gone while the agent works). It uses P1614's editor and store: while the editor is open it takes
 * the card's place in the panel, and the grid behind draws none for that box. A save gives the point a new id; `onSaved` tells the page so the panel follows it and stays open.
 * Readers, published versions and a draft with no edit config get the card as it was.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canvasBoxOf } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import { CANVAS_QUIET_ACTION } from './canvas-pill-styles';
import { PointEditor, type PointEditConfig } from './canvas-point-edit';
import { removePoint } from './use-card-remove';
import { stripHashtags } from '@/lib/utils';
import { claimPanelBox, openPointEdit, panelEditTestId, panelRemoveTestId, pointEditKey, usePointEdits } from './canvas-point-edit-store';

export function PanelPointEdit({ point, boxes, edit, onSaved, onRemoved, children }: {
  point: PointWithUserPosition;
  /** the canvas's boxes: the point's own box is found here (a save that may have landed is recognised against its points) */
  boxes: ReadonlyMap<string, PointWithUserPosition[]> | null;
  /** the owner's open draft only; absent: just the card */
  edit: PointEditConfig | undefined;
  onSaved: (from: string, to: string) => void;
  /** the point is off the draft: the page closes the panel (focus then follows the removal, use-card-remove) */
  onRemoved: () => void;
  /** the point's card */
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const tag = canvasBoxOf(point.systemTags ?? []) ?? '';
  const boxPoints = boxes?.get(tag) ?? [];
  const entry = usePointEdits().get(pointEditKey(edit?.canvasId ?? '', point.id));
  const editing = !!entry;
  // While the editor is open here, the grid behind the panel draws none for this box: one editor per point.
  useEffect(() => (editing ? claimPanelBox(tag) : undefined), [editing, tag]);
  // Remove in flight: the button is busy, a second tap does nothing, Edit is absent. The answer closes the panel only if it still shows the point that was removed and is still on screen.
  const [removing, setRemoving] = useState(false);
  const shownId = useRef(point.id);
  shownId.current = point.id;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const remove = () => {
    if (!edit || removing) return;
    const removedId = point.id;
    setRemoving(true);
    void removePoint(edit, tag, point, boxPoints).then(done => {
      if (!mounted.current) return;
      setRemoving(false);
      if (!done || shownId.current !== removedId) return;
      if (!edit.ensure) { onRemoved(); return; }
      // A pending clone: this removal just moved the page to its new draft in the same instant, and the page's own close still holds the published address from its last render.
      // Drop the panel from the live address instead; `point` is the only level a card's panel adds.
      const live = new URLSearchParams(window.location.search);
      live.delete('point');
      // keep the entry's other state (the workspace's way back); React Router keeps it in history.state.usr
      const kept = (window.history.state as { usr?: unknown } | null)?.usr;
      navigate(`${window.location.pathname}?${live.toString()}`, { replace: true, state: kept });
    });
  };
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
      {/* Gone while a run goes, as on the card. Remove (round 3) lives here, with Edit: quiet, no confirmation. */}
      {!edit.runActive && (
        <div className="mt-1 flex flex-wrap justify-end gap-x-1 gap-y-1">
          {!removing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => openPointEdit({ canvasId: edit.canvasId, box: tag, originId: point.id, text: point.statement })}
              data-testid={panelEditTestId(point.id)}
              className={CANVAS_QUIET_ACTION}
            >
              <Pencil className="h-4 w-4" aria-hidden />Edit
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            aria-busy={removing || undefined}
            aria-label={`Remove: ${stripHashtags(point.statement, point.tags)}`}
            data-testid={panelRemoveTestId(point.id)}
            className={CANVAS_QUIET_ACTION}
          >
            <Trash2 className="h-4 w-4" aria-hidden />Remove
          </Button>
        </div>
      )}
    </>
  );
}
