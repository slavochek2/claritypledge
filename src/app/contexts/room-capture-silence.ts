/**
 * @file room-capture-silence.ts
 * @description P1388: every silent failure (iOS lock, a muted track, a dead input) writes zeros, never an error. Checked only
 * while actually capturing, since a pause is silent on purpose. Split out of room-capture-context.tsx (its size limit), unchanged.
 * Keyed on "running", not the phase: a capturing / stalled flap must not restart the clock, or a flap faster than the threshold
 * would hide a dead input for good.
 */
import { useEffect, type MutableRefObject } from 'react';
import { SILENCE_WARN_AFTER_MS } from './room-capture-core';

export function useInputSilence(
  running: boolean,
  media: MutableRefObject<{ slices: unknown; lastSignalAt: number }>,
  setInputSilent: (silent: boolean) => void,
): void {
  useEffect(() => {
    if (!running) {
      setInputSilent(false);
      return;
    }
    media.current.lastSignalAt = Date.now();
    const timer = setInterval(() => {
      const h = media.current;
      // No tap running (starting up, or live text failed to start) means no level to judge:
      // not silence. Saying "no sound" there would blame a mic that is recording fine.
      if (!h.slices) h.lastSignalAt = Date.now();
      setInputSilent(Date.now() - h.lastSignalAt > SILENCE_WARN_AFTER_MS);
    }, 1_000);
    return () => clearInterval(timer);
  }, [running, media, setInputSilent]);
}
