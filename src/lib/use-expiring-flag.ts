import { useCallback, useEffect, useRef, useState } from 'react';

/** A flag that turns itself off `ms` after the latest `mark()`; `clear()` turns it off at once. */
export function useExpiringFlag(ms: number) {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const clear = useCallback(() => { stop(); setOn(false); }, []);
  const mark = useCallback(() => {
    stop();
    setOn(true);
    timer.current = setTimeout(() => { timer.current = null; setOn(false); }, ms);
  }, [ms]);
  useEffect(() => stop, []);
  return { on, mark, clear };
}
