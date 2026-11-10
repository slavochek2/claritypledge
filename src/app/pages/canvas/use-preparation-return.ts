/**
 * @file use-preparation-return.ts
 * @description P1529: where the workspace's preparation banner sends the owner back to (`afterPublish` in the navigation state, a same-origin
 * app path only). Kept once seen, FOR THE CANVAS IT WAS SEEN ON: a pushed panel entry (point, box) of the same canvas carries its own state and would drop
 * the mark mid-edit, but another canvas (a different `canvasKey`, the route's handle + projectTag) forgets it, so its banner and Publish never jump to preparation.
 */
import { useState } from 'react';
import { afterPublishPath, backToTablePath, prepStepOf, tableEventOf, type PrepStep } from '@/lib/canvas-hrefs';

function useRemembered<T>(now: T | null, canvasKey: string, same: (a: T, b: T) => boolean): T | null {
  const [seen, setSeen] = useState(() => ({ key: canvasKey, path: now }));
  const sameCanvas = seen.key === canvasKey;
  if (!sameCanvas || (now && !(seen.path && same(now, seen.path)))) setSeen({ key: canvasKey, path: now ?? (sameCanvas ? seen.path : null) }); // adjusting state during render (React's documented pattern), not a ref write
  return sameCanvas ? (now ?? seen.path) : now;
}

export function usePreparationReturn(state: unknown, canvasKey = ''): string | null {
  return useRemembered(afterPublishPath(state), canvasKey, (a, b) => a === b);
}

/** The step the preparation said the canvas belongs to (banner: "Step N of M"), remembered like the return path; null when the state carries none. */
export function usePreparationStep(state: unknown, canvasKey = ''): PrepStep | null {
  return useRemembered(prepStepOf(state), canvasKey, (a, b) => a.step === b.step && a.total === b.total);
}

/** P1529: the event room's path (and the event) a canvas was opened from, remembered like the preparation return, for ITS canvas only; null when the state carries none. */
export function useTableReturn(state: unknown, canvasKey = ''): { to: string; eventId: string | null } | null {
  const path = backToTablePath(state);
  const now = path ? { to: path, eventId: tableEventOf(state) } : null;
  return useRemembered(now, canvasKey, (a, b) => a.to === b.to && a.eventId === b.eventId);
}
