import { useEffect, useRef, type RefObject } from "react";
import { useInView } from "framer-motion";

/**
 * Calls `onSeen` once per mount, when at least 35% of the element is on screen (the threshold the
 * exchanges use for their own view events) and `enabled` is true.
 */
export function useSeenOnce(ref: RefObject<Element | null>, onSeen: () => void, enabled = true) {
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const fired = useRef(false);
  const latest = useRef(onSeen);
  latest.current = onSeen;
  useEffect(() => {
    if (!inView || !enabled || fired.current) return;
    fired.current = true;
    latest.current();
  }, [inView, enabled]);
}
