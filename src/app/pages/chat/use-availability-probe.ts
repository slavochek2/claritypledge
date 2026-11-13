/**
 * The ask-with-retries loop shared by the canvas and Clarify availability hooks: null from `ask` means "not known yet", never "off", so it is asked
 * again after each wait in RETRY_MS. `exhausted` is what to answer when the retries ran out (omit it to keep answering null).
 */
import { useEffect, useState } from 'react';

/** Waits before re-asking after a failed check. */
const RETRY_MS = [1_000, 3_000, 9_000];

/** `active` false: nothing is asked and the answer is null. `initial` is the session's answer so far (what a mounting component starts from). */
export function useAvailabilityProbe(
  active: boolean,
  initial: boolean | null,
  ask: () => Promise<boolean | null>,
  exhausted?: boolean,
): boolean | null {
  const [on, setOn] = useState<boolean | null>(active ? initial : null);
  useEffect(() => {
    if (!active) return;
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (attempt: number) => {
      void ask().then((answer) => {
        if (stale) return;
        if (answer !== null) setOn(answer);
        else if (attempt < RETRY_MS.length) timer = setTimeout(() => check(attempt + 1), RETRY_MS[attempt]);
        else if (exhausted !== undefined) setOn(exhausted);
      });
    };
    check(0);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [active, ask, exhausted]);
  return active ? on : null;
}
