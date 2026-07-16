/**
 * Diagonal TEMPLATE watermark for AgreementCertificate previews.
 * Wrap the certificate in a `relative` container and render this inside it —
 * marks demo certificates (Einstein/Teresa) so they don't read as real signed
 * agreements. Single source for the stamp style (was duplicated on
 * /partner-template and the coach landing).
 *
 * `animate`: when set, the stamp slams in (rotate + scale overshoot) the first
 * time it scrolls into view — the rubber-stamp beat from the talk deck. Default
 * is static (unchanged behavior for /partner-template). Falls back to the static
 * stamped state when IntersectionObserver is unavailable or the user prefers
 * reduced motion, so it's always present and legible.
 */
import { useEffect, useRef, useState } from "react";

export function TemplateStamp({ animate = false }: { animate?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Static unless we're animating: when not animating, render the final stamped
  // state from frame one (the /partner-template look, byte-for-byte the same).
  const [stamped, setStamped] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setStamped(true);
      return;
    }
    // Trigger on the VIEWPORT, never on a ratio of this element. `threshold` is a
    // fraction of the OBSERVED ELEMENT, and this stamp renders ~867px wide (text-5xl +
    // tracking-[0.2em] + whitespace-nowrap, and 2.7x scaled before it lands). The old
    // `threshold: 0.6` was therefore unreachable below ~520px: at 375px the greatest
    // possible ratio is 375/867 = 0.43 (measured), so the callback never fired and the
    // only visual "this is a sample" marker on the demo agreement stayed at opacity 0
    // on every phone. Desktop reached 1.0, which is why it went unnoticed.
    // A negative rootMargin shrinks the ROOT instead: it fires when the stamp reaches
    // the middle band of the screen — same "stamp lands as you look at it" beat, but
    // the element's own size can no longer defeat it.
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStamped(true);
          ob.disconnect();
        }
      },
      { threshold: 0, rootMargin: "-25% 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [animate]);

  return (
    <>
      <div
        ref={ref}
        className="absolute top-1/2 left-1/2 pointer-events-none select-none"
        style={{
          transform: stamped
            ? "translate(-50%, -50%) rotate(-12deg) scale(1)"
            : "translate(-50%, -50%) rotate(-26deg) scale(2.7)",
          opacity: stamped ? 1 : 0,
          // back-out overshoot = the impact of a stamp landing; only when animating
          transition: animate
            ? "transform 440ms cubic-bezier(.34,1.56,.64,1), opacity 260ms ease-out"
            : undefined,
        }}
        aria-hidden="true"
      >
        <span className="text-5xl md:text-6xl font-bold uppercase tracking-[0.2em] text-[#002B5C]/10 whitespace-nowrap">
          Template
        </span>
      </div>
      {/* Decorative stamp above is aria-hidden — without this, assistive tech gets
          a signed-looking agreement with zero indication it's a mock. */}
      <span className="sr-only">Template — sample agreement, not a real signed document</span>
    </>
  );
}
