/**
 * @file room-capture-attach.ts
 * @description Re-attaching to a stored capture after a reload (P1307), split out of room-capture-context.tsx (its size limit).
 * P1604 rule 8: the stored capture may be of a room the 3-hour roll has since ended, so the seat the roll made is looked up
 * FIRST (and followed, should the roll have happened more than once while the page was away).
 */
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from 'react';
import { getCaptureRoomState, getMyCaptureStatus } from '@/app/data/transcribe-capture-status';
import {
  acquireCaptureLock,
  captureCapRemainingMs,
  type CaptureAction,
  type CaptureLock,
  type CaptureState,
} from './room-capture-core';
import { clearStoredCapture, readStoredCapture, writeStoredCapture, type StoredCapture } from './room-capture-storage';

/** The stored capture, moved along the rolls to the seat the person has now. */
async function followMoves(stored: StoredCapture, userId: string): Promise<StoredCapture> {
  let current = stored;
  for (let hop = 0; hop < 5; hop++) {
    const state = await getCaptureRoomState(current.roomId, userId).catch(() => null);
    if (!state?.movedTo) return current;
    const { roomId, roomCode, memberId } = state.movedTo;
    current = { ...current, roomId, roomCode, memberId };
  }
  return current;
}

export function useReattach(
  user: { id: string } | null,
  sessionChecked: boolean,
  stateRef: MutableRefObject<CaptureState>,
  storedRef: MutableRefObject<StoredCapture | null>,
  media: MutableRefObject<{ lock: CaptureLock | null }>,
  dispatch: Dispatch<CaptureAction>,
  startMedia: (roomId: string) => Promise<void>,
  teardownLocal: (forgetRecord: boolean) => void,
  holdPaused: () => void,
): void {
  const attach = useCallback(async () => {
    if (!user || stateRef.current.phase !== 'idle') return;
    const stored = readStoredCapture();
    if (!stored) return;
    if (stored.userId !== user.id) {
      // Consented by someone else on this browser — never inherited.
      clearStoredCapture();
      return;
    }
    const record = await followMoves(stored, user.id);
    if (record !== stored) writeStoredCapture(record);
    const status = await getMyCaptureStatus(record.roomId, user.id).catch(() => null);
    const capPassed = status ? captureCapRemainingMs({ roomCreatedAt: status.roomCreatedAt, joinedAt: status.joinedAt }, Date.now()) <= 0 : true;
    if (!status || status.captureEndedAt || status.roomEndedAt || capPassed) {
      clearStoredCapture();
      return;
    }
    if (stateRef.current.phase !== 'idle') return;
    const lock = await acquireCaptureLock(record.roomId);
    storedRef.current = record;
    const room = { id: record.roomId, code: record.roomCode, eventId: record.eventId, conversationId: record.conversationId ?? null, roomCreatedAt: status.roomCreatedAt };
    // The member row exists and is not ended, and it can only have been created with consent.
    const member = { id: record.memberId, consentGivenAt: status.joinedAt, joinedAt: status.joinedAt };
    if (!lock.acquired) {
      dispatch({ type: 'ATTACH', room, member, observeOnly: true });
      return;
    }
    media.current.lock = lock;
    if (status.pausedSince) {
      // Paused when the page went away: come back paused, microphone closed. The paused heartbeat starts with the phase; Resume
      // opens the microphone.
      holdPaused();
      dispatch({ type: 'ATTACH', room, member, observeOnly: false, paused: true });
      return;
    }
    dispatch({ type: 'ATTACH', room, member, observeOnly: false });
    try {
      await startMedia(record.roomId);
    } catch (err) {
      console.error('[room-capture] could not re-attach the microphone:', err);
      teardownLocal(false);
    }
  }, [user, stateRef, storedRef, media, dispatch, startMedia, teardownLocal, holdPaused]);

  useEffect(() => {
    if (sessionChecked && user) void attach();
  }, [sessionChecked, user, attach]);
}

/**
 * Auth change ends capture immediately: after sign-out or a different account, nothing may reach the bucket under the old
 * person's record (split out of room-capture-context.tsx, unchanged).
 */
export function useStopOnAuthChange(
  sessionChecked: boolean,
  userId: string | undefined,
  stateRef: MutableRefObject<CaptureState>,
  media: MutableRefObject<{ uploadQueue: unknown[] }>,
  storedRef: MutableRefObject<StoredCapture | null>,
  stopMedia: () => unknown,
  dispatch: Dispatch<CaptureAction>,
): void {
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  // Unmount (a crash into the error boundary, a full teardown): capture stops with it.
  useEffect(() => () => { void stopMedia(); }, [stopMedia]);
  useEffect(() => {
    if (!sessionChecked) return;
    const currentId = userId ?? null;
    const previousId = lastUserIdRef.current;
    lastUserIdRef.current = currentId;
    if (previousId === undefined || previousId === currentId) return;
    if (stateRef.current.phase !== 'idle') {
      stopMedia();
      // Chunks still waiting would upload under the signed-out person's record.
      media.current.uploadQueue.length = 0;
      storedRef.current = null;
      dispatch({ type: 'AUTH_CHANGED' });
    }
    const record = readStoredCapture();
    if (record && record.userId !== currentId) clearStoredCapture();
  }, [sessionChecked, userId, stopMedia, stateRef, media, storedRef, dispatch]);
}
