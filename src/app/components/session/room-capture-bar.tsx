/**
 * @file room-capture-bar.tsx
 * @description P1307 D7/D9: "● Transcribing for AI insights" — wherever this person's room
 * transcription is running, on every page. A thin wrapper over the shared SessionBar; all
 * state and actions come from useRoomCapture().
 *
 * Renders only while something is running for this person: capturing, stalled (still
 * archiving — the indicator must not disappear), or observing (another tab of the same
 * browser holds the microphone; this tab still shows Open / End). Paused, starting, ending
 * and idle render nothing: during a pause nothing is captured, so the absence of a bar is the
 * truth, and D3/D13 ask for no "paused" message.
 */
import { useLayoutEffect } from 'react';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { SessionBar } from './session-bar';

const VISIBLE_PHASES = new Set(['capturing', 'stalled', 'observing']);

/** UI Contract. */
const RUNNING_TEXT = '● Transcribing for AI insights';
/** [FOUNDER DECISION: copy — PROPOSED] Reuses the room page's existing stall string; build
 *  with it and confirm at /verify. */
const STALLED_TEXT = '● Live text has stalled — your words are still being recorded.';

export function RoomCaptureBar() {
  const { phase, roomId, open, endMyCapture } = useRoomCapture();

  if (!VISIBLE_PHASES.has(phase) || !roomId) return null;

  return (
    <SessionBar
      testId="room-capture-bar"
      ariaLabel="Room transcription active"
      showDot={false}
      text={phase === 'stalled' ? STALLED_TEXT : RUNNING_TEXT}
      primary={{ label: 'Open', onClick: open, testId: 'room-capture-bar-open' }}
      secondary={{ label: 'End session', onClick: () => void endMyCapture(roomId), testId: 'room-capture-bar-end' }}
    />
  );
}

/**
 * An in-flow place for the bar, where the page's own chrome leaves room for one — the landing
 * layout under its nav, the room page under its header. While at least one slot is mounted the
 * App-level fallback stays out of the way, so the bar is never drawn twice.
 */
export function RoomCaptureBarSlot() {
  const { registerBarSlot, barVisible } = useRoomCapture();
  useLayoutEffect(() => registerBarSlot(), [registerBarSlot]);
  return barVisible ? <RoomCaptureBar /> : null;
}

/**
 * P1323 R6: CLAIM the slot and draw NOTHING.
 *
 * `/transcribe/:code`'s running-room view already carries its own "End Session" in the page
 * header, its own listening indicator and the live transcript. The bar underneath it was a
 * second end-control plus an "Open" button pointing at the page it was drawn on.
 *
 * DELETING the page's slot does the OPPOSITE of what it looks like, and this is the whole
 * reason this component exists. `RoomCaptureBarFallback` is mounted app-wide (App.tsx) and
 * fires whenever `barSlotCount === 0`. The layout's own slot is already gated off for this
 * route (`clarity-landing-layout.tsx`, `!isLivePage`, and `isLivePage` covers
 * `/transcribe/`), so the page's slot is the ONLY one here. Remove it and the count drops to
 * zero, the fallback fires, and the same bar comes back as a `sticky top-0 z-[45]` overlay —
 * the duplicate relocated, not removed.
 *
 * So: keep the registration, drop the render. D9 ("capture never runs with no indicator") is
 * SATISFIED, not weakened — the room page's own indicator is a stronger signal than the bar.
 * And D9 stays a RULE rather than a route list: nothing here knows which route it is on. A
 * route check inside the fallback was the rejected alternative, because the next page with
 * its own header would reproduce this bug.
 */
export function RoomCaptureBarClaimSilent() {
  const { registerBarSlot } = useRoomCapture();
  useLayoutEffect(() => registerBarSlot(), [registerBarSlot]);
  return null;
}

/**
 * D9 as a rule, not a route list: on any route that mounts no slot — chrome-free letter pages,
 * ?embed=true, routes outside the layout — the bar still renders, in flow at the top of the
 * document, above the page's own content.
 */
export function RoomCaptureBarFallback() {
  const { barSlotCount, barVisible } = useRoomCapture();
  if (barSlotCount > 0 || !barVisible) return null;
  return (
    <div className="sticky top-0 z-[45]">
      <RoomCaptureBar />
    </div>
  );
}
