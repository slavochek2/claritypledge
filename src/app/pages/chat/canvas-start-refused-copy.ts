/**
 * P1529 (founder 2026-11-13): what the canvas thread says when the request that STARTS a run was refused, instead of "Updating…" for the rest
 * of the lease. [FOUNDER DECISION: copy] No em dashes. Plain sentence plus a next step where one exists.
 */
import { DRAFT_ERROR_TEXT } from './canvas-thread-copy';

// [FOUNDER DECISION: copy] The strings below are proposed wording.
export const START_REFUSED_TERMS = 'Please accept the updated terms to continue.';
export const START_REFUSED_GENERIC = 'We couldn’t update your canvas.';
export const START_REFUSED_TRY_AGAIN = 'Try again';
export const START_REFUSED_TRYING = 'Trying…';
/** A Try again answered BUSY: the draft really is being written (or still holds the run). */
export const START_REFUSED_BUSY = 'Your canvas is still updating. Wait a moment.';
export const START_REFUSED_TERMS_ACTION = 'Review terms';

export type StartRefusedKind = 'terms' | 'final' | 'retry';

/** What a refused start says and offers. `terms`: reload brings up the existing terms dialog. `final`: retrying cannot help (a limit, drafting off). `retry`: ask again. */
export function startRefusedNotice(code: string): { kind: StartRefusedKind; text: string } {
  if (code === 'TERMS_NOT_ACCEPTED') return { kind: 'terms', text: START_REFUSED_TERMS };
  if (code === 'CAPPED' || code === 'DISABLED' || code === 'REVISION_CAP' || code === 'LIMIT') return { kind: 'final', text: DRAFT_ERROR_TEXT[code] ?? START_REFUSED_GENERIC };
  return { kind: 'retry', text: START_REFUSED_GENERIC };
}
