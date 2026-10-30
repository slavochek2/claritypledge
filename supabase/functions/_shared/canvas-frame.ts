/**
 * P1536: what one run is (its kind, tags, focus, the boxes it rebuilds) and the scope that follows from it. Pure: no Deno or esm.sh imports.
 */

import { BOX_TAGS, CUSTOMER_BOX_TAGS } from './canvas-draft.ts';
import type { CanvasRun, RunKind } from './canvas-run.ts';
import type { RunFrame } from './canvas-types.ts';

/** What this run is, for the prompt and the scope. */
export function frameOf(run: CanvasRun, kind: RunKind): RunFrame {
  return {
    kind,
    firstDraft: run.first_draft === true,
    taggedBoxes: run.box_refs?.length ? run.box_refs.filter((t) => BOX_TAGS.has(t)) : null,
    focus: run.focus ?? null,
    targetGroup: run.target_group ?? null,
    rebuild: kind === 'focus' ? CUSTOMER_BOX_TAGS : [],
  };
}

/** Fixed scope for a run that has one; the model names the boxes of an untagged message. */
export function scopeOf(frame: RunFrame): { mode: 'fixed'; boxes: readonly string[] } | { mode: 'model' } {
  if (frame.kind !== 'message' || frame.firstDraft) return { mode: 'fixed', boxes: [...BOX_TAGS] };
  if (frame.taggedBoxes) return { mode: 'fixed', boxes: frame.taggedBoxes };
  return { mode: 'model' };
}

