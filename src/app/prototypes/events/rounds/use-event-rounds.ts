/**
 * @file use-event-rounds.ts
 * @description P1337 — the round state for one event, polled every few seconds, plus a ticking
 * `now` for the countdowns. Shared by the host panel, the projector view and the attendee's
 * round card, so every surface reads the same seating and the same clock.
 *
 * A failed read keeps the last good state (a venue Wi-Fi blip must not blank the projector);
 * `refresh()` re-reads at once after a write so the writer sees the result without waiting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_ROUNDS_STATE,
  ROUNDS_POLL_MS,
  getEventRoundsState,
  type EventRoundsState,
} from '@/app/data/event-rounds-service';

/** `live` false reads once and stops — after the event nothing changes, so nothing polls. */
export function useEventRounds(eventId: string | undefined, enabled = true, live = true) {
  const [state, setState] = useState<EventRoundsState>(EMPTY_ROUNDS_STATE);
  const [loaded, setLoaded] = useState(false);
  const current = useRef<{ eventId: string; loop: Promise<void>; token: object } | null>(null);
  const again = useRef(false);
  const activeEvent = useRef(eventId);
  activeEvent.current = eventId;

  // One read at a time; a refresh asked for meanwhile is not dropped but runs once the current
  // read returns, and the caller's await resolves only after it. Otherwise a poll that started
  // before a host's swap lands AFTER it with the old seats, and the next swap — built on that
  // stale board — silently reverts the first (code review). A read is scoped to its event: if
  // the page moves to another event mid-read, the old answer is dropped, never shown as the new
  // event's rounds (Codex review).
  const refresh = useCallback((): Promise<void> => {
    if (!eventId) return Promise.resolve();
    if (current.current?.eventId === eventId) {
      again.current = true;
      return current.current.loop;
    }
    const token = {};
    const loop = (async () => {
      try {
        do {
          again.current = false;
          try {
            const next = await getEventRoundsState(eventId);
            if (activeEvent.current !== eventId) return;
            setState(next);
            setLoaded(true);
          } catch {
            /* keep what is shown */
          }
        } while (again.current && activeEvent.current === eventId);
      } finally {
        if (current.current?.token === token) current.current = null;
      }
    })();
    current.current = { eventId, loop, token };
    return loop;
  }, [eventId]);

  useEffect(() => {
    setState(EMPTY_ROUNDS_STATE);
    setLoaded(false);
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !enabled) return;
    void refresh();
    if (!live) return;
    const id = setInterval(() => void refresh(), ROUNDS_POLL_MS);
    return () => clearInterval(id);
  }, [eventId, enabled, live, refresh]);

  return { state, loaded, refresh };
}

/** Re-renders every `intervalMs` while `active`; returns Date.now() of the last tick. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? '';
}

/** "Aleksandra Petrova" → "P." ; one-word names → "". */
export function initial(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length < 2 ? '' : `${(parts[parts.length - 1] ?? '').charAt(0)}.`;
}

/** "Aleksandra Petrova" → "Aleksandra P." — the 320px tiles truncate long full names (spec §6). */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${(parts[parts.length - 1] ?? '').charAt(0)}.`;
}
