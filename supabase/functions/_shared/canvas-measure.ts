/**
 * P1653 TEMPORARY measurement code: remove this module and its one call site (canvas-run.ts failureOf, plus the `response` argument it passes) after the
 * replay. Counts, booleans and labels only, never model text or owner words. It reads the raw model response itself, so canvas-parse.ts is untouched.
 */
import { readJson } from './canvas-read.ts';
import type { DraftOutcome } from './canvas-types.ts';

/** How the model's `actions` arrived: an array, absent, present but not an array, or no readable JSON at all. */
export type ActionsForm = 'actions' | 'none' | 'invalid' | 'unreadable';

/**
 * What the model sent, before any filtering: how many actions (null when the response held no readable JSON), and in which form. The `sections` of a
 * context are a pasted Copy prompt's groups (they set focus and offers) and never an alternate form of `actions`, so there is one form to count.
 */
export function actionsOf(response: unknown): { rawActions: number | null; actionsForm: ActionsForm } {
  const read = readJson(response);
  if (!read.ok) return { rawActions: null, actionsForm: 'unreadable' };
  const sent = ((read.parsed ?? {}) as { actions?: unknown }).actions;
  return { rawActions: Array.isArray(sent) ? sent.length : 0, actionsForm: Array.isArray(sent) ? 'actions' : sent === undefined ? 'none' : 'invalid' };
}

/** The measurement line as ONE string (a multi-key object prints across many lines in the log, and a line filter then never sees the run id). */
export function parsedLine(runId: string, out: DraftOutcome, response: unknown): string {
  const sent = actionsOf(response);
  const body = out.ok
    ? { run_id: runId, ok: true, ...sent, total: out.total, resolvedActions: out.actions.length, droppedUnverified: out.droppedUnverified, droppedNames: out.droppedNames, droppedScope: out.droppedScope, droppedCap: out.droppedCap, droppedPoints: out.droppedPoints.length, questions: Object.keys(out.questions).length, note: out.note.length > 0, scope: out.scope.length, guessed: out.guessed.length }
    : { run_id: runId, ok: false, code: out.code, ...sent };
  return `canvas-draft: parsed ${JSON.stringify(body)}`;
}
