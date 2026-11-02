/**
 * @file canvas-draft-state-read.ts
 * @description P1536: the ONE place the owner's state read (`get_canvas_draft_state`) is called from a thread. Undo asks it which run to undo; the offer rows ask it what is on offer;
 * both are asked in the same moment (a draft changed, a thread opened), so a request that is already in flight for the same canvas is JOINED, never repeated (one batched read,
 * docs/technical/metered-services.md). Nothing is cached: once the answer is back the next call is a new request, and `fresh` (a read that must see a write made a moment ago)
 * never joins one that was sent before that write.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { failRpc, type Row } from './canvas-draft-calls';

const inFlight = new Map<string, Promise<Row>>();

async function request(canvasId: string): Promise<Row> {
  try {
    const { data, error } = await supabase.rpc('get_canvas_draft_state', { p_canvas: canvasId });
    if (error || !data) failRpc('readCanvasDraftState', error, 'Could not read this draft');
    return data as Row;
  } finally {
    clearListReturnCache(); // the server's expire step can fail a run: a write the cached lists never show
  }
}

/** The whole answer, as read now. `fresh`: ask again even when a read is already out (after a write the answer must show). */
export function readCanvasDraftState(canvasId: string, opts: { fresh?: boolean } = {}): Promise<Row> {
  const joined = opts.fresh ? undefined : inFlight.get(canvasId);
  if (joined) return joined;
  const p = request(canvasId);
  inFlight.set(canvasId, p);
  const done = () => {
    if (inFlight.get(canvasId) === p) inFlight.delete(canvasId);
  };
  p.then(done, done);
  return p;
}
