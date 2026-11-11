/**
 * @file mastermind-round-helpers.ts
 * @description P1529 §5 and §6: the words and the small rules of the sales mastermind's round screen, apart from any
 * component. Every attendee sentence here is a draft: [FOUNDER DECISION: copy]. The table's lines name roles as the founder asked: owner, partner, observer.
 */
import type { NextVersionOffer, NextVersionResult } from '@/app/data/event-mastermind-service';
import type { RoundSeat } from '@/app/data/event-rounds-service';

/** The seat roles the mastermind reuses (§5): `first` is the Clarity Canvas owner, `second` their partner. */
export type MastermindRole = 'owner' | 'partner' | 'observer';

export const MASTERMIND_ROLE: Record<RoundSeat['role'], MastermindRole> = { first: 'owner', second: 'partner', observer: 'observer' };

/** What the viewer is at their table, and who owns the Clarity Canvas the table discusses. */
export interface MastermindTable {
  role: MastermindRole;
  owner: RoundSeat | undefined;
}

export function mastermindTable(table: RoundSeat[], mine: RoundSeat): MastermindTable {
  return { role: MASTERMIND_ROLE[mine.role], owner: table.find(s => s.role === 'first') };
}

const ROLE_WORD: Record<MastermindRole, string> = { owner: 'owner', partner: 'partner', observer: 'observer' };
const ROLE_ORDER: Record<RoundSeat['role'], number> = { first: 0, second: 1, observer: 2 };

/** One line per person at the table, in role order: "Chiara: owner". The viewer's own line says You. [FOUNDER DECISION: copy] */
export function tableLines(table: RoundSeat[], mineId: string, nameOf: (id: string) => string): Array<{ id: string; text: string }> {
  return table
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ROLE_ORDER[a.s.role] - ROLE_ORDER[b.s.role] || a.i - b.i)
    .map(({ s }) => ({ id: s.id, text: `${s.id === mineId ? 'You' : nameOf(s.id)}: ${ROLE_WORD[MASTERMIND_ROLE[s.role]]}` }));
}

/** The name shown when the roster has none for a seat (the host's screens say the same). */
export const MISSING_NAME = 'Someone';

/**
 * How often a screen reads what can change while no round runs (the evening's end stamp):
 * only while the newest round has ended, the evening is not over, and the tab is visible. 3600 / 8 = 450 requests an hour per
 * screen in that window, 0 outside it (spec Cost Budget).
 */
export const GAP_POLL_MS = 8000;

/**
 * The host's "End the evening" stamp (see getEveningEnd) is at or after the newest round's start. A Reopen starts a newer round, so an
 * older stamp never ends it. A round that ended without this stamp is "between rounds".
 */
export function eveningEndedAfter(eveningEndedAt: string | null, rounds: ReadonlyArray<{ startedAt: string }>): boolean {
  const last = rounds[rounds.length - 1];
  return !!eveningEndedAt && !!last && new Date(eveningEndedAt).getTime() >= new Date(last.startedAt).getTime();
}

/** What a person who is not seated reads while no round is on (before round 1, between rounds, or while a round runs without them). [FOUNDER DECISION: copy, proposed] */
export function waitingWords(args: { runningLabel: string | null; showcase: boolean; betweenLabel: string | null; nextLabel: string }): { title: string; body: string } {
  if (args.runningLabel !== null) {
    return args.showcase
      ? { title: 'Demo · You watch', body: 'Your table appears here when the next round starts.' }
      : { title: `${args.runningLabel} · You join the next round`, body: 'Your table appears here when the next round starts.' };
  }
  if (args.betweenLabel !== null) return { title: `${args.betweenLabel} is over`, body: 'The next round starts soon.' };
  return { title: `${args.nextLabel} starts soon`, body: 'The host starts it. Your table and role appear here.' };
}

/** What the owner's round card shows. `make` has the two taps; the rest are states of one round's offer. */
export type TaskFace =
  | 'make' | 'pending' | 'missing' | 'creating' | 'ready' | 'failed' | 'published'
  | 'no_recording' | 'no_canvas' | 'draft_open';

