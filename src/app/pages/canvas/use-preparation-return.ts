/**
 * @file use-preparation-return.ts
 * @description P1529: where the workspace's preparation banner sends the owner back to (`afterPublish` in the navigation state, a same-origin
 * app path only). Kept once seen: a pushed panel entry (point, box) carries its own state and would drop the mark mid-edit.
 */
import { useState } from 'react';
import { afterPublishPath } from '@/lib/canvas-hrefs';

export function usePreparationReturn(state: unknown): string | null {
  const [seen, setSeen] = useState<string | null>(null);
  const now = afterPublishPath(state);
  if (now && now !== seen) setSeen(now); // adjusting state during render (React's documented pattern), not a ref write
  return now ?? seen;
}
