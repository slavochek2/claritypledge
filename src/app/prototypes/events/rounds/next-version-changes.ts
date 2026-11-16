/**
 * @file next-version-changes.ts
 * @description P1686: what the owner's next-version draft changes from the version it was started from, box by box (canvas box order), as point
 * text added and removed (exact text match: a reworded point reads as one removed and one added). A draft with no base shows every point as added.
 * The room card shows this list before its Publish (decisions.md 2026-11-13 [product]: never publish blind).
 */
import { CANVAS_BOXES, CANVAS_LAYERS } from '@/lib/canvas-boxes';

// [FOUNDER DECISION: copy] every string below, proposed.
export const CHANGES_COPY = {
  heading: 'What changes in your next version',
  added: 'Added',
  removed: 'Removed',
  publish: 'Publish',
  publishing: 'Publishing…',
  openFull: 'Open full draft',
  loading: 'Reading your changes…',
  unreadable: 'Could not read your changes.',
  retry: 'Try again',
  none: 'Your draft has no changes to the points.',
  busy: 'Your mirror is still working on this draft. Here is the latest.',
  moved: 'Your draft changed. Here are the new changes.',
  failed: 'Could not publish. Try again.',
  sameWords: 'Changed, with the same words',
};

/** A point as `get_canvas` maps it: its text is `statement`. */
export interface PointLike { statement: string; systemTags?: string[] }
/** `sameWords`: the server counts this box as changed (its point set differs) but no point's text did: shown, so Publish never hides a change. */
export interface BoxChange { tag: string; title: string; added: string[]; removed: string[]; sameWords?: boolean }

const textsIn = (points: readonly PointLike[], tag: string): string[] =>
  points.filter(p => (p.systemTags ?? []).includes(tag)).map(p => (p.statement ?? '').trim()).filter(Boolean);

/** Removes one occurrence of each of `b` from `a`, so duplicated text is counted, not collapsed. */
function minus(a: string[], b: string[]): string[] {
  const left = [...b];
  return a.filter(t => { const i = left.indexOf(t); if (i < 0) return true; left.splice(i, 1); return false; });
}

export function diffCanvasPoints(draft: readonly PointLike[], base: readonly PointLike[] | null, serverChanged: readonly string[] = []): BoxChange[] {
  // The canvas's reading order (row by row), so the list reads like the page.
  const order = CANVAS_LAYERS.flatMap(l => l.boxes).map(tag => ({ tag, title: CANVAS_BOXES.find(b => b.tag === tag)?.title ?? tag }));
  return order.flatMap(({ tag, title }) => {
    const now = textsIn(draft, tag);
    const before = base ? textsIn(base, tag) : [];
    const added = minus(now, before);
    const removed = minus(before, now);
    if (added.length || removed.length) return [{ tag, title, added, removed }];
    return base && serverChanged.includes(tag) ? [{ tag, title, added, removed, sameWords: true }] : [];
  });
}
