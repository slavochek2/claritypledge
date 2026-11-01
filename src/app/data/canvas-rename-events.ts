/**
 * @file canvas-rename-events.ts
 * @description P1536 W8: the signal that a canvas's display title changed. `renameCanvas` emits it once the database confirmed the new title (a refused
 * rename emits nothing); whatever shows that canvas's title elsewhere (the cards in chat threads, the cache of their reads) answers by reading again.
 * Same tab only; a listener that throws never stops the rest. The pattern of canvas-draft-events.
 */

type Listener = (canvasId: string) => void;

const listeners = new Set<Listener>();

export function emitCanvasRenamed(canvasId: string): void {
  for (const listener of [...listeners]) {
    try {
      listener(canvasId);
    } catch {
      /* one listener's failure is not the others' */
    }
  }
}

/** Returns the way to stop listening. */
export function subscribeCanvasRenamed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
