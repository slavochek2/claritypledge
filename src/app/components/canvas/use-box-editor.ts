/**
 * @file use-box-editor.ts
 * @description P1621: the state and handlers of one box on the owner's canvas: whether its new-card editor is open, whether it is expanded in place, and what happens to focus when an
 * editor ends. The typed text itself is not here (canvas-new-card-store keeps it), so nothing in this hook can lose it. Deselecting collapses the box and closes what is open, but
 * leaves the text in its buffer.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { CANVAS_BOX_CARD_LIMIT, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import type { BoxCardValue } from './canvas-box-card-context';
import { boxAddTestId, boxTitleTestId } from './canvas-box-ids';
import { boxFlags, boxToggle, editorShown, type BoxFlags } from './canvas-box-model';
import type { BoxToggle } from './canvas-box-footer';
import { requestFocus, useKeepFocus } from './canvas-focus-request';
import { SAVED_CARD_HOLD_MS, closeNewCard, getNewCards, hasNewCardText, markSavedCard, newCardKey, useNewCards, useSavedCard } from './canvas-new-card-store';
import type { PointEditConfig } from './canvas-point-edit';
import { getPointEdits, openPointEdit, useHiddenCount } from './canvas-point-edit-store';

/** The canvas stays small: a box shows this many cards, and says how many more it holds (R2). P1535 (founder): one card per box, so the whole canvas fits one screen at the event. */
export const BOX_LIMIT = 1;

/** What a box is told about the selection (the grid owns it, one box at a time). */
export interface BoxSelectionProps {
  /** the viewer can select boxes (the canvas's owner); false: plain boxes */
  selectable: boolean;
  selected: boolean;
  /** an empty box's text field takes focus (the person chose the box; the first-visit opening never moves focus) */
  focusEditor: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onDeselect: () => void;
}

const CONTROL = 'button,a,input,textarea,select,[data-box-control]';

export interface BoxEditor {
  flags: BoxFlags;
  editorVisible: boolean;
  /** the field takes focus when the editor opens */
  autoFocus: boolean;
  expanded: boolean;
  toggle: BoxToggle | null;
  showAdd: boolean;
  showFull: boolean;
  cardValue: BoxCardValue | null;
  titleRef: RefObject<HTMLButtonElement | null>;
  sectionRef: RefObject<HTMLElement | null>;
  onAdd: () => void;
  savedCard: (revision: number) => void;
  cancelEditor: () => void;
  escapeEditor: () => void;
  onSectionClick: (e: MouseEvent<HTMLElement>) => void;
  onSectionKey: (e: KeyboardEvent<HTMLElement>) => void;
}

export function useBoxEditor(tag: CanvasBoxTag, points: PointWithUserPosition[] | null, edit: PointEditConfig | undefined, sel: BoxSelectionProps, onMore: () => void): BoxEditor {
  const { selectable, selected, focusEditor, onToggle, onSelect, onDeselect } = sel;
  const titleRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const key = edit ? newCardKey(edit.draftId, tag) : '';
  const entry = useNewCards().get(key);
  // A saved card is on its way into the box until the page has read the revision the save made (or the hold runs out, so a read that never comes cannot leave an empty box without
  // its editor). Keyed on the save itself, so deselecting and selecting again meanwhile changes nothing.
  const saved = useSavedCard(key);
  const [, tick] = useState(0);
  const savePending = !!saved && (edit?.revision ?? 0) < saved.revision && Date.now() < saved.at + SAVED_CARD_HOLD_MS;
  useEffect(() => {
    if (!saved || !savePending) return;
    const t = setTimeout(() => tick(n => n + 1), saved.at + SAVED_CARD_HOLD_MS - Date.now() + 20);
    return () => clearTimeout(t);
  }, [saved, savePending]);
  const flags = boxFlags(points, edit, entry);
  const editorVisible = editorShown(flags, { selected, loaded: points !== null, saving: !!entry?.saving, adding, savePending });
  const hidden = useHiddenCount(tag, points, edit, expanded ? Number.MAX_SAFE_INTEGER : BOX_LIMIT);

  // Deselecting collapses the box and forgets the transient parts. The typed text stays in its buffer.
  useEffect(() => { if (!selected) { setAdding(false); setExpanded(false); } }, [selected]);
  // Focus never falls to the page: if what held it in this box is removed (Edit or Add card when a run starts, a Cancel that closed its editor), the title takes it.
  useKeepFocus(sectionRef, () => titleRef.current?.focus());

  const cardValue = useMemo<BoxCardValue | null>(() => (edit
    ? { selected, runActive: flags.runActive, onEdit: p => openPointEdit({ draftId: edit.draftId, box: tag, originId: p.id, text: p.statement }) }
    : null), [edit, selected, flags.runActive, tag]);

  /** Escape, or the end of an editor: the box deselects and focus returns to its title (never the page). */
  const leaveBox = () => { onDeselect(); titleRef.current?.focus(); };
  const escapeEditor = () => {
    if (key && !hasNewCardText(getNewCards().get(key))) closeNewCard(key);
    setAdding(false);
    leaveBox();
  };
  const cancelEditor = () => {
    setAdding(false);
    if (flags.empty) leaveBox();
    else requestFocus(flags.canAdd ? boxAddTestId(tag) : boxTitleTestId(tag));   // Add card is absent while a run goes or the box is full
  };
  const savedCard = (revision: number) => {
    setAdding(false);
    setExpanded(true);
    if (key) markSavedCard(key, revision);
    requestFocus(flags.count + 1 >= CANVAS_BOX_CARD_LIMIT ? boxTitleTestId(tag) : boxAddTestId(tag));
  };
  const onSectionClick = (e: MouseEvent<HTMLElement>) => {
    if (!selectable || (e.target as Element).closest(CONTROL)) return;
    // Selecting text inside the box is not a click on the box.
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) return;
    onToggle();
    // A click on bare box area focuses nothing by itself: without this, Escape and Tab would not start from this box.
    titleRef.current?.focus({ preventScroll: true });
  };
  const onSectionKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || !selected || e.defaultPrevented) return;
    e.preventDefault();
    // A save in flight (a new card, or P1614's edit) is not interrupted: Escape does nothing until it answers.
    if (entry?.saving || [...getPointEdits().values()].some(p => p.box === tag && p.saving)) return;
    leaveBox();
  };
  const toggle = boxToggle(flags, { expanded, hidden, onMore, expand: () => { onSelect(); setExpanded(true); }, collapse: () => setExpanded(false) });

  return {
    flags,
    editorVisible,
    autoFocus: focusEditor || adding,
    expanded,
    toggle,
    showAdd: selected && flags.canAdd && !editorVisible,
    showFull: selected && flags.ownerDraft && !flags.runActive && !editorVisible && flags.full,
    cardValue,
    titleRef,
    sectionRef,
    onAdd: () => setAdding(true),
    savedCard,
    cancelEditor,
    escapeEditor,
    onSectionClick,
    onSectionKey,
  };
}
