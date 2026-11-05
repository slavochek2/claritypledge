/**
 * P1529 D23: is this run the tap's own "Make my next version" run? Any failure reads as false: the strict owner-quote
 * rule is the safe side. A tap always tags all nine boxes on a later draft; nothing else needs the extra call.
 */
import type { CanvasRun, RunDeps } from './canvas-run.ts';

export async function isRoundUpdate(deps: Pick<RunDeps, 'rpc'>, run: CanvasRun, kind: string): Promise<boolean> {
  if (run.first_draft === true || kind !== 'message' || run.box_refs?.length !== 9) return false;
  try {
    const { data, error } = await deps.rpc('_canvas_run_is_round_update', { p_run: run.run_id });
    return !error && data === true;
  } catch {
    return false;
  }
}
