/**
 * @file canvas-box-model.ts
 * @description P1621: what one box is, decided from its inputs and drawn by canvas-box. Pure functions, so the rules sit in one place and the component only draws.
 */
import { CANVAS_BOX_CARD_LIMIT } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import type { BoxToggle } from './canvas-box-footer';
import { hasNewCardText, type NewCardEntry } from './canvas-new-card-store';
import type { PointEditConfig } from './canvas-point-edit';

export interface BoxFlags {
  count: number;
  /** loaded and holding no card */
  empty: boolean;
  /** the owner's open draft: the box can take cards by hand */
  ownerDraft: boolean;
  /** the agent is working on the draft: no new edit or card starts */
  runActive: boolean;
  /** the box holds all it can */
  full: boolean;
  /** a card can be added now */
  canAdd: boolean;
  /** typed new-card text is waiting in the box's buffer */
  hasText: boolean;
}

export function boxFlags(points: PointWithUserPosition[] | null, edit: PointEditConfig | undefined, entry: NewCardEntry | undefined): BoxFlags {
  const count = points?.length ?? 0;
  const ownerDraft = !!edit;
  const runActive = !!edit?.runActive;
  const full = count >= CANVAS_BOX_CARD_LIMIT;
  return { count, empty: points !== null && count === 0, ownerDraft, runActive, full, canAdd: ownerDraft && !runActive && !full, hasText: hasNewCardText(entry) };
}

/**
 * Whether the new-card editor is drawn. Typed text always brings it back (and it stays through a run or a full box, with the reason shown); an empty box opens it straight
 * away; a filled box opens it from Add card. Not while a saved card is on its way into an empty box (`savePending`).
 */
export function editorShown(f: BoxFlags, s: { selected: boolean; loaded: boolean; saving: boolean; adding: boolean; savePending: boolean }): boolean {
  if (!f.ownerDraft || !s.selected || !s.loaded) return false;
  return f.hasText || s.saving || (s.adding && f.canAdd) || (f.empty && f.canAdd && !s.savePending);
}

/** The box's See all N / Show less. The owner's draft expands in place; everyone else opens the side panel. Null: nothing more to show. */
export function boxToggle(f: BoxFlags, o: { expanded: boolean; hidden: number; onMore: () => void; expand: () => void; collapse: () => void }): BoxToggle | null {
  const label = o.expanded ? 'Show less' : `See all ${f.count}`;
  if (!f.ownerDraft) return o.hidden > 0 ? { label, expanded: false, inPlace: false, onClick: o.onMore } : null;
  const more = o.expanded ? f.count > 1 : o.hidden > 0;
  return more ? { label, expanded: o.expanded, inPlace: true, onClick: o.expanded ? o.collapse : o.expand } : null;
}

/**
 * Whether the box draws its own Mention in chat. Where the cards carry their own (the draft, a pending Clone: `edit`), the box keeps its button only while it is EMPTY; a box still
 * loading counts as non-empty, so the button does not flicker in and out as the read lands.
 */
export const boxHasOwnMention = (selected: boolean, edit: unknown, points: PointWithUserPosition[] | null): boolean =>
  selected && !(edit && (points === null || points.length > 0));

/** The box's border: blue and ringed when selected, light blue on hover where it can be selected. */
export function boxOutline(selected: boolean, selectable: boolean): string {
  if (selected) return 'border-blue-500 ring-1 ring-blue-500';
  return selectable ? 'cursor-pointer border-border hover:border-blue-300' : 'border-border';
}
