/**
 * @file canvas-new-card-editor.tsx
 * @description P1621: the owner's editor for a NEW card in a box of their open draft: a text field, Save and Cancel. Save writes the owner's own words (no model, no run) through
 * one call that carries a client id, so a repeat after a lost answer makes one card. The text lives in canvas-new-card-store (one buffer per draft and box), so clicking away,
 * selecting another box or a run starting never loses it; Cancel is the only way to discard it, and Escape closes the editor keeping the text.
 * A refusal keeps the text and says why; a full box says so and offers no Save (absent, not disabled); empty text is stopped with a sentence.
 */
import { useEffect, useId, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CANVAS_POINT_MAX } from '@/lib/canvas-boxes';
import { addCanvasDraftPoint } from '@/app/data/canvas-draft-service';
import { DUPLICATE_POINT_TEXT, FULL_BOX_TEXT } from './canvas-new-card-copy';
import {
  BUSY_POINT_TEXT, EMPTY_POINT_TEXT, FAILED_POINT_TEXT, Notice, STALE_POINT_TEXT, type PointEditConfig,
} from './canvas-point-edit';
import { newCardView } from './canvas-new-card-model';
import { clientIdFor, closeNewCard, ensureNewCard, newCardKey, patchNewCard, useNewCards } from './canvas-new-card-store';

/** The refusal's sentence: the editor's own for a full box and the same words, P1614's for the rest. */
function refusalText(refused: string): string {
  if (refused === 'box_full') return FULL_BOX_TEXT;
  if (refused === 'duplicate') return DUPLICATE_POINT_TEXT;
  if (refused === 'busy' || refused === 'busy_elsewhere') return BUSY_POINT_TEXT;
  return STALE_POINT_TEXT;
}

export function CanvasNewCardEditor({ tag, edit, count, autoFocus, onSaved, onCancel, onEscape }: {
  tag: string;
  edit: PointEditConfig;
  /** how many cards the box holds now */
  count: number;
  /** the person chose this box (or Add card): the field takes focus. The first-visit opening never moves focus. */
  autoFocus: boolean;
  /** the card was saved (the draft's revision the save made): the box expands to show it and moves focus on */
  onSaved: (revision: number) => void;
  /** Cancel: the text was discarded */
  onCancel: () => void;
  /** Escape: the editor closes, the text stays */
  onEscape: () => void;
}) {
  const key = newCardKey(edit.draftId, tag);
  const entry = useNewCards().get(key);
  const noteId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ensureNewCard(edit.draftId, tag); }, [edit.draftId, tag]);
  // A box_full sentence is true only until the draft moves past the revision it was said at with room in the box: then it goes and Save comes back (text kept).
  const view = entry ? newCardView(entry, count, edit.runActive, edit.revision) : null;
  const staleFull = !!view?.staleFull;
  useEffect(() => { if (staleFull) patchNewCard(key, { problem: null, fullAtRevision: null }); }, [staleFull, key]);
  const hasProblem = !!entry?.problem && !staleFull;
  // After a refusal or an empty-text sentence the focus goes back into the text (a click on Save leaves it on the button).
  useEffect(() => { if (hasProblem && !entry?.saving) areaRef.current?.focus(); }, [hasProblem, entry?.problem, entry?.saving]);
  if (!entry || !view) return null;
  const { full, running, notice, isError } = view;

  const save = async () => {
    if (entry.saving || edit.runActive || full) return;
    const next = entry.text.trim();
    if (next === '') { patchNewCard(key, { problem: EMPTY_POINT_TEXT }); return; }
    patchNewCard(key, { saving: true, problem: null });
    const clientId = clientIdFor(key, next);
    try {
      const r = await addCanvasDraftPoint(edit.draftId, tag, next, edit.revision, clientId);
      if (r.ok) { closeNewCard(key); onSaved(r.revision); }
      else patchNewCard(key, { saving: false, problem: refusalText(r.refused), fullAtRevision: r.refused === 'box_full' ? (r.revision ?? edit.revision) : null });
    } catch {
      patchNewCard(key, { saving: false, problem: FAILED_POINT_TEXT });
      toast.error(FAILED_POINT_TEXT);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-box-control data-testid={`canvas-new-card-editor-${tag}`}>
      <Textarea
        ref={areaRef}
        value={entry.text}
        onChange={e => patchNewCard(key, { text: e.target.value, ...(entry.problem && entry.problem !== FULL_BOX_TEXT ? { problem: null } : {}) })}
        maxLength={CANVAS_POINT_MAX}
        rows={3}
        autoFocus={autoFocus}
        // read-only while Save is in flight: nothing typed then can be lost
        readOnly={entry.saving}
        aria-label="New card"
        aria-describedby={notice ? noteId : undefined}
        // Escape closes the editor and keeps the text, but not while a save is in flight: a save that commits after the editor closed would look like it did nothing.
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!entry.saving) onEscape(); } }}
        className="min-h-20 resize-y text-base"
        data-testid="canvas-new-card-text"
      />
      {notice && (isError
        ? <p id={noteId} role="alert" className="break-words text-sm text-red-800 dark:text-red-300" data-testid="canvas-new-card-problem">{notice}</p>
        : <Notice id={noteId} testId="canvas-new-card-problem" text={notice} />)}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-10"
          disabled={entry.saving}
          onClick={() => { closeNewCard(key); onCancel(); }}
          data-testid="canvas-new-card-cancel"
        >
          Cancel
        </Button>
        {/* Save is the only filled button in a box. Absent (not disabled) when the box is full or the agent is working. */}
        {!full && !running && (
          <Button type="button" className="min-h-10" disabled={entry.saving} onClick={() => void save()} aria-busy={entry.saving || undefined} data-testid="canvas-new-card-save">
            {entry.saving ? 'Saving' : 'Save'}
          </Button>
        )}
      </div>
    </div>
  );
}
