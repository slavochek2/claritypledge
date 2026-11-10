/**
 * @file use-round-mic.ts
 * @description P1529: "mic first, one thing at a time" on the mastermind's round card. Says whether the card should be the mic step
 * for this person in this round, and what its two taps do.
 *
 * How capture is read: the room capture context (`useRoomCapture`), the one place capture state lives.
 *   - on        : `isCapturingForEvent(eventId)` (capturing, stalled, paused, or observing from another tab of the same browser) and
 *                 neither `micLost` nor `tapDown` (the microphone is open but nothing is being recorded: the tap to fix that is the step).
 *                 Those two flags describe THE capture that is running: when it is another event's, they say nothing about this one,
 *                 and the button starts this event's capture instead of reconnecting.
 *   - starting  : phase `starting`, `ending`, or a Stop in flight: the step shows, its button disabled.
 *   - restoring : after a reload the phase is `idle` (or `starting`) until the stored capture re-attaches (a few requests). While a stored
 *                 capture for THIS event exists, the step is held back, for at most RESTORE_WAIT_MS, so a reload never flashes "Start your mic".
 * A reconnect that resolves but leaves `micLost` or `tapDown` set is a failure (reconnectMic never throws): the step says so.
 *   - not on    : everything else.
 * "Continue without mic" is remembered per round in sessionStorage (try/catch: a blocked store only means it is not remembered).
 * The start is the room's own (useStartRoomCapture): this adds no capture logic.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { readStoredCapture } from '@/app/contexts/room-capture-storage';
import { useStartRoomCapture } from '@/app/components/session/use-start-room-capture';

/** How long a stored capture for this event is given to re-attach before the step shows anyway. */
export const RESTORE_WAIT_MS = 8000;

/** A capture stored for THIS event may still be re-attaching: the phase is `idle` (or `starting`) until it has. */
function isRestoring(phase: string, eventId: string): boolean {
  return (phase === 'idle' || phase === 'starting') && readStoredCapture()?.eventId === eventId;
}

const skipKey = (eventId: string, roundId: string) => `p1529:no-mic:${eventId}:${roundId}`;

function readSkip(eventId: string, roundId: string): boolean {
  try { return sessionStorage.getItem(skipKey(eventId, roundId)) === '1'; } catch { return false; }
}
function writeSkip(eventId: string, roundId: string): void {
  try { sessionStorage.setItem(skipKey(eventId, roundId), '1'); } catch { /* not remembered: the step may come back on a reload */ }
}

export interface RoundMic {
  /** The card is the mic step: the person is seated, not capturing, and has not chosen to continue without for this round. */
  needsStep: boolean;
  /** A start (or a reconnect) is under way, or capture is starting or stopping: the button is disabled. */
  busy: boolean;
  /** The last start did not open the mic. */
  failed: boolean;
  start: () => void;
  continueWithout: () => void;
}

export function useRoundMic({ eventId, roundId, displayName, seated }: { eventId: string; roundId: string | null; displayName: string; seated: boolean }): RoundMic {
  const capture = useRoomCapture();
  const [failed, setFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // A reconnect was tried; whether it worked is read from the context on the render that follows it.
  const [reconnected, setReconnected] = useState(false);
  // The rounds this page instance skipped; sessionStorage carries it across a reload.
  const [skipped, setSkipped] = useState<string | null>(null);
  const [restoreOver, setRestoreOver] = useState(false);
  const onFailed = useCallback(() => setFailed(true), []);
  const { start: startRoom, starting } = useStartRoomCapture(eventId, displayName, onFailed);

  // The wait starts again for each event (a stored capture is only held back for the event it belongs to).
  useEffect(() => {
    setRestoreOver(false);
    const id = setTimeout(() => setRestoreOver(true), RESTORE_WAIT_MS);
    return () => clearTimeout(id);
  }, [eventId]);

  // What failed before is not this round's: a new round starts clean.
  useEffect(() => { setFailed(false); setReconnected(false); }, [roundId]);

  const mine = capture.isCapturingForEvent(eventId);
  const needsReconnect = mine && (capture.micLost || capture.tapDown);
  const on = mine && !needsReconnect;
  useEffect(() => { if (!needsReconnect) setReconnected(false); }, [needsReconnect]);
  const reconnectFailed = reconnected && !reconnecting && needsReconnect;
  const restoring = !restoreOver && isRestoring(capture.phase, eventId);
  const skippedNow = !!roundId && (skipped === roundId || readSkip(eventId, roundId));
  const needsStep = seated && !!roundId && !on && !restoring && !skippedNow;

  const start = useCallback(() => {
    setFailed(false);
    setReconnected(false);
    if (!needsReconnect) { startRoom(); return; }
    // Open but recording nothing: the one way back is the context's own reconnect.
    setReconnecting(true);
    void capture.reconnectMic().catch(() => setFailed(true)).finally(() => { setReconnected(true); setReconnecting(false); });
  }, [needsReconnect, startRoom, capture]);

  const continueWithout = useCallback(() => {
    if (!roundId) return;
    writeSkip(eventId, roundId);
    setSkipped(roundId);
  }, [eventId, roundId]);

  const busy = starting || reconnecting || capture.stopping || capture.phase === 'starting' || capture.phase === 'ending';
  return { needsStep, busy, failed: failed || reconnectFailed, start, continueWithout };
}
