/**
 * P1536: the thread reply of a run that drafted something, and the offers it adds, from what the run reported. Pure: no Deno or esm.sh imports.
 *
 * Every line the owner reads here is the engine's, from fixed words and the model's reported facts (the focus, a reason from a fixed list,
 * the other groups): the model's own sentences never reach the reply except the quoted note.
 */

import type { CanvasRun, RunKind } from './canvas-run.ts';
import { buildDraftReply } from './canvas-reply.ts';
import type { DraftOutcome, OtherCanvas } from './canvas-types.ts';

type Parsed = Extract<DraftOutcome, { ok: true }>;

/** The most offers a draft holds open at once (the database's own rule, `_canvas_draft_run_complete`). */
const MAX_OPEN_OFFERS = 3;

/** The offers this run will add: the database keeps at most 3 open, so neither the write nor the reply carries a row it will not write. */
export function offersToAdd(run: Pick<CanvasRun, 'offers'>, out: Pick<Parsed, 'otherCanvases'>): OtherCanvas[] {
  const open = (run.offers ?? []).filter((o) => o.state === 'offered').length;
  return out.otherCanvases.slice(0, Math.max(0, MAX_OPEN_OFFERS - open));
}

/**
 * The reply: "Draft ready", "Updated" or "Nothing changed on the canvas.", led by the found-line of a first draft (J7, J8).
 *
 * J9 ("Your new file is also about A. This canvas stays about F.") is NOT built here: the database writes it from the offers it actually inserted and the
 * focus in force, on every path (scoped or empty scope), so the line can never name a group the merge dropped or reworded (Gemini 1).
 * A fork's first draft carries no found-line either: the owner chose its group, so there is nothing "found" and no reason to give (Gemini 4); the other groups
 * the run reports still go to the write as offers.
 */
export function draftReplyOf(run: CanvasRun, kind: RunKind, out: Parsed, others: readonly OtherCanvas[], extra: { truncated: boolean; unreadable: string[] }): string {
  const first = run.first_draft === true && kind !== 'fork_first';
  return buildDraftReply({
    outcome: !out.changedBoxes.length ? 'unchanged' : run.first_draft === true || kind === 'fork_first' ? 'draft' : 'updated',
    total: out.total, filledBoxes: 9 - out.emptyBoxes.length, changedBoxes: out.changedBoxes, note: out.note,
    focus: out.focus ?? run.focus ?? null, focusReason: first ? out.focusReason : null, others: first ? others.map((o) => o.group) : [],
    truncated: extra.truncated, unreadable: extra.unreadable, guessed: out.guessed, droppedUnverified: out.droppedUnverified, droppedPoints: out.droppedPoints, droppedNames: out.droppedNames,
  });
}