/**
 * Which face (if any) the round card has, from the server's current offer. Pure. `publishFailed`: the one-tap chain's publish was
 * refused, so a finished draft shows "Try again" instead of the creating state.
 */
export function taskFace(offer: NextVersionOffer | null, publishFailed = false): TaskFace | null {
  switch (offer?.state) {
    case 'offer': return 'make';
    case 'transcript_pending': return 'pending';
    case 'transcript_missing': return 'missing';
    case 'drafting': return 'creating';
    // A finished draft of a one-tap round is being published by the chain; a "Preview first" draft waits for the owner.
    case 'ready': return offer.autoPublish && !publishFailed ? 'creating' : 'ready';
    case 'failed': return 'failed';
    case 'published': return 'published';
    case 'no_recording': return 'no_recording';
    case 'no_canvas': return 'no_canvas';
    case 'draft_open': return 'draft_open';
    default: return null;
  }
}

/** True while a read of the offer can still change by itself: the words arriving, a draft being written or published. */
export const offerCanChange = (offer: NextVersionOffer | null): boolean =>
  !offer || offer.state === 'transcript_pending' || offer.state === 'drafting' || (offer.state === 'ready' && offer.autoPublish);

/**
 * [FOUNDER DECISION: copy, proposed] The card's words. `label` is the round's label (roundLabel, D12 wording); `partner` the partner's first
 * name, or null when the table had none.
 */
export const taskTitle = (label: string, partner: string | null): string => (partner ? `${label} with ${partner}: words ready` : `${label}: words ready`);
export const wordsPreparing = (label: string): string => `The words from ${label} are being prepared (about 2 minutes)`;
export const wordsMissing = (label: string): string => `The words from ${label} did not arrive. Your canvas stays as it is.`;

/** `face`: the task face that already says this, so the note is not shown twice once the state is re-read. */
export interface TaskNote { kind: 'info' | 'error'; text: string; face?: TaskFace }

const REFUSED: Record<string, string> = {
  demo_round: 'A Demo round does not make a next version.',
  round_still_on: 'Your round is still on. Try again when the host has ended it.',
  round_already_used: 'This round already made its next version.',
  draft_already_open: 'You already have a draft open. Publish it or discard it in your drafts first.',
  cap_reached: 'You have used all the mirror runs this Clarity Canvas allows.',
  busy: 'Your mirror is busy with another run. Try again in a moment.',
  busy_elsewhere: 'Your mirror is busy with another run. Try again in a moment.',
};
const GENERIC = 'Your next version could not be made. Try again in a moment.';

/** A sentence for every answer of "Make my next version" that is not a clean start. Null: nothing to say. */
export function nextVersionNote(result: NextVersionResult): TaskNote | null {
  switch (result.status) {
    case 'started':
      return result.start && !result.start.ok
        ? { kind: 'error', text: 'Your mirror could not start the draft. If it does not begin, it will offer Try again.' }
        : null;
    case 'transcript_pending': return { kind: 'info', text: 'The words are still being prepared (about 2 minutes)', face: 'pending' };
    case 'no_recording': return { kind: 'info', text: 'No recording from this round', face: 'no_recording' };
    case 'published': return null;
    case 'no_canvas': return { kind: 'error', text: 'You have no Clarity Canvas shared with this event, so there is nothing to update.', face: 'no_canvas' };
    case 'refused': return { kind: 'error', text: REFUSED[result.code] ?? GENERIC };
  }
}

export const NOTE_FAILED = GENERIC;
export const PUBLISH_REFUSED: Record<string, string> = {
  stale_view: 'The draft just changed. Look at it again, then publish.',
  busy: 'Your mirror is still working on it. Try again in a moment.',
  draft_empty: 'There is nothing to publish yet.',
  no_changes: 'Nothing is different from your current version, so there is nothing new to publish.',
};
export const RETRY_REFUSED: Record<string, string> = {
  busy: 'Your mirror is busy. Try again in a moment.',
  cap_reached: 'You have used all the mirror runs this Clarity Canvas allows.',
  stale_view: 'The draft just changed. Look at it again, then try again.',
  not_retryable: 'This run cannot be tried again. Open your draft to continue.',
  expired: 'This draft has expired. Open your drafts to continue.',
};

