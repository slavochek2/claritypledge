/**
 * @file table-round-helpers.ts
 * @description P1529: pure rules for a canvas opened from the event room's table. (1) What the host's last move on the rounds was (a round ended, a new one started),
 * read between two polls. (2) Who the table's counterpart is, the person the canvas opens in Compare with.
 */
import type { EventRoundsState } from '@/app/data/event-rounds-service';
import type { CanvasPerson } from '@/app/components/canvas/canvas-page-data';
import type { EventRoomMember } from '@/app/types';

/** The newest round, as far as a change needs it. */
export interface RoundMark { id: string; no: number; ended: boolean }
export interface RoundChange { kind: 'ended' | 'started'; roundNo: number }

export function roundMarkOf(state: EventRoundsState): RoundMark | null {
  const last = state.rounds[state.rounds.length - 1];
  return last ? { id: last.id, no: last.roundNo, ended: !!last.endedAt } : null;
}

/**
 * What changed between two reads of the newest round: the same round now ended, or a new round (started: still on; ended: it came and went between two polls).
 * Null for no change and for a Reopen.
 */
export function roundChange(prev: RoundMark | null, next: RoundMark | null): RoundChange | null {
  if (!next) return null;
  // No round before a LOADED baseline: the first round starting is "Round 1 started" (only the hook's very first read is a silent baseline, which never gets here).
  if (!prev) return { kind: next.ended ? 'ended' : 'started', roundNo: next.no };
  if (prev.id === next.id) return !prev.ended && next.ended ? { kind: 'ended', roundNo: next.no } : null;
  return { kind: next.ended ? 'ended' : 'started', roundNo: next.no };
}

/** [FOUNDER DECISION: copy, proposed] The bar's first sentence. */
export function roundChangeLine(c: RoundChange): string {
  return `Round ${c.roundNo} ${c.kind}.`;
}

/**
 * The person at the viewer's table to compare with: the canvas owner when the viewer is not the owner, the partner (the second speaker, else any other
 * non-observer, else anyone else seated) when the viewer IS the owner. Null when the viewer is not seated in the newest round or the roster does not know them.
 */
export function tableCounterpart(args: { state: EventRoundsState; roster: readonly EventRoomMember[]; viewerId: string | undefined; canvasOwnerId: string | undefined }): CanvasPerson | null {
  const { state, roster, viewerId, canvasOwnerId } = args;
  const round = state.rounds[state.rounds.length - 1];
  if (!round || !viewerId || !canvasOwnerId) return null;
  const seats = state.seatsByRound.get(round.id) ?? [];
  const profileOf = (seatId: string) => roster.find(m => m.id === seatId)?.profileId ?? null;
  const mine = seats.find(s => profileOf(s.id) === viewerId);
  if (!mine) return null;
  let id: string | null = canvasOwnerId;
  let name = roster.find(m => m.profileId === canvasOwnerId)?.displayName ?? '';
  if (viewerId === canvasOwnerId) {
    const mates = seats.filter(s => s.table === mine.table && s.id !== mine.id);
    const partner = mates.find(s => s.role === 'second') ?? mates.find(s => s.role !== 'observer') ?? mates[0];
    id = partner ? profileOf(partner.id) : null;
    name = partner ? roster.find(m => m.id === partner.id)?.displayName ?? '' : '';
  }
  return id && id !== viewerId ? { id, name: name || 'Partner', hasPledged: false, count: 0 } : null;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'file', 'image', 'color']);

/**
 * The page is busy with the person: an open modal dialog (its text lives only in the dialog's state), or a text field with focus. The countdown never moves
 * the page then; the bar offers the link instead.
 */
export function pageIsBusy(doc: Document = document): boolean {
  if (doc.querySelector('[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"]), [aria-modal="true"]')) return true;
  const el = doc.activeElement;
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && !!el.isContentEditable;
}
