/**
 * @file room-capture-move.ts
 * @description P1604 rule 8: the 3-hour roll. The server ends a room at 176 minutes and seats the people still recording in
 * the next room ("Part 2"). A slice (410 with `movedTo`) or the paused heartbeat tells the client; this carries the capture
 * over without releasing the microphone: the old room's archive tail is still uploaded to the OLD room (each upload job
 * carries its own record), the stored capture and the state point at the new room, and the live slices start there.
 * Split out of room-capture-context.tsx (its size limit).
 */
import { useCallback, useRef, type Dispatch, type MutableRefObject } from 'react';
import { getCaptureRoomState, getMyCaptureStatus } from '@/app/data/transcribe-capture-status';
import { endMyCapture as endMyCaptureRpc } from '@/app/data/transcribe-service';
import type { MovedTo } from '@/app/data/transcribe-slice-destination';
import { acquireCaptureLock, type CaptureAction, type CaptureLock, type CaptureState } from './room-capture-core';
import { writeStoredCapture, type StoredCapture } from './room-capture-storage';

/** The part of the provider's media handles a move touches. */
interface MoveMedia {
  stream: MediaStream | null;
  slices: { stop: () => void } | null;
  tail: { record: StoredCapture | null; flush: boolean } | null;
  lock: CaptureLock | null;
}

/** Starts the live slices for a room on the open microphone; `stillCurrent` turns false if the capture ended meanwhile. */
export type StartTap = (roomId: string, stillCurrent: () => boolean) => Promise<void>;

/** A move needs a stored capture that is live, not ending, and not already in the room it is moving to. */
function canMove(prev: StoredCapture | null, live: CaptureState, moved: MovedTo): prev is StoredCapture {
  return !!prev && live.phase !== 'idle' && live.phase !== 'ending' && prev.roomId !== moved.roomId;
}

export function useRoomMove(
  media: MutableRefObject<MoveMedia>,
  storedRef: MutableRefObject<StoredCapture | null>,
  stateRef: MutableRefObject<CaptureState>,
  pausedRef: MutableRefObject<boolean>,
  genRef: MutableRefObject<number>,
  dispatch: Dispatch<CaptureAction>,
  startTap: StartTap,
  onTapDown: () => void,
): (moved: MovedTo) => Promise<void> {
  // One move at a time: a slice refusal and a heartbeat can both report the same roll.
  const moving = useRef(false);
  return useCallback(async (moved: MovedTo) => {
    const prev = storedRef.current;
    const live = stateRef.current;
    if (moving.current || !canMove(prev, live, moved)) return;
    moving.current = true;
    const gen = genRef.current;
    // A Stop (or sign-out) during the move: the seat this move was about to use is ended too, never left for the sweep.
    const cancelled = (lock?: CaptureLock | null): boolean => {
      if (genRef.current === gen) return false;
      lock?.release();
      void endMyCaptureRpc(moved.roomId).catch(() => undefined);
      return true;
    };
    try {
      const h = media.current;
      // The tail of the old room's recording is flushed under the OLD record; uploads of Part 1 stay valid for 2 minutes.
      h.tail = { record: prev, flush: true };
      try { h.slices?.stop(); } finally { h.tail = null; }
      h.slices = null;

      const status = await getMyCaptureStatus(moved.roomId, prev.userId).catch(() => null);
      if (cancelled()) return;
      const roomCreatedAt = status?.roomCreatedAt ?? new Date().toISOString();
      const next: StoredCapture = {
        ...prev, roomId: moved.roomId, roomCode: moved.roomCode, memberId: moved.memberId,
        joinedAt: status?.joinedAt ?? roomCreatedAt,
      };
      storedRef.current = next;
      writeStoredCapture(next);
      const lock = await acquireCaptureLock(moved.roomId).catch(() => null);
      if (cancelled(lock)) return;
      if (lock?.acquired) {
        h.lock?.release();
        h.lock = lock;
      }
      dispatch({
        type: 'MOVED',
        room: { id: moved.roomId, code: moved.roomCode, eventId: prev.eventId, conversationId: live.conversationId ?? null, roomCreatedAt },
        member: { id: moved.memberId, joinedAt: next.joinedAt },
      });
      // Another tab holds Part 2's lock (or it could not be taken): nothing records here, and the bar says so.
      if (!lock?.acquired) onTapDown();
      else if (h.stream && !pausedRef.current) await startTap(moved.roomId, () => genRef.current === gen);
    } finally {
      moving.current = false;
    }
  }, [media, moving, storedRef, stateRef, pausedRef, genRef, dispatch, startTap, onTapDown]);
}

/**
 * An archive upload of the CURRENT capture was refused (410/403). If the roll moved this person into the next room, follow it;
 * otherwise the capture is over. (A refusal of an earlier room never gets here: the upload queue drops it.)
 */
export function useRefusalFollow(
  userId: string | undefined,
  storedRef: MutableRefObject<StoredCapture | null>,
  moveRef: MutableRefObject<(moved: MovedTo) => Promise<void>>,
  hardStopRef: MutableRefObject<(reason: string) => void>,
): () => void {
  return useCallback(() => {
    const roomId = storedRef.current?.roomId;
    const stop = () => hardStopRef.current('archive refused');
    if (!roomId || !userId) return stop();
    void (async () => {
      try {
        const state = await getCaptureRoomState(roomId, userId);
        if (state.movedTo) await moveRef.current(state.movedTo);
        else stop();
      } catch {
        stop();
      }
    })();
  }, [userId, storedRef, moveRef, hardStopRef]);
}
