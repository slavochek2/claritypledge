/**
 * @file canvas-draft-events.ts
 * @description P1536: the one signal the canvas page and a canvas draft's chat thread share when they are on screen together
 * (the thread beside the canvas on a wide screen). Each side keeps its own state, read from the database; this only says
 * "re-read now" and what happened to which draft:
 *  - 'updated'   a draft run finished (the draft's points changed): the canvas re-reads in place
 *  - 'published' the draft became a published version: the canvas leaves the draft's address, the thread re-reads
 *  - 'discarded' the draft was thrown away: the same
 * `publishCanvasDraft` and `discardCanvasDraft` emit their own event after the server confirmed (canvas-draft-service), and
 * the thread emits 'updated' when a run it was watching ends well. Same tab only; a listener that throws never stops the rest.
 */

export type CanvasDraftEventKind = 'updated' | 'published' | 'discarded';

export interface CanvasDraftEvent {
  kind: CanvasDraftEventKind;
  /** the `canvas_drafts.id` it happened to */
  draftId: string;
}

type Listener = (event: CanvasDraftEvent) => void;

const listeners = new Set<Listener>();

export function emitCanvasDraftEvent(event: CanvasDraftEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* one listener's failure is not the others' */
    }
  }
}

/** Returns the way to stop listening. */
export function subscribeCanvasDraftEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
