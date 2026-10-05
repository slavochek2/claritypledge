import { useEffect, useState, useSyncExternalStore } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when the visitor asked for less motion. Read synchronously so the first paint is already right. */
export function usePrefersStill(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

export interface Viewport {
  w: number;
  h: number;
}

/** Window size, updated on resize. Scroll-driven beats remount on a size bucket change. */
export function useViewport(): Viewport {
  const [size, setSize] = useState<Viewport>(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize({ w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return size;
}

/** Deterministic pseudo-random in [0, 1) so the dissolve looks the same on every visit. */
export function seeded(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
