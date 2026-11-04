/**
 * @file canvas-point-edit-store.ts
 * @description P1614: the owner's open point editors, held OUTSIDE the components that draw them, so typed text survives a run starting, the grid and the
 * See all panel taking turns, and a re-read. A buffer belongs to ONE draft and ONE point (`pointEditKey`), is never moved onto another point, and is
 * cleared when the canvas page unmounts and on sign-out: leaving without saving discards it, as an unsaved form does. Same tab only.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { PointWithUserPosition } from '@/app/types';

export interface PointEditEntry {
  draftId: string;
  /** the box tag it was opened in */
  box: string;
  /** the point it was opened on, for good: if that point is gone the editor can no longer save */
  originId: string;
  text: string;
  /** the last save's refusal or failure, shown under the text */
  problem: string | null;
  saving: boolean;
  /** The ids of the box's points when a save that ended in stale_view or a thrown error started: that save may have landed. Null otherwise (a busy refusal never sets it). Cleared when the text changes. */
  watchIds: string[] | null;
}

export const pointEditKey = (draftId: string, pointId: string): string => `${draftId}:${pointId}`;

let entries: ReadonlyMap<string, PointEditEntry> = new Map();
let panelBoxes: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const getPointEdits = (): ReadonlyMap<string, PointEditEntry> => entries;
export const usePointEdits = (): ReadonlyMap<string, PointEditEntry> => useSyncExternalStore(subscribe, getPointEdits, getPointEdits);

/** Opens an editor on a point. One already open on that point of that draft keeps its text. */
export function openPointEdit(e: Pick<PointEditEntry, 'draftId' | 'box' | 'originId' | 'text'>): void {
  const key = pointEditKey(e.draftId, e.originId);
  if (entries.has(key)) return;
  entries = new Map(entries).set(key, { ...e, problem: null, saving: false, watchIds: null });
  emit();
}
export function patchPointEdit(key: string, patch: Partial<PointEditEntry>): void {
  const cur = entries.get(key);
  if (!cur) return;
  entries = new Map(entries).set(key, { ...cur, ...patch });
  emit();
}
export function closePointEdit(key: string): void {
  if (!entries.has(key)) return;
  const next = new Map(entries);
  next.delete(key);
  entries = next;
  emit();
}
/** Forget every editor (the canvas page unmounting, a sign-out, tests). */
export function resetPointEdits(): void {
  if (entries.size === 0) return;
  entries = new Map();
  emit();
}

/**
 * The See all panel for a box owns that box's editors while it is open, so the grid behind it draws none: one editor per point.
 * Returns the way to hand them back.
 */
export function claimPanelBox(tag: string): () => void {
  panelBoxes = new Set(panelBoxes).add(tag);
  emit();
  return () => {
    const next = new Set(panelBoxes);
    next.delete(tag);
    panelBoxes = next;
    emit();
  };
}
export const usePanelBoxes = (): ReadonlySet<string> => useSyncExternalStore(subscribe, () => panelBoxes, () => panelBoxes);

/**
 * Clears every buffer when the signed-in person becomes a DIFFERENT person. Going to no one is not enough (a session refresh passes through undefined and
 * must not destroy typed text): a real sign-out leaves a viewer who no longer owns the draft, so no editor is drawn, and leaving the page then clears the text.
 */
export function useClearPointEditsOnAuthChange(viewerId: string | null | undefined): void {
  const lastSignedIn = useRef<string | null | undefined>(viewerId);
  useEffect(() => {
    if (!viewerId) return;
    if (lastSignedIn.current && lastSignedIn.current !== viewerId) resetPointEdits();
    lastSignedIn.current = viewerId;
  }, [viewerId]);
}

/** The box's first `limit` cards, plus any point whose editor is open on this surface: the owner's typed text is never hidden by the limit. */
export function shownPoints(points: PointWithUserPosition[], limit: number | undefined, draftId: string, entries: ReadonlyMap<string, PointEditEntry>, here: boolean): PointWithUserPosition[] {
  return points.filter((p, i) => !limit || i < limit || (here && entries.has(pointEditKey(draftId, p.id))));
}

/** How many of the box's points the grid is NOT drawing (what "See all" is for): an open editor on a point past the limit shows it, so it is not hidden. */
export function useHiddenCount(tag: string, points: PointWithUserPosition[] | null, edit: { draftId: string } | undefined, limit: number): number {
  const entries = usePointEdits();
  const panelHas = usePanelBoxes().has(tag);
  if (!points) return 0;
  if (!edit) return Math.max(0, points.length - limit);
  return points.length - shownPoints(points, limit, edit.draftId, entries, !panelHas).length;
}
