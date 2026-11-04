/**
 * @file use-room-transcription-state.ts
 * @description P1604: keeps the "processing" state of transcription sessions honest while a /sessions screen is open. It polls only
 * while something is processing, never faster than the chat's own live poll (15 s), and stops by itself when the text has arrived or
 * failed. A failed read changes nothing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { startVisiblePoll } from '@/lib/visible-poll';
import { getMyRoomStates, type TranscriptionState } from '@/app/data/room-transcription-state';
import type { SessionSummary } from '@/app/data/sessions-service';

export const STATE_POLL_MS = 15_000;

/** The list: overlays fresh states onto the sessions while any of them is processing (and the list is what is on screen). */
export function useStateOverlay(sessions: SessionSummary[], enabled: boolean): SessionSummary[] {
  const [overlay, setOverlay] = useState<ReadonlyMap<string, TranscriptionState>>(new Map());
  const stateOf = (s: SessionSummary) => (s.roomId && overlay.get(s.roomId)) || s.transcriptionState;
  const processing = sessions.filter((s) => s.roomId && stateOf(s) === 'processing').map((s) => s.roomId as string);
  const key = processing.join(',');

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    const stop = startVisiblePoll(() => {
      void getMyRoomStates(key.split(',')).then((fresh) => {
        if (cancelled || fresh.size === 0) return;
        setOverlay((prev) => {
          const next = new Map(prev);
          fresh.forEach((info, roomId) => next.set(roomId, info.state));
          return next;
        });
      });
    }, STATE_POLL_MS);
    return () => { cancelled = true; stop(); };
  }, [enabled, key]);

  return useMemo(
    () => sessions.map((s) => (s.roomId && overlay.has(s.roomId) ? { ...s, transcriptionState: overlay.get(s.roomId) as TranscriptionState } : s)),
    [sessions, overlay],
  );
}

/**
 * One session's text view: the live state, and `onReady` once when it turns ready (so the text is read again). The state follows the
 * room it shows and the state it is given: a poll result belongs to the room and initial state it was read for, so a view reused for
 * another room, or handed a newer state, never keeps the earlier one.
 */
export function useRoomTranscriptionState(roomId: string, initial: TranscriptionState, onReady: () => void): TranscriptionState {
  const key = `${roomId}|${initial}`;
  const [fresh, setFresh] = useState<{ key: string; state: TranscriptionState } | null>(null);
  const state = fresh && fresh.key === key ? fresh.state : initial;
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    if (state !== 'processing') return;
    let cancelled = false;
    const stop = startVisiblePoll(() => {
      void getMyRoomStates([roomId]).then((got) => {
        const next = got.get(roomId)?.state;
        if (cancelled || !next || next === 'processing') return;
        setFresh({ key, state: next });
        if (next === 'ready') ready.current();
      });
    }, STATE_POLL_MS);
    return () => { cancelled = true; stop(); };
  }, [state, roomId, key]);

  return state;
}
