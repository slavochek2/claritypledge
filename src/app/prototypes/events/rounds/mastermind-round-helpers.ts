/**
 * @file mastermind-round-helpers.ts
 * @description P1529 §5 and §6: the words and the small rules of the sales mastermind's round screen, apart from any
 * component. Every attendee sentence here is a draft: [FOUNDER DECISION: copy]. Attendee copy says "Clarity Canvas owner",
 * "their partner" and "observer", never a bare "owner" or "reader" (D12).
 */
import type { CanvasUpdateStep, MyUpdateState, NextVersionOffer, NextVersionResult } from '@/app/data/event-mastermind-service';
import type { RoundSeat } from '@/app/data/event-rounds-service';

/** The seat roles the mastermind reuses (§5): `first` is the Clarity Canvas owner, `second` their partner. */
export type MastermindRole = 'owner' | 'partner' | 'observer';

export const MASTERMIND_ROLE: Record<RoundSeat['role'], MastermindRole> = { first: 'owner', second: 'partner', observer: 'observer' };

/** Everyone at the caller's table, by what they are. */
export interface MastermindTable {
  role: MastermindRole;
  owner: RoundSeat | undefined;
  partner: RoundSeat | undefined;
  observers: RoundSeat[];
  /** Everyone at the table except the caller. */
  others: RoundSeat[];
}

export function mastermindTable(table: RoundSeat[], mine: RoundSeat): MastermindTable {
  return {
    role: MASTERMIND_ROLE[mine.role],
    owner: table.find(s => s.role === 'first'),
    partner: table.find(s => s.role === 'second'),
    observers: table.filter(s => s.role === 'observer'),
    others: table.filter(s => s.id !== mine.id),
  };
}

/** D3, §5: who they are and whose canvas the table is about. */
export function roleLine(role: MastermindRole, ownerName: string, partnerName: string): string {
  if (role === 'owner') return partnerName ? `You're the Clarity Canvas owner: ${partnerName} is your partner` : "You're the Clarity Canvas owner";
  if (role === 'partner') return `You're ${ownerName}'s partner`;
  return partnerName ? `You're observing ${ownerName}'s Clarity Canvas with ${partnerName}` : `You're observing ${ownerName}'s Clarity Canvas`;
}

/** D3, D19: one line per role. The lower number decides; above 8 the partner may challenge. The app asks for nothing. */
export const RULE_LINE: Record<MastermindRole, string> = {
  owner: 'Say your number out loud. The lower number between you and your partner decides; above 8 your partner may challenge.',
  partner: 'Explain it back, then say your number out loud. The lower number decides; above 8 you may challenge.',
  observer: 'Keep the pair to the rules: the lower number decides, and above 8 the partner may challenge. Give your feedback at the end.',
};

/** §5: only the people the card names; the faces are the lanyard card's job. */
export const withLine = (names: string[]): string => (names.length ? `With ${names.join(', ')}` : '');

/** The host's canvas-update step is on while its round is still the newest and that round has ended. */
export function updateStepOn(step: CanvasUpdateStep | null, rounds: ReadonlyArray<{ id: string; endedAt: string | null }>): boolean {
  const last = rounds[rounds.length - 1];
  return !!step && !!last && !!last.endedAt && step.afterRoundId === last.id;
}

/** What the owner's task shows. `make` and `pending` both carry the Make button; `pending` adds the "still arriving" sentence. */
export type TaskFace =
  | 'drafting' | 'ready' | 'failed' | 'published'
  | 'make' | 'pending' | 'no_recording' | 'no_canvas' | 'draft_open';

/** Which face (if any) the Clarity Canvas owner's task has, from the two server reads. Pure. */
export function taskFace(offer: NextVersionOffer | null, update: MyUpdateState | null): TaskFace | null {
  const u = update?.state;
  if (u === 'drafting' || u === 'ready' || u === 'failed') return u;
  // A published version this evening is the end of the task: the button does not come back (a second draft is the
  // owner's own choice, in their workspace).
  if (u === 'published') return 'published';
  switch (offer?.state) {
    case 'offer': return 'make';
    case 'transcript_pending': return 'pending';
    case 'no_recording': return 'no_recording';
    case 'no_canvas': return 'no_canvas';
    case 'draft_open': return 'draft_open';
    case 'started': return 'drafting';
    default: return null;
  }
}

/** True while a read of either state can still change by itself: drafting, the round's clock running, the words arriving. */
export const offerCanChange = (offer: NextVersionOffer | null): boolean =>
  !offer || offer.state === 'round_on' || offer.state === 'transcript_pending';
export const updateCanChange = (update: MyUpdateState | null): boolean => update?.state === 'drafting';

/** The one quiet line the task shrinks to while the person is seated in a round. */
export const COLLAPSED_LINE: Record<TaskFace, string> = {
  drafting: 'Your next version: being drafted',
  ready: 'Your next version: ready to publish',
  failed: 'Your next version: did not work',
  published: 'Your next version: published',
  make: 'Your next version: you can make it now',
  pending: 'Your next version: the words are still arriving',
  no_recording: 'No recording from your last round',
  no_canvas: 'Your next version: no Clarity Canvas shared',
  draft_open: 'Your next version: a draft is already open',
};

/** `face`: the task face that already says this, so the note is not shown twice once the state is re-read. */
export interface TaskNote { kind: 'info' | 'error'; text: string; face?: TaskFace }

const REFUSED: Record<string, string> = {
  demo_round: 'A Demo round does not make a next version.',
  round_still_on: 'Your round is still on. Try again when its clock is over.',
  next_owning_round_started: 'Your next round has started, so this version can no longer be made.',
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
    case 'transcript_pending': return { kind: 'info', text: 'The words from this round are still arriving. Try again in a moment.', face: 'pending' };
    case 'no_recording': return { kind: 'info', text: 'No recording from this round', face: 'no_recording' };
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
