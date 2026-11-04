/**
 * @file room-capture-timers.ts
 * @description The two clocks a running room capture keeps, split out of room-capture-context.tsx (its size limit):
 *   - the room's 3-hour cap (P1604 rule 8: the ROOM's clock; the sweep's roll normally moves the capture on before it fires);
 *   - the paused heartbeat (P1307), which now also learns the room's state (P1604 rule 5): a room that ended, or the
 *     next room the roll seated this person in.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { ROOM_ENDED_NOTICE } from '@/app/components/session/capture-copy';
import { getCaptureRoomState } from '@/app/data/transcribe-capture-status';
import { touchRoomCapture } from '@/app/data/transcribe-service';
import type { MovedTo } from '@/app/data/transcribe-slice-destination';
import { CAPTURE_STORAGE_KEY } from './room-capture-storage';
import {
  LIVE_PHASES,
  PAUSED_HEARTBEAT_INTERVAL_MS,
  captureCapRemainingMs,
  type CaptureState,
} from './room-capture-core';

/** P1604: how often a running capture asks whether its room ended or moved on, for when the slices cannot say so. */
export const ROOM_STATE_POLL_MS = 60_000;

/** How often a paused capture re-checks /live, which no navigation will trigger. */
const PAUSE_RECHECK_MS = 5_000;

export function useRoomCaptureTimers(
  state: CaptureState,
  hardStopRef: MutableRefObject<(reason: string) => void>,
  moveRef: MutableRefObject<(moved: MovedTo) => Promise<void>>,
  onLiveRecheck: () => void,
  userId: string | undefined,
): void {
  const { phase, roomId, joinedAt, roomCreatedAt } = state;
  // A fresh closure each render must not restart the heartbeat (it beats once on every start).
  const recheck = useRef(onLiveRecheck);
  recheck.current = onLiveRecheck;

  useEffect(() => {
    if (!LIVE_PHASES.has(phase) || phase === 'observing' || !(roomCreatedAt ?? joinedAt)) return;
    const remaining = captureCapRemainingMs({ roomCreatedAt, joinedAt }, Date.now());
    const timer = setTimeout(() => hardStopRef.current('room cap reached'), remaining);
    return () => clearTimeout(timer);
  }, [phase, joinedAt, roomCreatedAt, hardStopRef]);

  // P1604: a running capture whose slices cannot say that its room moved on (no tap, a refused lock, a stalled queue) still
  // learns it from a plain read. Never writes, so it is safe in every phase that has a mic.
  useEffect(() => {
    if ((phase !== 'capturing' && phase !== 'stalled') || !roomId || !userId) return;
    const timer = setInterval(() => {
      void getCaptureRoomState(roomId, userId).then((st) => {
        if (st.movedTo) void moveRef.current(st.movedTo);
        else if (st.ended) hardStopRef.current('room ended');
      }).catch((err) => console.warn('[room-capture] room-state check failed:', err));
    }, ROOM_STATE_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, roomId, userId, hardStopRef, moveRef]);

  // While paused: the heartbeat, and a re-check of /live state.
  useEffect(() => {
    if (phase !== 'paused' || !roomId) return;
    const beat = () => void touchRoomCapture(roomId).then((hb) => {
      if (hb?.movedTo) void moveRef.current(hb.movedTo);
      else if (hb?.roomEnded) {
        toast(ROOM_ENDED_NOTICE);
        hardStopRef.current('room ended while paused');
      }
    }).catch((err) => console.warn('[room-capture] heartbeat failed:', err));
    beat();
    const heartbeat = setInterval(beat, PAUSED_HEARTBEAT_INTERVAL_MS);
    const recheckTimer = setInterval(() => recheck.current(), PAUSE_RECHECK_MS);
    return () => {
      clearInterval(heartbeat);
      clearInterval(recheckTimer);
    };
  }, [phase, roomId, hardStopRef, moveRef]);
}

/** Another tab ended the capture, or /live state changed in another tab. */
export function useCaptureStorageSync(
  stateRef: MutableRefObject<CaptureState>,
  teardownLocal: (forgetRecord: boolean) => void,
  onLiveChange: () => void,
): void {
  const liveChange = useRef(onLiveChange);
  liveChange.current = onLiveChange;
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CAPTURE_STORAGE_KEY && !e.newValue && stateRef.current.phase !== 'idle') {
        teardownLocal(false);
      }
      liveChange.current();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [stateRef, teardownLocal]);
}
