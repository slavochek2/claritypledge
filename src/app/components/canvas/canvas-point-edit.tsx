/**
 * @file canvas-point-edit.tsx
 * @description P1614: the owner edits a point's text by hand on their open draft. P1621: the entry control is the card's Edit action (canvas-card-actions: the card shows it
 * while its box is selected; the opened point shows it in the panel); this file draws the editor that opens in place with Save and Cancel; Save is one call, no model and no run.
 * The typed text lives in canvas-point-edit-store, so a run starting, a re-read that replaces the point, or the panel opening never loses it. A refusal keeps the
 * text and says why. Empty text is stopped here with a sentence, not a dead button.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CANVAS_POINT_MAX } from '@/lib/canvas-boxes';
import { editCanvasDraftPoint } from '@/app/data/canvas-draft-service';
import type { PointWithUserPosition } from '@/app/types';
import { boxTitleTestId } from './canvas-box-ids';
import { requestFocus } from './canvas-focus-request';
import {
  cardEditTestId, claimPanelBox, closePointEdit, getPointEdits, patchPointEdit, pointEditKey, shownPoints, usePanelBoxes, usePointEdits, type PointEditEntry,
} from './canvas-point-edit-store';

/**
 * The draft the page shows, the revision it last read (a save passes it back; stale_view when the draft moved on), and whether the agent is working on it.
 * `userId` (P1621): the signed-in owner, whose first visit opens the first box (absent: nothing opens by itself).
 */
export interface PointEditConfig { draftId: string; revision: number; runActive: boolean; userId?: string }
// [FOUNDER COPY: approved] every sentence below is shown to the owner; the founder agreed this wording in the P1614 review ("Your mirror agent").
export const EMPTY_POINT_TEXT = 'A point needs some words.';
export const BUSY_POINT_TEXT = 'Your mirror agent is updating this canvas. Save again when it finishes.';
export const RUN_GOING_TEXT = 'Your mirror agent is updating this canvas. Save is back when it finishes.';
export const STALE_POINT_TEXT = 'This draft changed while you were editing. Save again to apply your text.';
export const FAILED_POINT_TEXT = 'Could not save this point. Try again.';
export const GONE_POINT_TEXT = 'This point changed while you were typing. Your text is kept here to copy.';
/** Validation and failure read as errors; the rest are states of the canvas and read as a notice. */
const isError = (problem: string) => problem === EMPTY_POINT_TEXT || problem === FAILED_POINT_TEXT;

/**
 * The cards of one box, each with its Edit control, plus any open editor whose point is gone. `limit` is how many cards the box shows (the grid's one; the panel
 * shows all). `surface="panel"` claims the box's editors while the panel is open, so the grid behind it draws none.
 */
export function BoxEdits({ tag, points, edit, renderCard, limit, surface }: {
  tag: string;
  points: PointWithUserPosition[];
  edit?: PointEditConfig;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  limit?: number;
  surface?: 'panel';
}) {
  const entries = usePointEdits();
  const panelHas = usePanelBoxes().has(tag);
  const draftId = edit?.draftId;
  useEffect(() => (surface === 'panel' ? claimPanelBox(tag) : undefined), [surface, tag]);
  // A save that may have landed (stale_view or a thrown call) is treated as saved ONLY when its origin point is gone AND a point that was not in the box when the save
  // started has exactly the typed text. Anything else, a sibling saying the same included, leaves the editor open. A busy refusal never sets watchIds.
  useEffect(() => {
    if (!draftId) return;
    for (const [key, entry] of getPointEdits()) {
      const watch = entry.watchIds;
      if (entry.draftId !== draftId || entry.box !== tag || entry.saving || !watch) continue;
      const originGone = !points.some(p => p.id === entry.originId);
      if (originGone && points.some(p => !watch.includes(p.id) && p.statement.trim() === entry.text.trim())) closePointEdit(key);
    }
  }, [draftId, tag, points, entries]);

  const cards = (limit ? points.slice(0, limit) : points);
  if (!edit) return <>{cards.map(p => renderCard(p))}</>;
  const ids = points.map(p => p.id);
  const here = surface === 'panel' || !panelHas;   // the grid hands its editors to the panel while the panel is open
  const orphans = here ? [...entries.values()].filter(e => e.draftId === edit.draftId && e.box === tag && !ids.includes(e.originId)) : [];
  const shown = shownPoints(points, limit, edit.draftId, entries, here);
  return (
    <>
      {orphans.map(o => <PointEditor key={`orphan-${o.originId}`} entry={o} point={undefined} edit={edit} boxIds={ids} />)}
      {shown.map(p => <EditablePoint key={p.id} point={p} edit={edit} boxIds={ids} card={renderCard(p)} here={here} />)}
    </>
  );
}

/** The card, or its editor while one is open (P1621: the card carries its own Edit action while its box is selected; an editor already open stays whatever is selected). */
function EditablePoint({ point, edit, boxIds, card, here }: { point: PointWithUserPosition; edit: PointEditConfig; boxIds: string[]; card: ReactNode; here: boolean }) {
  const entry = usePointEdits().get(pointEditKey(edit.draftId, point.id));
  if (entry && here) return <PointEditor entry={entry} point={point} edit={edit} boxIds={boxIds} />;
  return <>{card}</>;
}

/**
 * The editor of one point. `onSaved` (the opened point in the panel) is told the id the saved point now has, so the panel can follow it; `returnFocusTo` names the control that
 * takes focus when the editor closes (default: that card's Edit action), since focus must never fall to the page.
 */
