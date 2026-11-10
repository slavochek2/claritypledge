/**
 * P1536: the one write that ends a run as failed (`_canvas_draft_run_fail`), with its one retry. Moved out of canvas-run.ts unchanged (that file is at its
 * size limit); canvas-run.ts re-exports `failRun`, so every caller keeps its import. Logging: fixed codes only.
 */

import type { CanvasRun, RunDeps, RunParams, RunSummary } from './canvas-run.ts';

/** The pause before the one retry of a fail write: 200 to 600 ms, random so many failing writes do not retry together. It ends early when the invocation's deadline fires. */
const RETRY_PAUSE_MIN_MS = 200;
const RETRY_PAUSE_SPAN_MS = 400;
function pauseBeforeRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};
    const done = () => { clearTimeout(pending.timer); signal?.removeEventListener('abort', done); resolve(); };
    pending.timer = setTimeout(done, RETRY_PAUSE_MIN_MS + Math.random() * RETRY_PAUSE_SPAN_MS);
    signal?.addEventListener('abort', done, { once: true });
  });
}

export async function failRun(deps: Pick<RunDeps, 'rpc' | 'signal'>, run: Pick<CanvasRun, 'run_id'>, p: RunParams, code: string, reply: string | null, usd: number | null): Promise<RunSummary> {
  // One more try if the write fails: a run that stays 'running' blocks the owner until its lease runs out.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await deps.rpc('_canvas_draft_run_fail', { p_run: run.run_id, p_owner: p.ownerId, p_code: code, p_reply: reply, p_actual_usd: usd });
      if (!error) break;
      console.error('canvas-draft: fail write failed', { code: error.code, attempt });
    } catch (e) {
      console.error('canvas-draft: fail write threw', { error: (e as Error).name, attempt });
    }
    if (attempt === 1) await pauseBeforeRetry(deps.signal);
  }
  return { state: 'failed', code };
}
