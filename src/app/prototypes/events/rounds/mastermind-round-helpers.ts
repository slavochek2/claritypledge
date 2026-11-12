/**
 * @file mastermind-round-helpers.ts
 * @description P1529 §5 and §6: the words and the small rules of the sales mastermind's round screen, apart from any
 * component. Every attendee sentence here is a draft: [FOUNDER DECISION: copy]. The table's lines name roles as the founder asked: owner, peer, observer.
 */
import type { NextVersionOffer, NextVersionResult } from '@/app/data/event-mastermind-service';
import type { RoundSeat } from '@/app/data/event-rounds-service';

/** The seat roles the mastermind reuses (§5): `first` is the Clarity Canvas owner, `second` their peer. */
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

const ROLE_ORDER: Record<RoundSeat['role'], number> = { first: 0, second: 1, observer: 2 };

/** The table's seats as faces: the viewer first (the face row leads with You), then the others in role order. */
export function tableFaces(table: RoundSeat[], mineId: string): Array<{ seat: RoundSeat; you: boolean; role: MastermindRole }> {
  return table
    .map((seat, i) => ({ seat, i }))
    .sort((a, b) => Number(b.seat.id === mineId) - Number(a.seat.id === mineId) || ROLE_ORDER[a.seat.role] - ROLE_ORDER[b.seat.role] || a.i - b.i)
    .map(({ seat }) => ({ seat, you: seat.id === mineId, role: MASTERMIND_ROLE[seat.role] }));
}

/** [FOUNDER DECISION: copy] Each role in a sentence ("You're the …") and as the muted word beside a name. */
export const ROLE_WORD: Record<MastermindRole, string> = { owner: 'Clarity Canvas owner', partner: 'peer', observer: 'observer' };
/** [FOUNDER DECISION: copy] The (i) popover under each role pill (the table-ux.md copy). */
export const ROLE_EXPLAINER: Record<MastermindRole, string> = {
  owner: 'Your peer explains your canvas back. At 8 or more, they can challenge it.',
  partner: 'You explain the owner\u2019s canvas back. You challenge only at 8 or more.',
  observer: 'You keep the listener in their role and the talking time balanced, with a bell. At the end you suggest what to do better.',
};

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
 * [FOUNDER DECISION: copy, proposed] The card's words. `label` is the round's label (roundLabel, D12 wording); `partner` the peer's first
 * name, or null when the table had none.
 */
export const taskTitle = (label: string, partner: string | null): string => (partner ? `${label} with ${partner}: transcript ready` : `${label}: transcript ready`);
export const TASK_MAKE_BODY = 'Make your next version from what was said.';
export const TASK_WORKING = 'Making your next version\u2026';
export const TASK_FAILED = 'Could not make your next version.';
const roundWith = (label: string, partner: string | null): string => (partner ? `${label} with ${partner}` : label);
export const wordsPreparing = (label: string, partner: string | null = null): string => `${roundWith(label, partner)}: the transcript is on its way. Usually 1 to 3 minutes.`;
export const wordsMissing = (label: string): string => `The words from ${label} did not arrive. Your canvas stays as it is.`;
export const nothingToAdd = (label: string, partner: string | null): string => `${roundWith(label, partner)}: nothing to add. What was said didn\u2019t change your canvas.`;
export const publishedLine = (seq: number | null): string => (seq ? `Version ${seq} is published.` : 'Your next version is published.');

/** `face`: the task face that already says this, so the note is not shown twice once the state is re-read. */
export interface TaskNote { kind: 'info' | 'error' | 'nothing_new'; text: string; face?: TaskFace }

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
  no_changes: 'Nothing to add. What was said didn\u2019t change your canvas.', // shown as the calm "nothing to add" state, never as an error
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

/** First names of the people the instruction speaks of (any may be the fallback name). */
export interface TableNames { owner: string; partner: string }

const ZERO_TO_TEN = 'from 0 to 10';
const READ_LINE = (owner: string) => `Read ${owner}\u2019s canvas quietly. Set your position on each point, especially where you disagree.`;

/**
 * [FOUNDER DECISION: copy, approved] The instruction for my role in the current part, as numbered steps (one entry = one plain line; two = steps 1, 2).
 * Names are the first names at the table. Null while finding the table (the header says it) and once the time is up, and for the owner and the peer in the observer's part (they just listen).
 */
export function instructionLine(role: MastermindRole, phase: CardPhase, n: TableNames): string[] | null {
  const own = role === 'owner';
  switch (phase) {
    case 'reading': return [own ? 'Check your canvas: set your position on every point if not already.' : READ_LINE(n.owner)];
    case 'first':
    case 'second':
      if (role === 'observer') return ['Make sure the listener stays in their role: no disagreeing, no own point of view yet. Keep talking time balanced: no more than 1 minute per person. Ring the bell to remind people of their roles and the time.'];
      return own
        ? [
          `${n.partner} explains your canvas back. Then ask: \u201CHow well do you think you understand my canvas, ${ZERO_TO_TEN}?\u201D`,
          `At 8 or more, ${n.partner} challenges your canvas. They ask you: \u201CHow well do you think you understand my challenge, ${ZERO_TO_TEN}?\u201D`,
        ]
        : [
          `Explain ${n.owner}\u2019s canvas back in your own words. Then answer: how well you think you understand their canvas, ${ZERO_TO_TEN}.`,
          `At 8 or more, challenge their canvas: explain where and why you disagree with their points. Then ask ${n.owner}: \u201CHow well do you think you understand my challenge, ${ZERO_TO_TEN}?\u201D`,
        ];
    case 'observer':
      return role === 'observer'
        ? [`Say what they can do better. If you like, say how well you think you understood the canvas, ${ZERO_TO_TEN}, and what was unclear.`]
        : null;
    default: return null;
  }
}

/** The canvas button: always offered (primary), except to the observer in their own part. */
export function canvasOffer(role: MastermindRole, phase: CardPhase): 'primary' | 'none' {
  return phase === 'observer' && role === 'observer' ? 'none' : 'primary';
}

/** [FOUNDER DECISION: copy, proposed] A table whose Clarity Canvas owner has no canvas (founder (b): roles stay as usual). */
export const NO_CANVAS_OWNER_LINE = 'No Clarity Canvas yet: talk about your business idea';
export const NO_CANVAS_TABLE_LINE = 'Talk it through: no canvas';
/** [FOUNDER DECISION: copy, proposed] The owner's reading part when no point changed since their last version (or none lacks a position). */

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

/** What the reading part lists. The owner: every point they hold no position on yet (founder, UAT 2026-11-12: "Check your canvas:
 *  set your position on every point if not already"). A reader: every point. `previous` is no longer used for the owner. */
export function readingPoints<T extends { id: string; statement: string }>(args: {
  isOwner: boolean;
  points: readonly T[];
  previous: readonly { statement: string }[] | null;
  ownerPositionOf: (pointId: string) => string | null;
}): T[] {
  if (!args.isOwner) return [...args.points];
  return args.points.filter(p => !args.ownerPositionOf(p.id));
}
