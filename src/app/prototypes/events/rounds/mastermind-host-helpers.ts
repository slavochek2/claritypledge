/**
 * @file mastermind-host-helpers.ts
 * @description P1529 §1, §3, §4, §7: the host screen's and the projector's words and small rules for the sales
 * mastermind, apart from any component. Every sentence here is a draft: [FOUNDER DECISION: copy]. Host copy names a
 * Clarity Canvas owner, their partner and an observer (D12), and names people, not "someone".
 */
import type { MastermindPerson, RecordingState } from '@/app/data/event-mastermind-service';
import type { RoundMinutes } from '@/app/data/event-rounds-service';
import type { SeatingProblem } from '@/lib/mastermind-seating-check';
import type { Seat, SeatRole } from '@/lib/round-grouping';
import type { EventFlow } from '../series-recipes';

export const MASTERMIND_FLOW: EventFlow = 'sales-mastermind';

/** [FOUNDER DECISION: copy] The row's label and the three flow names as the host sees them. */
export const FLOW_ROW_LABEL = 'Event flow';
export const FLOW_NAMES: Record<EventFlow, string> = {
  'clarity-night': 'Clarity Night',
  'social-hike': 'Social Hike',
  'sales-mastermind': 'Sales Mastermind',
};

/**
 * One round is about 24 minutes (run-of-show): 2 to find the new partner and table, then one talk part of 22 that holds
 * the 4 minutes of silent reading and the conversation, then 2 of observer feedback. The talk is stored as
 * `speakerS` x 2 (host_start_round writes the same seconds into first_s and second_s; a no-split round adds them), so
 * 660 s is a 22-minute talk. No swap at half time, so no "second" part ever runs.
 */
export const MASTERMIND_MINUTES: RoundMinutes = { seatingS: 120, speakerS: 660, observerS: 120 };
/** A table holds the owner, their partner and at most two observers. host_start_round stores group_size 2..4. */
export const MASTERMIND_GROUP_SIZE = 4;

/** [FOUNDER DECISION: copy] The host grid's columns in this flow (the Clarity Night grid says Speaker 1 and 2). */
export const COLUMN_LABELS: Record<SeatRole, string> = { first: 'Clarity Canvas owner', second: 'Partner', observer: 'Observer' };

/** [FOUNDER DECISION: copy] The one fixed line on the projector (D3, D19). The app never shows a pair's phase. */
export const SCREEN_RULE_LINE = 'Both say a number. The lower one counts. Above 8, the partner may challenge.';
/** [FOUNDER DECISION: copy] The projector while the canvas-update step is on. */
export const SCREEN_UPDATE_TITLE = 'Canvas update';
export const SCREEN_UPDATE_LINE = 'Clarity Canvas owners: publish your next version in the event room.';
/** [FOUNDER DECISION: copy] The part of the round the projector names; the long talk needs no name. */
export const SCREEN_PART_CAPTION: Record<string, string> = { seating: 'Find your table', observer: 'Observer feedback' };

/** The round's silent reading (4 minutes) cannot have words: a table is only said to be silent after it. */
export const SILENT_TABLE_GRACE_MS = 5 * 60_000;

// ── The flow row (§1) ───────────────────────────────────────────────────────────────────────────────────────────────

/** [FOUNDER DECISION: copy] The Undo line after a switch. */
export const flowChangedLine = (flow: EventFlow): string => `Event flow is now ${FLOW_NAMES[flow]}.`;
export const FLOW_UNDO = 'Undo';
/** The server's own words are shown; this only says what failed. */
export const flowRefusedLine = (message: string): string => `The event flow was not changed: ${singular(message)}`;
/** The server's count line says "1 registered people have"; one person is "1 registered person has". */
const singular = (message: string): string => message.replace(/^1 registered people have /, '1 registered person has ');

// ── Observers (§3) ──────────────────────────────────────────────────────────────────────────────────────────────────

/** D5: a person is a participant when their canvas is shared and the host has not said observer. */
export function isObserver(person: MastermindPerson | undefined): boolean {
  return !person || !person.canvasShared || person.observerOverride === true;
}

/** [FOUNDER DECISION: copy] What is missing when the server refuses to make someone a participant. */
export function observerRefusal(person: MastermindPerson | undefined, name: string): string {
  if (person?.canvasName) {
    return `${name} chose a Clarity Canvas but has not published and shared it with this event yet. They can do that in the event room, then you can switch them.`;
  }
  return `${name} has no Clarity Canvas shared with this event yet. They can make and share one in the event room, then you can switch them.`;
}

