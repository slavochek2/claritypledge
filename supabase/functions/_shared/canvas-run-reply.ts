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

/** The reply: "Draft ready", "Updated" or "No box changed", led by the found-line (a first draft, J7, J8) or the also-about line (J9). */
export function draftReplyOf(run: CanvasRun, kind: RunKind, out: Parsed, others: readonly OtherCanvas[], extra: { truncated: boolean; unreadable: string[] }): string {
  const first = run.first_draft === true || kind === 'fork_first';
  const groups = others.map((o) => o.group);
  return buildDraftReply({
    outcome: !out.changedBoxes.length ? 'unchanged' : first ? 'draft' : 'updated',
    total: out.total, filledBoxes: 9 - out.emptyBoxes.length, changedBoxes: out.changedBoxes, note: out.note,
    focus: out.focus ?? run.focus ?? null, focusReason: first ? out.focusReason : null, others: first ? groups : [],
    // J9: a later message or upload about another business. Built here from what the model reports, never left to the model to write.
    // an empty-scope upload persists its offers too (J9), but the DATABASE writes its line, from the offers it inserted: this reply never does
    alsoAbout: !first && kind === 'message' && out.scope.length > 0 && groups.length ? { groups, input: run.input_kind ?? 'text', focus: run.focus ?? null } : undefined,
    truncated: extra.truncated, unreadable: extra.unreadable, droppedUnverified: out.droppedUnverified, droppedNames: out.droppedNames,
  });
}