export function PointEditor({ entry, point, edit, boxIds, onSaved, returnFocusTo = cardEditTestId }: {
  entry: PointEditEntry; point: PointWithUserPosition | undefined; edit: PointEditConfig; boxIds: string[];
  onSaved?: (newPointId: string) => void; returnFocusTo?: (pointId: string) => string;
}) {
  const noteId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const key = pointEditKey(entry.draftId, entry.originId);
  const gone = !point;
  // After a refusal, a failure or an empty-text sentence the focus goes back into the text, so the outline is the one the open state shows (a click on Save leaves it on the button).
  const hasProblem = !!entry.problem;
  useEffect(() => { if (hasProblem && !entry.saving && !gone) areaRef.current?.focus(); }, [hasProblem, entry.problem, entry.saving, gone]);
  // The editor of a gone point replaces one that had focus, so focus would drop to the page: it goes to the read-only text, unless the owner has already moved focus elsewhere.
  useEffect(() => {
    const at = document.activeElement;
    if (gone && (!at || at === document.body)) areaRef.current?.focus();
  }, [gone]);
  const shown = gone ? null : edit.runActive && !entry.saving ? RUN_GOING_TEXT : entry.problem;
  /** Closes the editor and asks for focus on the control that follows it (that card's Edit, or the saved point's): never the page. */
  const close = (focusPointId?: string) => {
    closePointEdit(key);
    if (!focusPointId) return;
    // The card's Edit exists only while its box is selected (or in the panel): in an unselected box focus goes to the box title instead, never to the page.
    const title = boxTitleTestId(entry.box);
    const selected = document.querySelector(`[data-testid="${title}"]`)?.getAttribute('aria-pressed') === 'true';
    requestFocus(selected ? [returnFocusTo(focusPointId)] : onSaved ? [returnFocusTo(focusPointId), title] : [title]);
  };

  const save = async () => {
    if (!point || entry.saving || edit.runActive) return;
    const next = entry.text.trim();
    if (next === '') { patchPointEdit(key, { problem: EMPTY_POINT_TEXT }); return; }
    if (next === point.statement.trim()) { close(point.id); return; }   // nothing changed: nothing is written
    patchPointEdit(key, { saving: true, problem: null, watchIds: null });
    try {
      const r = await editCanvasDraftPoint(edit.draftId, point.id, next, edit.revision);
      if (r.ok) { close(r.pointId || point.id); onSaved?.(r.pointId || point.id); }
      else if (r.refused === 'busy' || r.refused === 'busy_elsewhere') patchPointEdit(key, { saving: false, problem: BUSY_POINT_TEXT });
      else patchPointEdit(key, { saving: false, problem: STALE_POINT_TEXT, watchIds: boxIds });
    } catch {
      patchPointEdit(key, { saving: false, problem: FAILED_POINT_TEXT, watchIds: boxIds });
      toast.error(FAILED_POINT_TEXT);
    }
  };

  return (
    // No container outline of its own: the textarea's own border and the app's normal focus ring are the single outline, the same in every state.
    <div className="flex flex-col gap-2" data-box-control data-testid={`canvas-point-editor-${entry.originId}`}>
      {gone && (
        <>
          <Notice id={noteId} testId="canvas-point-editor-notice" text={GONE_POINT_TEXT} />
          <Button type="button" variant="outline" className="min-h-10 self-end" onClick={() => closePointEdit(key)} data-testid="canvas-point-editor-dismiss">Dismiss</Button>
        </>
      )}
      <Textarea
        ref={areaRef}
        value={entry.text}
        onChange={e => patchPointEdit(key, { text: e.target.value, watchIds: null, ...(entry.problem === EMPTY_POINT_TEXT ? { problem: null } : {}) })}
        maxLength={CANVAS_POINT_MAX}
        rows={4}
        autoFocus={!gone}
        // read-only while Save is in flight (nothing typed then can be lost) and when the point is gone (the text can be selected and copied, not saved)
        readOnly={entry.saving || gone}
        aria-label="Point text"
        aria-describedby={gone || shown ? noteId : undefined}
        // Escape closes the editor, but not while a save is in flight: a save that commits after the editor closed would look like it did nothing.
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!entry.saving) close(point?.id); } }}
        className={`min-h-24 text-base ${gone ? 'resize-none bg-muted' : 'resize-y'}`}
        data-testid="canvas-point-editor-text"
      />
      {shown && (isError(shown)
        ? <p id={noteId} role="alert" className="break-words text-sm text-red-800 dark:text-red-300" data-testid="canvas-point-editor-problem">{shown}</p>
        : <Notice id={noteId} testId="canvas-point-editor-problem" text={shown} />)}
      {point && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" className="min-h-10" disabled={entry.saving} onClick={() => close(point.id)} data-testid="canvas-point-editor-cancel">Cancel</Button>
          <Button type="button" className="min-h-10" disabled={entry.saving || edit.runActive} onClick={() => void save()} aria-busy={entry.saving || undefined} data-testid="canvas-point-editor-save">{entry.saving ? 'Saving' : 'Save'}</Button>
        </div>
      )}
    </div>
  );
}

/** A notice in the app's muted treatment (as the box question's): an icon and quiet text on a muted ground, never red or amber. */
export function Notice({ id, testId, text }: { id: string; testId: string; text: string }) {
  return (
    <p id={id} role="status" className="flex items-start gap-2 break-words rounded-md bg-muted px-2.5 py-2 text-sm text-foreground" data-testid={testId}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground/60" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
