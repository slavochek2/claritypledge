/**
 * @file use-card-remove.ts
 * @description P1621 round 2, moved to the point panel in round 3: Remove of a point. No confirmation. One call takes the point off the draft (a pending page makes the draft first, canvas-hand-draft); the page re-reads the way it does
 * after a new-card save (the call asks for it). A refusal says a sentence from P1614's own: stale_view, busy. not_found means the point is already off this draft: the re-read shows that,
 * and it counts as done. Focus never falls to the page: once the card is gone from the box, it goes to the next card's first action, else Add card, else the box title.
 */
import { useEffect } from 'react';
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

// Module state, not a hook's: the removal starts in the point panel, which closes (and unmounts) when it is done, while the box that holds the card outlives it.
const busy = new Set<string>();
/** `until`: the request is for THIS removal and lapses with it (a re-read that never comes must not leave it to hijack a later loss of focus). */
let removalFocus: { tag: string; id: string; targets: string[]; until: number } | null = null;
const REMOVAL_FOCUS_MS = 15_000;

/**
 * The panel is closing over a card that was just removed and the refreshed list is already on screen: its own "return focus" would land on the box title (the removed card's Open button is gone)
 * and the pending request would then refuse to move connected focus. So the panel asks here first: the request for THIS point is taken (cleared) and its first target that is on screen gets focus,
 * and the panel leaves focus alone. False: no such request (or nothing on screen to take it), and the panel restores focus as it always did.
 */
export function takeRemovalFocus(pointId: string): boolean {
  const w = removalFocus;
  if (!w || w.id !== pointId || Date.now() > w.until) return false;
  if (document.querySelector(`[data-testid="canvas-card-open-${pointId}"]`)) return false;   // the card is still drawn: its Open button is the normal return
  for (const id of w.targets) {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) continue;
    el.focus();
    if (document.activeElement === el) { removalFocus = null; return true; }
  }
  return false;
}

/**
 * Once the removed card has left its box, focus is asked for (the removed card's focus has just fallen to the page, which is what lets the request act). Called by every box.
 */
export function useRemovalFocus(tag: string, points: PointWithUserPosition[] | null): void {
  useEffect(() => {
    const w = removalFocus;
    if (!w || w.tag !== tag) return;
    if (Date.now() > w.until) { removalFocus = null; return; }
    if (!points || points.some(p => p.id === w.id)) return;
    removalFocus = null;   // consumed
    requestFocus(w.targets);
  }, [tag, points]);
}

/**
 * Removes `point` from the draft (round 3: asked from the point panel). `points` is the box as drawn, so focus knows the card after it. True once it is off the draft; false after a refusal or
 * failure, which is said (the existing sentences) and leaves everything as it was. A second tap while one is out does nothing.
 */
export async function removePoint(edit: PointEditConfig, tag: string, point: PointWithUserPosition, points: readonly PointWithUserPosition[]): Promise<boolean> {
  const id = `${edit.canvasId}:${point.id}`;
  if (edit.runActive || busy.has(id)) return false;
  busy.add(id);
  const next = points[points.findIndex(p => p.id === point.id) + 1];
  // Only where there is a box to return to: Remove asked for a card whose box is not selected (its actions are not on screen) leaves focus to the page's own closing rule.
  const selected = document.querySelector(`[data-testid="${boxTitleTestId(tag)}"]`)?.getAttribute('aria-pressed') === 'true';
  removalFocus = selected ? { tag, id: point.id, targets: [...(next ? [cardEditTestId(next.id), `canvas-card-open-${next.id}`] : []), boxAddTestId(tag), boxTitleTestId(tag)], until: Date.now() + REMOVAL_FOCUS_MS } : null;
  const o = await removeOne(edit, tag, point);
  busy.delete(id);
  if (o === 'done') return true;
  removalFocus = null;
  if (o !== 'told') toast.error(SENTENCE[o]);
  return false;
}
