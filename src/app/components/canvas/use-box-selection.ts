/**
 * @file use-box-selection.ts
 * @description P1621: which canvas box is selected, on the owner's canvas. One at a time. Selecting is how a box shows its actions; clicking the box again, clicking outside
 * the page's boxes, or Escape deselects. Clicks in the thread panel, in dialogs and in portals are outside the page and never deselect.
 *
 * First visit: the first time this person opens a draft in this browser, the first box with a card opens selected (an empty draft opens Customer Segments with its
 * editor). It is recorded per user in browser storage; when storage is unavailable nothing opens. Later visits start with nothing selected.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { CANVAS_LAYERS, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';

/** The boxes in the order the canvas shows them. */
const DISPLAY_ORDER: readonly CanvasBoxTag[] = CANVAS_LAYERS.flatMap(l => l.boxes);

export const firstVisitKey = (userId: string): string => `p1621:first-draft-visit:${userId}`;

/** What opens on a person's first draft: the first box with a card, else Customer Segments. Null: this is not the first visit, or storage cannot say. */
export function firstVisitBox(userId: string, boxes: ReadonlyMap<CanvasBoxTag, PointWithUserPosition[]>): CanvasBoxTag | null {
  try {
    const key = firstVisitKey(userId);
    if (window.localStorage.getItem(key)) return null;
    window.localStorage.setItem(key, '1');
  } catch {
    return null;   // storage unavailable: nothing opens
  }
  return DISPLAY_ORDER.find(tag => (boxes.get(tag)?.length ?? 0) > 0) ?? 'canvas:segments';
}

export interface BoxSelection {
  /** the selected box, or null (always null when selecting is off) */
  selected: CanvasBoxTag | null;
  /** the selected box was chosen by the person, so an empty box's text field takes focus; the first-visit opening never moves focus */
  focusEditor: boolean;
  select: (tag: CanvasBoxTag) => void;
  toggle: (tag: CanvasBoxTag) => void;
  deselect: () => void;
}

export function useBoxSelection({ enabled, userId, boxes, pageRef }: {
  /** the viewer is the canvas's owner (selecting shows something) */
  enabled: boolean;
  /** set only on the owner's open draft: the first-visit opening applies there and nowhere else */
  userId: string | undefined;
  /** null while loading */
  boxes: ReadonlyMap<CanvasBoxTag, PointWithUserPosition[]> | null;
  /** the element whose insides count as "the page": a click inside it but outside every box deselects */
  pageRef: RefObject<HTMLElement | null>;
}): BoxSelection {
  const [state, setState] = useState<{ tag: CanvasBoxTag | null; focus: boolean }>({ tag: null, focus: false });
  const selected = enabled ? state.tag : null;

  const select = useCallback((tag: CanvasBoxTag) => setState({ tag, focus: true }), []);
  const toggle = useCallback((tag: CanvasBoxTag) => setState(s => (s.tag === tag ? { tag: null, focus: false } : { tag, focus: true })), []);
  const deselect = useCallback(() => setState({ tag: null, focus: false }), []);

  // The first-visit opening, decided once per person per mount.
  const decided = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !boxes || decided.current === userId) return;
    decided.current = userId;
    const tag = firstVisitBox(userId, boxes);
    if (tag) setState({ tag, focus: false });
  }, [userId, boxes]);

  // A click inside the page but outside every box deselects. Elements the click itself removed are not "outside".
  useEffect(() => {
    if (!selected) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element) || !target.isConnected) return;
      if (target.closest('[data-canvas-box]')) return;
      const page = pageRef.current?.closest('[data-canvas-page]') ?? pageRef.current;
      if (!page?.contains(target)) return;
      deselect();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [selected, pageRef, deselect]);

  return { selected, focusEditor: state.focus, select, toggle, deselect };
}
