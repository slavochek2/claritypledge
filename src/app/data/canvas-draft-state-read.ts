/**
 * @file canvas-draft-state-read.ts
 * @description P1536: the ONE place the owner's state read (`get_canvas_draft_state`) is called from a thread. Undo asks it which run to undo; the offer rows ask it what is on offer; both
 * are asked in the same moment (a draft changed, a thread opened).
 *
 * Batching, not dedupe (docs/decisions.md 2026-10-21, P1527; the same idea as canvas-root-store.ts, which waits a macrotask): the asks made in ONE synchronous run become ONE request, issued
 * right after it (a microtask). The two consumers, Undo and the offer rows, ask from the effects of one React commit, which run in one synchronous flush, so a microtask is enough
 * to join them, and no ask ever waits for a later tick.
 * Every request is FRESH: an ask made after a request went out starts the next one, never joins it and never reads an earlier answer, so no write has to invalidate anything (an
 * in-flight dedupe could hand a read that started before a write to a caller that asked after it). The only thing shared is the moment of asking; nothing is cached.
 * Cost: Undo plus the offer rows cost ONE `get_canvas_draft_state` per signal (a draft's revision or newest run changing, a thread opening, the tab coming back), as Undo alone did.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { failRpc, type Row } from './canvas-draft-calls';

interface Asker { resolve: (data: Row) => void; reject: (e: unknown) => void }

/** The askers of the request that has not been sent yet, by canvas. Emptied the moment its request goes out. */
const waiting = new Map<string, Asker[]>();

async function request(canvasId: string): Promise<Row> {
  try {
    const { data, error } = await supabase.rpc('get_canvas_draft_state', { p_canvas: canvasId });
    if (error || !data) failRpc('readCanvasDraftState', error, 'Could not read this draft');
    return data as Row;
  } finally {
    clearListReturnCache(); // the server's expire step can fail a run: a write the cached lists never show
  }
}

/** The whole answer of a request made after this ask and shared only with the asks of the same tick. */
export function readCanvasDraftState(canvasId: string): Promise<Row> {
  return new Promise<Row>((resolve, reject) => {
    const askers = waiting.get(canvasId);
    if (askers) {
      askers.push({ resolve, reject });
      return;
    }
    waiting.set(canvasId, [{ resolve, reject }]);
    queueMicrotask(() => {
      const batch = waiting.get(canvasId) ?? [];
      waiting.delete(canvasId); // from here on an ask starts the next request
      request(canvasId).then(
        (data) => batch.forEach((a) => a.resolve(data)),
        (e) => batch.forEach((a) => a.reject(e)),
      );
    });
  });
}
