/**
 * @file canvas-new-card-model.ts
 * @description P1621: what the new-card editor shows, decided from its buffer, the box's card count and whether the agent is working. Pure, so the rules (when a full-box sentence is
 * still true, when Save is absent) sit in one place and the component only draws.
 */
import { CANVAS_BOX_CARD_LIMIT } from '@/lib/canvas-boxes';
import { FULL_BOX_TEXT } from './canvas-new-card-copy';
import { EMPTY_POINT_TEXT, FAILED_POINT_TEXT, RUN_GOING_TEXT } from './canvas-point-edit';
import type { NewCardEntry } from './canvas-new-card-store';

export interface NewCardView {
  /** a box_full sentence the box has since outgrown (the draft has moved on from the revision the server said it at, and the box has room): to be cleared, text kept */
  staleFull: boolean;
  /** the box holds all it can: no Save */
  full: boolean;
  /** the agent is working and no save is in flight: no Save, and the reason is shown */
  running: boolean;
  /** the sentence under the text, or null */
  notice: string | null;
  isError: boolean;
}

export function newCardView(entry: NewCardEntry, count: number, runActive: boolean, revision: number): NewCardView {
  const refusedFull = entry.problem === FULL_BOX_TEXT;
  const staleFull = refusedFull && count < CANVAS_BOX_CARD_LIMIT && entry.fullAtRevision !== null && revision > entry.fullAtRevision;
  const full = count >= CANVAS_BOX_CARD_LIMIT || (refusedFull && !staleFull);
  const running = runActive && !entry.saving;
  const problem = staleFull ? null : entry.problem;
  const notice = full ? FULL_BOX_TEXT : running ? RUN_GOING_TEXT : problem;
  return { staleFull, full, running, notice, isError: notice === EMPTY_POINT_TEXT || notice === FAILED_POINT_TEXT };
}
