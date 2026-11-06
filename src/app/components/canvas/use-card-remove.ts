/**
 * @file use-card-remove.ts
 * @description P1621 round 2: Remove on a card. No confirmation. One call takes the point off the draft (a pending page makes the draft first, canvas-hand-draft); the page re-reads the way it does
 * after a new-card save (the call asks for it). A refusal says a sentence from P1614's own: stale_view, busy. not_found means the point is already off this draft: the re-read shows that,
 * and it counts as done. Focus never falls to the page: once the card is gone from the box, it goes to the next card's first action, else Add card, else the box title.
 */
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { removeCanvasDraftPoint } from '@/app/data/canvas-draft-service';
import type { PointWithUserPosition } from '@/app/types';
import { boxAddTestId, boxTitleTestId } from './canvas-box-ids';
import { requestFocus } from './canvas-focus-request';
import { mapPointId, REMOVE_AMBIGUOUS_TEXT, resolveTarget } from './canvas-hand-draft';
import { BUSY_POINT_TEXT, FAILED_POINT_TEXT, STALE_POINT_TEXT, type PointEditConfig } from './canvas-point-edit';
import { cardEditTestId, closePointEdit, getPointEdits, pointEditKey } from './canvas-point-edit-store';

/** `told`: a sentence was already shown (the draft could not be made): nothing more to say. */
type Outcome = 'done' | 'busy' | 'stale' | 'ambiguous' | 'failed' | 'told';

/** Closes a point's buffer only if it is still the buffer (by identity) that was there when the removal began. */
function closeIfSame(canvasId: string, pointId: string, uid: string | undefined): void {
  const key = pointEditKey(canvasId, pointId);
  if (uid && getPointEdits().get(key)?.uid === uid) closePointEdit(key);
}

async function removeOne(edit: PointEditConfig, tag: string, point: PointWithUserPosition): Promise<Outcome> {
  // who was there when the removal began (by identity), for the point and for its copy on the draft
  const seen = new Map<string, string>();
  for (const e of getPointEdits().values()) if (e.canvasId === edit.canvasId) seen.set(e.originId, e.uid);
  let created: { moveTo: () => void } | null = null;
  try {
    const target = await resolveTarget(edit);   // a pending page makes its draft here, as the first message does
    if (!target.ok) { toast.error(target.text); return 'told'; }
    created = target.created;
    const m = await mapPointId(target, target.created?.versionName ?? null, tag, point.id, point.statement, edit.userId ?? '');
    if (m.kind === 'ambiguous') { created?.moveTo(); return 'ambiguous'; }
    const r = m.kind === 'id' ? await removeCanvasDraftPoint(target.draftId, m.id, target.revision) : ({ ok: false, refused: 'not_found' } as const);
    created?.moveTo();   // the draft exists now: the page moves to it, whatever the answer
    if (r.ok || r.refused === 'not_found') {
      // The point is off the draft: an edit buffer for it has nothing left to save to. Only the buffers that existed when Remove began: one reopened since is the owner's new text.
      closeIfSame(edit.canvasId, point.id, seen.get(point.id));
      if (m.kind === 'id' && m.id !== point.id) closeIfSame(edit.canvasId, m.id, seen.get(m.id));
      return 'done';
    }
    return r.refused === 'busy' ? 'busy' : 'stale';
  } catch {
    created?.moveTo();   // a draft made before the failure is still there: the page goes to it
    return 'failed';
  }
}

const SENTENCE: Record<Exclude<Outcome, 'done' | 'told'>, string> = { busy: BUSY_POINT_TEXT, stale: STALE_POINT_TEXT, ambiguous: REMOVE_AMBIGUOUS_TEXT, failed: FAILED_POINT_TEXT };

/** `points`: the box's points as drawn (focus goes to the one after the removed card). Returns the handler a card's Remove calls. */
export function useCardRemove(tag: string, points: PointWithUserPosition[] | null, edit: PointEditConfig | undefined): (point: PointWithUserPosition) => void {
  const busy = useRef(new Set<string>());
  const waiting = useRef<{ id: string; targets: string[] } | null>(null);
  // When the removed card has left the box, focus is asked for (the removed button's focus has just fallen to the page, which is what lets the request act).
  useEffect(() => {
    const w = waiting.current;
    if (!w || !points || points.some(p => p.id === w.id)) return;
    waiting.current = null;
    requestFocus(w.targets);
  }, [points]);
  const editRef = useRef(edit);
  editRef.current = edit;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  return useCallback((point: PointWithUserPosition) => {
    const cfg = editRef.current;
    if (!cfg || cfg.runActive || busy.current.has(point.id)) return;   // a double click removes once
    busy.current.add(point.id);
    const list = pointsRef.current ?? [];
    const next = list[list.findIndex(p => p.id === point.id) + 1];
    waiting.current = { id: point.id, targets: [...(next ? [cardEditTestId(next.id), `canvas-card-open-${next.id}`] : []), boxAddTestId(tag), boxTitleTestId(tag)] };
    void removeOne(cfg, tag, point).then(o => {
      busy.current.delete(point.id);
      if (o === 'done') return;
      waiting.current = null;
      if (o !== 'told') toast.error(SENTENCE[o]);
    });
  }, [tag]);
}
