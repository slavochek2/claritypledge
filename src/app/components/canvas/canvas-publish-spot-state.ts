/**
 * @file canvas-publish-spot-state.ts
 * @description P1536 §2 "Publish spot": the one place Publish lives, in five states. Pure, so the rule has one home: the spot shows a
 * button only in `publish`; every other state is a status in the same footprint. No state is a disabled button.
 */
import { isViewingDraft, type CanvasReady } from './canvas-page-data';

export type PublishSpotState =
  | { kind: 'loading' }
  | { kind: 'updating' }
  | { kind: 'publish' }
  | { kind: 'no-changes' }
  | { kind: 'published'; seq: number | null }
  | { kind: 'not-published' };

/** The one footprint. Fixed on purpose: a status and the button must occupy the same box, to the pixel. */
export const SPOT_BOX = 'flex h-11 w-28 shrink-0 items-center justify-end';

/** The words of every status state; null for the states that are not a status (the Publish button, and loading). */
export function statusText(state: PublishSpotState, publishing: boolean): string | null {
  if (publishing) return 'Publishing…';
  switch (state.kind) {
    case 'updating': return 'Updating…';
    case 'no-changes': return 'No changes yet';
    case 'published': return state.seq ? `Published · v${state.seq}` : 'Published';
    case 'not-published': return 'Not published yet';
    default: return null;
  }
}

/** What the spot answers to, read from the page and from the draft's thread (is a run active?). */
export function publishSpotState(ready: CanvasReady | null, runActive: boolean, pendingClone = false): PublishSpotState {
  // A run, an upload or a first Send is going (D15): "Updating…" whatever version is on screen (and whether or not the page is reading); the draft it changes is not the page's.
  if (runActive) return { kind: 'updating' };
  if (!ready) return { kind: 'loading' }; // the page is reading: neither a button nor a claim about the draft
  // W3: a Clone is pending (the owner is editing a published version, nothing written yet): there is nothing to publish.
  if (pendingClone && !isViewingDraft(ready) && !ready.publishedNone) return { kind: 'no-changes' };
  const draft = ready.draft;
  if (draft && isViewingDraft(ready)) {
    const hasPoints = ready.points.length > 0;
    // The server's own definition (get_canvas_draft_state / Publish): a first draft differs when it has points; a draft from vN when a box differs.
    const differs = draft.baseSeq === null ? hasPoints : draft.changedBoxes.length > 0;
    if (hasPoints && differs) return { kind: 'publish' };
    if (hasPoints) return { kind: 'no-changes' };
    return { kind: 'not-published' };
  }
  if (!ready.publishedNone) {
    const open = ready.versions.find(v => v.name === ready.version);
    return { kind: 'published', seq: open?.seq ?? ready.versions.find(v => !v.draft)?.seq ?? null };
  }
  return { kind: 'not-published' };
}

/** What a typed refusal of Publish turns the spot into until the draft moves on (spec: draft_empty and no_changes show the status). */
export function stateAfterRefusal(refused: string): PublishSpotState | 'reread' | 'unknown' {
  if (refused === 'no_changes') return { kind: 'no-changes' };
  if (refused === 'draft_empty') return { kind: 'not-published' };
  if (refused === 'stale_view' || refused === 'busy' || refused === 'busy_elsewhere') return 'reread';
  return 'unknown';
}