// ── The round card per phase (UAT 2026-11-11, items 1, 4, 5, 6) ─────────────────────────────────────────────────────

/** The part of the round as the card tells them apart: the clock's own phase names (round-clock.ts). */
export type CardPhase = 'seating' | 'reading' | 'first' | 'second' | 'observer' | 'over';

/**
 * [FOUNDER DECISION: copy, proposed] The observer's one line per part of the round. The owner and the partner never see these.
 * `partner` and `owner` are first names. Null where the observer has nothing to do yet (finding the table) or any more.
 */
export function observerLine(phase: CardPhase, partner: string, owner: string): string | null {
  if (phase === 'reading') return 'Silent reading. No talking yet.';
  if (phase === 'first' || phase === 'second') {
    return `${partner} explains ${owner}’s Clarity Canvas back to them. ${partner} challenges only once ${owner} rates their understanding 8 out of 10 or higher.`;
  }
  if (phase === 'observer') return 'Your turn: what did you notice?';
  return null;
}

/** [FOUNDER DECISION: copy, proposed] A table whose Clarity Canvas owner has no canvas (founder (b): roles stay as usual). */
export const NO_CANVAS_OWNER_LINE = 'No Clarity Canvas yet: talk about your business idea';
export const NO_CANVAS_TABLE_LINE = 'Talk it through: no canvas';
/** [FOUNDER DECISION: copy, proposed] Under a point the Clarity Canvas owner has not taken a position on, for readers. */
export const NO_OWNER_POSITION_LINE = 'The Clarity Canvas owner hasn’t taken a position yet';
/** [FOUNDER DECISION: copy, proposed] The owner's reading part when no point changed since their last version (or none lacks a position). */
export const OWNER_NOTHING_TO_SET_LINE = 'Nothing changed since your last round. Read your canvas as you like.';
/** [FOUNDER DECISION: copy, proposed] The owner's reading part: what the list is for. */
export const OWNER_SET_POSITIONS_LINE = 'These points changed since your last version. Where do you stand on them?';
/** [FOUNDER DECISION: copy, proposed] A reader's reading part: what the list is for. */
export const READER_SET_POSITIONS_LINE = 'Where do you stand on each point? This is a first impression.';

/** The three taps of a point and the stored position each writes. */
export const POSITION_TAPS = [
  { value: 'agree', label: 'Agree' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'disagree', label: 'Disagree' },
] as const;
export type PositionTap = (typeof POSITION_TAPS)[number]['value'];

/** Which tap a stored position shows as: its side (the seven levels fold to agree, unsure, disagree); null when none. */
export function tapOf(position: string | null | undefined): PositionTap | null {
  if (!position) return null;
  if (position === 'unsure') return 'unsure';
  return position.includes('disagree') ? 'disagree' : position.includes('agree') ? 'agree' : null;
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Points of the current version that the previous published version did not have as they are now (by statement text: a rewritten
 * point is a new point). No previous version (a first version) has nothing to differ from: none changed. Pure.
 */
export function changedPoints<T extends { statement: string }>(current: readonly T[], previous: readonly { statement: string }[] | null): T[] {
  if (!previous) return [];
  const before = new Set(previous.map(p => norm(p.statement)));
  return current.filter(p => !before.has(norm(p.statement)));
}

/** What the reading part lists. The owner: changed points they have no position on. A reader: every point. */
export function readingPoints<T extends { id: string; statement: string }>(args: {
  isOwner: boolean;
  points: readonly T[];
  previous: readonly { statement: string }[] | null;
  ownerPositionOf: (pointId: string) => string | null;
}): T[] {
  if (!args.isOwner) return [...args.points];
  return changedPoints(args.points, args.previous).filter(p => !args.ownerPositionOf(p.id));
}
