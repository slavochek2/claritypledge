/**
 * @file canvas-new-card-store.ts
 * @description P1621: the owner's unsaved NEW-card text, one buffer per draft and box, held outside the components that draw it so clicking away, selecting
 * another box, a run starting or a re-read never loses it. Separate from P1614's store (canvas-point-edit-store), which is keyed by an existing point: a new card has
 * none, and keeping the two apart means a buffer never reads as a gone point. Cleared when the canvas page unmounts and when a different person signs in, as
 * P1614's is (leaving without saving discards it, as an unsaved form does). Same tab only.
 */
import { useSyncExternalStore } from 'react';

export interface NewCardEntry {
  draftId: string;
  box: string;
  text: string;
  /** the last save's refusal or failure, shown under the text */
  problem: string | null;
  saving: boolean;
  /** Retry key (P1621): one per buffer, kept across retries of the SAME text; a changed text after a lost answer gets a new one. */
  clientId: string | null;
  /** the trimmed text `clientId` was first used for */
  sentText: string | null;
  /** the draft revision the server answered box_full at: the sentence stays until the draft moves past it with room in the box (null: no such refusal) */
  fullAtRevision: number | null;
}

export const newCardKey = (draftId: string, box: string): string => `${draftId}:${box}`;

let entries: ReadonlyMap<string, NewCardEntry> = new Map();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const getNewCards = (): ReadonlyMap<string, NewCardEntry> => entries;
export const useNewCards = (): ReadonlyMap<string, NewCardEntry> => useSyncExternalStore(subscribe, getNewCards, getNewCards);

/** The buffer for a draft's box, created empty when there is none. */
export function ensureNewCard(draftId: string, box: string): void {
  const key = newCardKey(draftId, box);
  if (entries.has(key)) return;
  entries = new Map(entries).set(key, { draftId, box, text: '', problem: null, saving: false, clientId: null, sentText: null, fullAtRevision: null });
  emit();
}
export function patchNewCard(key: string, patch: Partial<NewCardEntry>): void {
  const cur = entries.get(key);
  if (!cur) return;
  entries = new Map(entries).set(key, { ...cur, ...patch });
  emit();
}
export function closeNewCard(key: string): void {
  if (!entries.has(key)) return;
  const next = new Map(entries);
  next.delete(key);
  entries = next;
  emit();
}
/** How long a saved card is expected to take to come back in a read; after that an empty box offers its editor again even if the read never arrived. */
export const SAVED_CARD_HOLD_MS = 15_000;
/** A card the owner saved: the draft revision the save made, and when. Until the page has read that revision (or the hold runs out) an empty box does not reopen its editor over the card on its way. */
export interface SavedCard { revision: number; at: number }
let savedCards: ReadonlyMap<string, SavedCard> = new Map();
export const markSavedCard = (key: string, revision: number): void => { savedCards = new Map(savedCards).set(key, { revision, at: Date.now() }); emit(); };
export const useSavedCard = (key: string): SavedCard | undefined => useSyncExternalStore(subscribe, () => savedCards.get(key), () => savedCards.get(key));

/** Forget every buffer (the canvas page unmounting, a sign-out, tests). */
export function resetNewCards(): void {
  if (entries.size === 0 && savedCards.size === 0) return;
  entries = new Map();
  savedCards = new Map();
  emit();
}

/** True when the buffer holds words the owner typed (what "Unsaved text" and the reopened editor depend on). */
export const hasNewCardText = (e: NewCardEntry | undefined): boolean => !!e && e.text.trim() !== '';

/**
 * The client id a save of `text` uses: the buffer's own while the text is the one it was first used for (a repeat after a lost answer returns the first result),
 * a fresh one when the text changed. Writes the choice to the buffer.
 */
export function clientIdFor(key: string, text: string): string {
  const cur = entries.get(key);
  if (cur?.clientId && cur.sentText === text) return cur.clientId;
  const id = crypto.randomUUID();
  patchNewCard(key, { clientId: id, sentText: text });
  return id;
}

/**
 * The buffers of this box that hold typed words for a draft that is really closed (published, discarded or replaced while the owner typed). A draft that is still OPEN but not the
 * one on screen (the owner is looking at a published version) is not gone: its buffer is kept silently.
 */
export function useGoneNewCards(box: string, currentDraftId: string | undefined, openDraftId: string | null | undefined): NewCardEntry[] {
  const all = useNewCards();
  return [...all.values()].filter(e => e.box === box && e.draftId !== currentDraftId && e.draftId !== openDraftId && hasNewCardText(e));
}
