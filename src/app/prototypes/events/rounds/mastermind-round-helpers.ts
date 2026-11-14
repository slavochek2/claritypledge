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
  | 'no_recording' | 'not_understood' | 'no_canvas' | 'draft_open';

/**
 * Which face (if any) the round card has, from the server's current offer. Pure. A finished draft is always `ready` (the owner publishes it in the workspace).
 */
export function taskFace(offer: NextVersionOffer | null): TaskFace | null {
  switch (offer?.state) {
    case 'offer': return 'make';
    case 'transcript_pending': return 'pending';
    case 'transcript_missing': return 'missing';
    case 'drafting': return 'creating';
    case 'ready': return 'ready';
    case 'failed': return 'failed';
    case 'published': return 'published';
    case 'no_recording': return 'no_recording';
    case 'not_understood': return 'not_understood';
    case 'no_canvas': return 'no_canvas';
    case 'draft_open': return 'draft_open';
    default: return null;
  }
}

/** [FOUNDER DECISION: copy, proposed] The heading of Table once the host ended the evening (H3). */
export const EVENING_OVER = 'The evening is over';

/** H3: a next-version card is WAITING for the person (something to make, being made, or to try again): Feedback links to it. A published, missing or empty offer is not waiting. */
export const nextVersionWaiting = (face: TaskFace | null): boolean => face === 'make' || face === 'pending' || face === 'creating' || face === 'ready' || face === 'failed';

/** True while a read of the offer can still change by itself: the words arriving, a draft being written. */
export const offerCanChange = (offer: NextVersionOffer | null): boolean =>
  !offer || offer.state === 'transcript_pending' || offer.state === 'drafting';

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
/** INBOX-338: the round's audio was transcribed and every part came back empty (quiet audio). [FOUNDER DECISION: copy, founder's words 2026-11-13] */
export const WORDS_NOT_UNDERSTOOD = "We couldn't make out what was said in this round";
export const publishedLine = (seq: number | null): string => (seq ? `Version ${seq} is published.` : 'Your next version is published.');

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
export const RETRY_REFUSED: Record<string, string> = {
  busy: 'Your mirror is busy. Try again in a moment.',
  cap_reached: 'You have used all the mirror runs this Clarity Canvas allows.',
  stale_view: 'The draft just changed. Look at it again, then try again.',
  not_retryable: 'This run cannot be tried again. Open your draft to continue.',
  expired: 'This draft has expired. Open your drafts to continue.',
};

/** [FOUNDER DECISION: copy, proposed] A table whose Clarity Canvas owner has no canvas (founder (b): roles stay as usual). */
export const NO_CANVAS_OWNER_LINE = 'No Clarity Canvas yet: talk about your business idea';
export const NO_CANVAS_TABLE_LINE = 'Talk it through: no canvas';

// ── The round card: every step of my role, always visible (UAT 2026-11-13 (b), F2) ──────────────────────────────────

/** The part of the round as the card tells them apart: the clock's own phase names (round-clock.ts). A mastermind round has `first` (Talk) and `observer`. */
export type CardPhase = 'seating' | 'reading' | 'first' | 'second' | 'observer' | 'over';

/** First names of the people the instruction speaks of (any may be the fallback name). */
export interface TableNames { owner: string; partner: string }

/** One numbered step of my role; `current` marks the steps of the part running now. */
export interface RoleStep { text: string; current: boolean }

const ZERO_TO_TEN = 'from 0 to 10';

/**
 * [FOUNDER DECISION: copy, proposed] Every step of my role, in order, numbered by the list. The steps of the current part are `current`: The owner and the peer have three steps (in the Observer part none is highlighted); Talk
 * highlights the observer's steps 1 and 2 and the Observer part highlights their last step. Names are first
 * names at the table. `noCanvas`: the owner has no canvas, so the steps that name a canvas are replaced by the talk-it-through line
 * (the observer's steps do not name a canvas to open, so only "Open ... canvas" goes).
 */
export function roleSteps(role: MastermindRole, phase: CardPhase, n: TableNames, noCanvas = false): RoleStep[] {
  const talk = phase !== 'observer' && phase !== 'over';
  const obs = phase === 'observer';
  const build = (lines: string[], talkCount: number): RoleStep[] => lines.map((text, i) => ({ text, current: i < talkCount ? talk : obs }));
  const all = role === 'owner'
    ? build([
      `Open your canvas so you see what ${n.partner} sees.`,
      `${n.partner} explains your canvas back. Then ask: \u201CHow well do you think you understand my canvas, ${ZERO_TO_TEN}?\u201D`,
      `At 8 or more, ${n.partner} challenges your canvas. They ask you: \u201CHow well do you think you understand my challenge, ${ZERO_TO_TEN}?\u201D`,
    ], 3)
    : role === 'partner'
      ? build([
        `Open ${n.owner}\u2019s canvas and go through it point by point. Set your position, especially where you disagree. Out loud is fine.`,
        `Explain ${n.owner}\u2019s canvas back in your own words. Then answer: how well you think you understand their canvas, ${ZERO_TO_TEN}.`,
        `At 8 or more, challenge their canvas: explain where and why you disagree with their points. Then ask ${n.owner}: \u201CHow well do you think you understand my challenge, ${ZERO_TO_TEN}?\u201D`,
      ], 3)
      : build([
        `Open ${n.owner}\u2019s canvas.`,
        'Make sure the listener stays in their role: no disagreeing, no own point of view yet. Keep talking time balanced: no more than 1 minute per person. Ring the bell to remind people of their roles and the time.',
        `Observer part: say what they can do better. If you like, say how well you think you understood the canvas, ${ZERO_TO_TEN}, and what was unclear.`,
      ], 2);
  if (!noCanvas) return all;
  // No canvas at the table: the talk-it-through line, then only the steps that do not name a canvas. The observer still gives
  // feedback, so their last step stays, about "the idea" instead of "the canvas".
  const kept = all.filter(st => !/canvas/i.test(st.text));
  const last = all[all.length - 1];
  if (role === 'observer' && last) kept.push({ text: last.text.replace('the canvas', 'the idea'), current: obs });
  return [{ text: role === 'owner' ? NO_CANVAS_OWNER_LINE : NO_CANVAS_TABLE_LINE, current: talk }, ...kept];
}

/** The canvas button: always offered (primary), except to the observer in their own part. */
export function canvasOffer(role: MastermindRole, phase: CardPhase): 'primary' | 'none' {
  return phase === 'observer' && role === 'observer' ? 'none' : 'primary';
}

