/**
 * P1536: one deadline per invocation, shared by every step of a run (extraction, link reads, token counts and the draft call) as
 * one AbortSignal. 120 s: under the edge function's 150 s wall clock and far under the run's 5 minute lease (`c_dead` in
 * `_canvas_draft_expire`), so a run that cannot finish is failed by this invocation with the spend actually made, never by the lease.
 * Built on setTimeout (not AbortSignal.timeout) so a test can drive it with fake timers. Pure: no Deno or esm.sh imports.
 */

export const RUN_DEADLINE_MS = 120_000;

export class DeadlineExceeded extends Error {
  constructor() {
    super('canvas run deadline');
  }
}

export function makeDeadline(ms: number = RUN_DEADLINE_MS): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DeadlineExceeded()), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}
