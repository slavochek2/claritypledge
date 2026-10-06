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
import { ArrowRight, Mic, Pause, Play, Square } from 'lucide-react';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { SessionBar } from './session-bar';
import { CaptureInfoButton, OpenRoomButton, PauseResumeButton, StopCaptureButton } from './capture-controls';
import { SHORT, useCaptureStatus } from './capture-status';
import { CaptureLevelMeter } from './capture-level-meter';
import { useConnectivity, useOfflineStripShown } from '@/app/contexts/offline-status-context';

const VISIBLE_PHASES = new Set(['capturing', 'stalled', 'observing', 'paused']);

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

const ICON_BUTTON =
  'inline-flex items-center justify-center h-10 w-10 rounded-md border border-blue-300 bg-white text-blue-900 hover:bg-blue-100 disabled:opacity-50';

/**
 * The short bar — the ONLY form on ordinary pages (founder, 2026-10-02): the status in a few
 * words, the meter, ⓘ, and the three controls as icons. One look everywhere, no expand control
 * and no remembered state: the full detail is one tap away in the room (→). It is sticky, so a
 * recorder scrolling the feed always sees that capture is running (P1307 D9).
 */
function CompactCaptureBar({ roomId }: { roomId: string }) {
  const { phase, open, endMyCapture, pauseMine, resumeMine, micLost, stopping, reconnectMic } = useRoomCapture();
  const status = useCaptureStatus();
  const paused = phase === 'paused';
  const short = SHORT[status.kind];
  return (
    <div role="status" aria-label={`Room transcription: ${status.text}`} data-testid="room-capture-bar" data-form="short"
      className="relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-1 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <div className="max-w-4xl mx-auto flex items-center gap-2">
        <span data-warn={status.warn} className="text-sm font-medium text-blue-900 data-[warn=true]:text-red-800">{short}</span>
        {phase !== 'observing' && <CaptureLevelMeter active={phase === 'capturing' || phase === 'stalled'} />}
        <CaptureInfoButton />
        <div className="ml-auto flex items-center gap-2">
          {micLost && (
            <button type="button" className={ICON_BUTTON} disabled={stopping} onClick={() => void reconnectMic()}
              aria-label="Reconnect mic" data-testid="capture-reconnect">
              <Mic className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {phase !== 'observing' && !micLost && (
            <button type="button" className={ICON_BUTTON} disabled={stopping} onClick={paused ? resumeMine : pauseMine}
              aria-label={paused ? 'Resume' : 'Pause'} aria-pressed={paused}>
              {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          <button type="button" className={`${ICON_BUTTON} hover:text-destructive active:text-destructive active:bg-destructive/10`} disabled={stopping}
            onClick={() => void endMyCapture(roomId)} aria-label="Stop transcribing" data-testid="room-capture-bar-end">
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
          <button type="button" className={ICON_BUTTON} disabled={stopping} onClick={open} aria-label="Open the room" data-testid="room-capture-bar-open">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomCaptureBar({ short = false }: { short?: boolean }) {
  const { phase, roomId, open, endMyCapture, manualPaused, pausedByLiveRecord } = useRoomCapture();
  const { offline } = useConnectivity();
  const status = useCaptureStatus();
  // Offline, the End RPC fails or hangs after the microphone is already off; until it settles the
  // phase does not change, so the button says the stop is under way instead of inviting a retap.
  const [stopping, setStopping] = useState(false);

  if (!VISIBLE_PHASES.has(phase) || !roomId) return null;
  // Of the pauses, only the two the person can see and undo render (D3/D13 for the rest).
  if (phase === 'paused' && !manualPaused && !pausedByLiveRecord) return null;

  if (short && !offline) return <CompactCaptureBar roomId={roomId} />;

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
      extra={
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <PauseResumeButton />
          <StopCaptureButton onClick={() => void endMyCapture(roomId)} testId="room-capture-bar-end" />
          <OpenRoomButton onClick={open} testId="room-capture-bar-open" />
        </div>
      }
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
  // The nav moves down exactly when the offline STRIP shows — read the same signal it reads.
  const offline = useOfflineStripShown();
  useLayoutEffect(() => registerBarSlot(), [registerBarSlot]);
  // P1388 (founder, 2026-10-02): the short bar, stuck under the fixed nav — so a recorder
  // browsing the feed always sees that capture is running (D9) and can pause it.
  // Offline, the nav sits 1.75rem lower under the offline strip (simple-navigation.tsx).
  return barVisible ? (
    // data-testid: the event room measures this slot (any form of the bar) to pin its own head below it (P1429 A4).
    <div data-testid="room-capture-slot" className={`sticky z-30 ${offline
      ? 'top-[calc(5.75rem+env(safe-area-inset-top))] lg:top-[calc(6.75rem+env(safe-area-inset-top))]'
      : 'top-[calc(4rem+env(safe-area-inset-top))] lg:top-[calc(5rem+env(safe-area-inset-top))]'}`}>
      <RoomCaptureBar short />
    </div>
  ) : null;
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

/**
 * P1337 (founder, 2026-10-05): in the event room only, the transcription banner has an idle state —
 * nothing is running, so it offers one quiet "Transcribe". The tap is the consent (nothing is
 * pre-selected, P1307 D12) and the only place transcription starts in the event room (walkthrough
 * 7). Once capture runs, this disappears and today's running banner takes its place; outside the
 * event room nothing changes.
 */
const IDLE_TEXT = 'Not transcribing';
/**
 * What the tap does — the switch's description from the old start screen — and the terms reminder
 * that switch carried (founder, 2026-09-14), now that this tap is the only way in (walkthrough 7).
 */
const IDLE_DETAIL = 'Record audio and share transcript with others in the room. Transcription follows our Terms and Privacy Policy.';

export function RoomTranscribeIdleBar({
  eventId,
  displayName,
  onFailed,
}: {
  eventId: string;
  displayName: string;
  onFailed: () => void;
}) {
  const capture = useRoomCapture();
  const { offline } = useConnectivity();
  const [starting, setStarting] = useState(false);
  const busyPhase = capture.phase === 'starting' || capture.phase === 'ending';
  if (offline || busyPhase || capture.isCapturingForEvent(eventId)) return null;
  return (
    <SessionBar
      tone="idle"
      testId="room-transcribe-idle"
      ariaLabel="Room transcription"
      text={IDLE_TEXT}
      // Walkthrough 9: the same ⓘ as the running bar — what is recorded and where it goes, one tap
      // away before anyone starts, without a line of small print on every page.
      adornment={<CaptureInfoButton />}
      primary={{
        label: starting ? 'Starting…' : 'Transcribe',
        description: IDLE_DETAIL,
        disabled: starting,
        testId: 'room-transcribe-start',
        onClick: () => {
          setStarting(true);
          void capture
            .startCapture({ eventId, displayName })
            .then(result => {
              if (!result.started) onFailed();
            })
            .catch(onFailed)
            .finally(() => setStarting(false));
        },
      }}
    />
  );
}
