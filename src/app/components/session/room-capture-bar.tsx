/**
 * @file room-capture-bar.tsx
 * @description P1307 D7/D9: "● Transcribing for AI insights" — wherever this person's room
 * transcription is running, on every page. A thin wrapper over the shared SessionBar; all
 * state and actions come from useRoomCapture().
 *
 * Renders only while something is running for this person: capturing, stalled (still
 * archiving — the indicator must not disappear), or observing (another tab of the same
 * browser holds the microphone; this tab still shows Open / End). Starting, ending and idle
 * render nothing. P1388: a MANUAL pause renders the bar in its paused state (the Resume control
 * lives here, and the recorder must see it is paused); an automatic pause (/live, letters) still
 * renders nothing, as D3/D13 asked.
 */
import { useLayoutEffect, useState } from 'react';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { SessionBar } from './session-bar';
import { CaptureInfoButton, PauseResumeButton } from './capture-controls';
import { STOP_TRANSCRIBING, useCaptureStatus } from './capture-status';
import { CaptureLevelMeter } from './capture-level-meter';
import { useConnectivity } from '@/app/contexts/offline-status-context';

const VISIBLE_PHASES = new Set(['capturing', 'stalled', 'observing']);

/**
 * P1369 — the offline state. Capture behaviour when the network drops was VERIFIED by reading
 * room-capture-context.tsx before writing this copy (the spec's blocking prerequisite): the
 * microphone keeps running (nothing stops capture on a network error), live-text slices fail and
 * the phase goes to `stalled`, and each 30 s archive chunk is retried 3 times (at 0 s, +2 s, +4 s)
 * and then DROPPED; there is no local persistence of those chunks. So words said while offline
 * may not be saved — the prototype's "will sync" line would be false. The bar must still say
 * transcription is running (P1307 D9).
 *
 * It keeps ONE control, a local "Stop microphone" (spec 2026-09-30, review A1): endMyCapture
 * releases the microphone before any server call (stopMedia runs first, synchronously; the tail
 * upload and the End RPC come after), so it works offline — pinned by
 * p1369-offline-stop-mic.test.tsx. Open needs the server and is not offered.
 * [FOUNDER DECISION: copy — PROPOSED, spec UI Contract]
 */
const OFFLINE_TEXT = '● Transcribing, but offline';
const OFFLINE_DETAIL = 'Words said while offline may not be saved.';
const OFFLINE_STOP = 'Stop microphone';
const OFFLINE_STOPPING = 'Stopping…';

export function RoomCaptureBar() {
  const { phase, roomId, open, endMyCapture, manualPaused } = useRoomCapture();
  const { offline } = useConnectivity();
  const status = useCaptureStatus();
  // Offline, the End RPC fails or hangs after the microphone is already off; until it settles the
  // phase does not change, so the button says the stop is under way instead of inviting a retap.
  const [stopping, setStopping] = useState(false);

  const manuallyPaused = phase === 'paused' && manualPaused;
  if ((!VISIBLE_PHASES.has(phase) && !manuallyPaused) || !roomId) return null;

  if (offline) {
    return (
      <SessionBar
        tone="offline"
        testId="room-capture-bar"
        ariaLabel="Room transcription active"
        text={OFFLINE_TEXT}
        detail={OFFLINE_DETAIL}
        secondary={{
          label: stopping ? OFFLINE_STOPPING : OFFLINE_STOP,
          disabled: stopping,
          testId: 'room-capture-bar-stop',
          onClick: () => {
            setStopping(true);
            void Promise.resolve(endMyCapture(roomId)).finally(() => setStopping(false));
          },
        }}
      />
    );
  }

  return (
    <SessionBar
      testId="room-capture-bar"
      ariaLabel="Room transcription active"
      showDot={false}
      text={<span data-warn={status.warn} className="data-[warn=true]:text-red-800">{status.text}</span>}
      adornment={
        <>
          {phase !== 'observing' && <CaptureLevelMeter active={phase === 'capturing' || phase === 'stalled'} />}
          <CaptureInfoButton />
        </>
      }
      extra={<PauseResumeButton />}
      primary={{ label: 'Open', onClick: open, testId: 'room-capture-bar-open' }}
      secondary={{ label: STOP_TRANSCRIBING, onClick: () => void endMyCapture(roomId), testId: 'room-capture-bar-end' }}
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