/** [FOUNDER DECISION: copy] One short line per person under the name. */
export function canvasLine(person: MastermindPerson | undefined): string {
  if (person?.canvasShared) return person.canvasName ? `Clarity Canvas shared: ${person.canvasName}` : 'Clarity Canvas shared';
  if (person?.canvasName) return 'Clarity Canvas chosen, not shared yet';
  return 'No Clarity Canvas yet';
}

// ── Recording (§7) ──────────────────────────────────────────────────────────────────────────────────────────────────

/** [FOUNDER DECISION: copy] */
export const RECORDING_WORDS: Record<RecordingState, string> = {
  off: 'Recording off',
  silent: 'Recording on, no words yet',
  words: 'Words arriving',
};

/** Tables whose seated people have no words arriving, once the round's reading time is over. Sorted table numbers. */
export function silentTables(
  seats: Seat[],
  wordsArriving: (memberId: string) => boolean,
  talkStartedMs: number,
  now: number,
): number[] {
  if (now - talkStartedMs < SILENT_TABLE_GRACE_MS) return [];
  const byTable = new Map<number, boolean>();
  for (const s of seats) byTable.set(s.table, (byTable.get(s.table) ?? false) || wordsArriving(s.id));
  return [...byTable].filter(([, words]) => !words).map(([no]) => no).sort((a, b) => a - b);
}

// ── Seating (§4): every rule the plan could not meet, named ────────────────────────────────────────────────────────

/** [FOUNDER DECISION: copy] One plain sentence per broken rule, with people's names. */
export function describeProblem(p: SeatingProblem, name: (id: string) => string): string {
  switch (p.rule) {
    case 'repeat-partner': return `${name(p.people[0])} and ${name(p.people[1])} have already been partners tonight.`;
    case 'previous-session-partner': return `${name(p.people[0])} and ${name(p.people[1])} were partners in the previous session.`;
    case 'owns-once':
      return `${name(p.person)} won't get a turn as Clarity Canvas owner in rounds ${p.part === 'first' ? '1-2' : '3-4'}.`;
    case 'observes-twice': return `${name(p.person)} would observe a second time.`;
    case 'unseated': return `${name(p.person)} has no seat in this round.`;
    case 'owner-without-canvas':
      return `${name(p.person)} would be a Clarity Canvas owner without a Clarity Canvas shared with this event. Starting is refused until someone with a canvas owns here.`;
    case 'too-few-canvases':
      return p.canvases < 2
        ? 'Fewer than two Clarity Canvases are shared with this event, so there is no table to seat.'
        : `Only ${p.canvases} Clarity Canvases are shared. The format works from 5, so some partners will repeat.`;
  }
}

/** [FOUNDER DECISION: copy] Which grid is which while the next round is previewed beside the one running. */
export const tablesNowTitle = (round: string): string => `${round}: tables now`;
export const tablesProposedTitle = (round: string): string => `${round}: proposed tables`;

/** [FOUNDER DECISION: copy] After a manual swap only this round is re-checked. */
export const SWAP_RECHECK_NOTE = 'Checked again after your swap. Later rounds are not re-checked.';
export const PLAN_OK_LINE = 'This seating breaks no rule.';
export const PLAN_NOT_READY = 'Still reading who has a Clarity Canvas. Try again in a moment.';

/** The server's refusal of an owner without a canvas, with the person's name that it puts in DETAIL. Null: not that refusal. */
export function seatGuardRefusal(error: unknown): string | null {
  const e = error as { message?: unknown; details?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message : '';
  if (!/Clarity Canvas owner needs a canvas/i.test(message)) return null;
  const who = typeof e?.details === 'string' && e.details ? ` (${e.details})` : '';
  return `Not saved: ${message}${who}. Swap them out and try again.`;
}

// ── The canvas-update step (§7) ─────────────────────────────────────────────────────────────────────────────────────

/** [FOUNDER DECISION: copy] */
export const UPDATE_STATE_WORDS: Record<string, string> = {
  not_tapped: "Hasn't started",
  drafting: 'Drafting',
  ready: 'Ready',
  failed: 'Failed',
  published: 'Published',
};
