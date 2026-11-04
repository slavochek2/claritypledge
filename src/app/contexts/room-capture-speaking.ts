/**
 * @file room-capture-speaking.ts
 * @description The "…" speaking cue of room capture: a realtime broadcast per room, never a row. Split out of
 * room-capture-context.tsx (its size limit), unchanged.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { supabase } from '@/lib/supabase';
import type { CaptureState } from './room-capture-core';

/** Speaking cue: input level above this within the last SPEAKING_HOLD_MS reads as speaking. */
const SPEAKING_HOLD_MS = 1_500;
/** A broadcast "speaking" state that is not refreshed expires, so a closed tab's "…" clears. */
const SPEAKING_EXPIRY_MS = 4_000;

/** Returns member id -> expiry time for everyone heard speaking in the capture's room. */
export function useSpeakingCue(
  state: CaptureState,
  stateRef: MutableRefObject<CaptureState>,
  getLastLoudAt: () => number,
): Map<string, number> {
  const [speaking, setSpeaking] = useState<Map<string, number>>(new Map());
  const loud = useRef(getLastLoudAt);
  loud.current = getLastLoudAt;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── The "…" speaking cue: realtime broadcast, never a row ────────────────

  const subscribedRoomId = state.phase === 'idle' ? null : state.roomId;
  useEffect(() => {
    if (!subscribedRoomId) return;
    const channel = supabase
      .channel(`transcribe_speaking:${subscribedRoomId}`)
      .on('broadcast', { event: 'speaking' }, ({ payload }) => {
        const { memberId, speaking: isSpeaking } = (payload ?? {}) as { memberId?: string; speaking?: boolean };
        if (typeof memberId !== 'string') return;
        setSpeaking((prev) => {
          const next = new Map(prev);
          if (isSpeaking) next.set(memberId, Date.now() + SPEAKING_EXPIRY_MS);
          else next.delete(memberId);
          return next;
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setSpeaking(new Map());
    };
  }, [subscribedRoomId]);

  useEffect(() => {
    const memberId = state.memberId;
    if (!memberId || !state.roomId) return;
    let lastSent: boolean | null = null;
    const timer = setInterval(() => {
      const isSpeaking = stateRef.current.phase === 'capturing' && Date.now() - loud.current() < SPEAKING_HOLD_MS;
      setSpeaking((prev) => {
        // Expire stale broadcasts (a tab that closed mid-sentence never sends "stopped").
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [id, expiresAt] of next) {
          if (expiresAt < now) {
            next.delete(id);
            changed = true;
          }
        }
        if (isSpeaking) {
          next.set(memberId, now + SPEAKING_EXPIRY_MS);
          changed = true;
        } else if (next.has(memberId)) {
          next.delete(memberId);
          changed = true;
        }
        return changed ? next : prev;
      });
      // Re-sent while speaking so other tabs' expiry keeps being refreshed.
      if (isSpeaking || lastSent !== isSpeaking) {
        lastSent = isSpeaking;
        void channelRef.current?.send({ type: 'broadcast', event: 'speaking', payload: { memberId, speaking: isSpeaking } });
      }
    }, 750);
    return () => clearInterval(timer);
  }, [state.memberId, state.roomId, stateRef]);

  return speaking;
}
