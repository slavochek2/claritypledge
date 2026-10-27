import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** 0 → target on scroll-in. Starts at the real target so a page whose JS never animates
 *  still shows the right number (see program-page.tsx). Shared by /hospitals and /change-managers. */
export function CountUpPercent({ target }: { target: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [val, setVal] = useState(target);
  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(0, target, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setVal(Math.round(v)) });
    return () => controls.stop();
  }, [inView, target, reduce]);
  return <span ref={ref}>{val}%</span>;
}
