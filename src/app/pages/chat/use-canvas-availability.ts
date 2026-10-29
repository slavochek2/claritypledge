/**
 * P1536: whether canvas drafting is on for this project. The server says (`canvas-draft` availability); null from the
 * client means "not known yet", never "off", so a failed check is asked again (the mirror's rule). Nothing canvas-drafting
 * shows until it is exactly true: with it off, there is no upload, no draft button and no "new canvas".
 */
import { useEffect, useState } from 'react';
import { getCanvasDraftAvailability } from '@/app/data/canvas-draft-service';

/** Waits before re-asking after a failed check. */
const RETRY_MS = [1_000, 3_000, 9_000];

/** One answer for the whole session: the project flag does not change under a signed-in person. */
let settled: boolean | null = null;
let inflight: Promise<boolean | null> | null = null;

function ask(): Promise<boolean | null> {
  if (settled !== null) return Promise.resolve(settled);
  inflight ??= getCanvasDraftAvailability()
    .catch(() => null)
    .then((on) => {
      inflight = null;
      if (on !== null) settled = on;
      return on;
    });
  return inflight;
}

/** For tests: forget the session's answer. */
export function resetCanvasAvailability(): void {
  settled = null;
  inflight = null;
}

/** For the P955 gate fixtures only: pretend the server answered, so a fixture renders what the flag unlocks. */
export function seedCanvasAvailability(on: boolean): void {
  settled = on;
}

/** `active` false: nothing is asked (not a mirror, or not a canvas thread) and the answer is null. */
export function useCanvasDraftAvailability(active = true): boolean | null {
  const [on, setOn] = useState<boolean | null>(active ? settled : null);
  useEffect(() => {
    if (!active) return;
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (attempt: number) => {
      void ask().then((answer) => {
        if (stale) return;
        if (answer !== null) setOn(answer);
        else if (attempt < RETRY_MS.length) timer = setTimeout(() => check(attempt + 1), RETRY_MS[attempt]);
        else setOn(false);
      });
    };
    check(0);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [active]);
  return active ? on : null;
}
