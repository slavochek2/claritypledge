/**
 * @file canvas-publish-spot-state.ts
 * @description P1536 3c X7: what the Publish spot answers to, in four states. Pure, so the rule has one home: the spot shows a button only in `publish`;
 * every other state is a status in the same footprint (design-system rule 9: "When an action is waiting, a status takes its spot. When there is nothing
 * to act on, a status says so in the same spot. Never disabled."). Publish shows only when the draft has points AND (it has no base, or it differs
 * from its base). A published version's spot is Share, not this (canvas-header-model); the old texts "No changes yet", "Not published yet" and
 * "Published · vN" are gone.
 */
import { isViewingDraft, type CanvasReady } from './canvas-page-data';

export type PublishSpotState =
  | { kind: 'loading' }
  | { kind: 'updating' }
  | { kind: 'publish' }
  | { kind: 'nothing' };

/** The one footprint (96px, so the switcher, Discard and the spot fit one row at 320px). Fixed on purpose: a status, Share and the button must occupy the same box, so nothing beside it moves. */
export const SPOT_BOX = 'flex h-11 w-24 shrink-0 items-center justify-end';

/** The words of every status state; null for the states that are not a status (the Publish button, and loading). */
export function statusText(state: PublishSpotState, publishing: boolean): string | null {
  if (publishing) return 'Publishing…';
  switch (state.kind) {
    case 'updating': return 'Updating…';
    case 'nothing': return 'Nothing to publish yet';
    default: return null;
  }
}

/** What the spot answers to, read from the page and from the draft's thread (is a run active?). */
export function publishSpotState(ready: CanvasReady | null, runActive: boolean, pendingClone = false): PublishSpotState {
  // A run, an upload or a first Send is going (D15): "Updating…" whatever version is on screen (and whether or not the page is reading); the draft it changes is not the page's.
  if (runActive) return { kind: 'updating' };
  if (!ready) return { kind: 'loading' }; // the page is reading: neither a button nor a claim about the draft
  // W3: a Clone is pending (the owner is editing a published version, nothing written yet): there is nothing to publish.
  if (pendingClone && !isViewingDraft(ready)) return { kind: 'nothing' };
  const draft = ready.draft;
  if (draft && isViewingDraft(ready)) {
    const hasPoints = ready.points.length > 0;
    // The server's own definition (get_canvas_draft_state / Publish): a first draft differs when it has points; a draft from vN when a box differs.
    const differs = draft.baseSeq === null ? hasPoints : draft.changedBoxes.length > 0;
    return hasPoints && differs ? { kind: 'publish' } : { kind: 'nothing' };
  }
  return { kind: 'nothing' };
}

/** What a typed refusal of Publish turns the spot into until the draft moves on (spec: draft_empty and no_changes return it to "Nothing to publish yet"). */
export function stateAfterRefusal(refused: string): PublishSpotState | 'reread' | 'unknown' {
  if (refused === 'no_changes' || refused === 'draft_empty') return { kind: 'nothing' };
  if (refused === 'stale_view' || refused === 'busy' || refused === 'busy_elsewhere') return 'reread';
  return 'unknown';
}
