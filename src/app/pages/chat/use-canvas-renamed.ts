/**
 * @file use-canvas-renamed.ts
 * @description P1536 W8: a card that shows a canvas's title asks to be told when that canvas was renamed (and confirmed), then reads again quietly:
 * it keeps showing what it has until the new read answers.
 */
import { useEffect, useRef } from 'react';
import { subscribeCanvasRenamed } from '@/app/data/canvas-rename-events';

/** `canvasId` null: nothing to follow (the card has not read yet, or shows no canvas). `onRenamed` is the card's quiet re-read. */
export function useCanvasRenamed(canvasId: string | null | undefined, onRenamed: () => void): void {
  const latest = useRef(onRenamed);
  latest.current = onRenamed;
  useEffect(() => {
    if (!canvasId) return;
    return subscribeCanvasRenamed((renamed) => {
      if (renamed === canvasId) latest.current();
    });
  }, [canvasId]);
}
