/**
 * @file use-preparation-return.ts
 * @description P1529: where the workspace's preparation banner sends the owner back to (`afterPublish` in the navigation state, a same-origin
 * app path only). Kept once seen, FOR THE CANVAS IT WAS SEEN ON: a pushed panel entry (point, box) of the same canvas carries its own state and would drop
 * the mark mid-edit, but another canvas (a different `canvasKey`, the route's handle + projectTag) forgets it, so its banner and Publish never jump to preparation.
 */
import { useState } from 'react';
import { afterPublishPath } from '@/lib/canvas-hrefs';

export function usePreparationReturn(state: unknown, canvasKey = ''): string | null {
  const now = afterPublishPath(state);
  const [seen, setSeen] = useState(() => ({ key: canvasKey, path: now }));
  const sameCanvas = seen.key === canvasKey;
  if (!sameCanvas || (now && now !== seen.path)) setSeen({ key: canvasKey, path: now ?? (sameCanvas ? seen.path : null) }); // adjusting state during render (React's documented pattern), not a ref write
  return sameCanvas ? (now ?? seen.path) : now;
}
