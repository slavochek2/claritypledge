/**
 * @file prep-room-embed.ts
 * @description The contract between the event room and the learning drawn inside it (PrepFlow's `room` prop; moved
 * here from EventPrepPage.tsx, which may not grow).
 *
 * Founder 2026-10-26 (item 4): the learning is drawn INSIDE the mounted room page (EventRoomMeet), below the room's
 * own "Back to the event" and step bar, which stay mounted. Moving to a room step calls onStep instead of navigating
 * to /room, so a tab switch never remounts the page. Absent = the /prepare route (direct links, ?from=room too).
 */
import type { RoomStep } from '../rounds/RoomSteps';

export type PrepRoomEmbed = {
  onStep: (step: RoomStep) => void;
  /** Round 8c: false while another room step is shown (the flow stays mounted, hidden). */
  active: boolean;
  /** Round 8b: where the step header goes — a slot in the room's sticky head, so it stays pinned on long steps.
   *  null = the learning is hidden (no header drawn). */
  headSlot: HTMLElement | null;
  /** P1542 review round 3 (D): a non-learner's Join started this learning — its finish goes straight to the group
   *  terms (onStep), never the ordinary "learned" end screen. */
  thenJoin?: boolean;
};
