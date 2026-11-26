/** @file use-room-disclosure.ts @description The room lookups behind /transcribe's disclosure line, run ONCE and read by both the line and the Join gate. */
import { useCallback, useState } from 'react';
import { useRoomEventState, type RoomEventState } from './use-room-event';
import { useRoomIsMastermind } from './use-room-is-mastermind';

/** The id of the disclosure paragraph; the Join button is described by it. */
export const DISCLOSURE_ID = 'transcribe-room-disclosure';

/**
 * One snapshot for the paragraph and the gate: `settled` is false while the room lookup ("Checking this room…") or an event room's
 * mastermind lookup is pending, so Join cannot enable before the paragraph shows its final text. An errored or timed-out lookup is
 * state 'failed' (not settled, not a wording), and `retry` runs both lookups again.
 */
export function useRoomDisclosure(code: string | undefined): { state: RoomEventState; mastermind: boolean | null; settled: boolean; pending: boolean; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const roomState = useRoomEventState(code, attempt);
  const mastermind = useRoomIsMastermind(code, roomState === 'event', attempt);
  const failed = roomState === 'failed' || mastermind === 'failed';
  const state: RoomEventState = failed ? 'failed' : roomState;
  const known = mastermind === 'failed' ? null : mastermind;
  // A room that does not exist is answered, not settled: there is nothing to join, so Join never enables for it.
  const pending = !failed && (roomState === 'loading' || known === null);
  return { state, mastermind: known, settled: !failed && state !== 'loading' && state !== 'unknown' && known !== null, pending, retry };
}
