/**
 * @file iframe-load-overlay.tsx
 * @description The P1017 loading overlay for a cross-origin embed, extracted so
 * a second page can use it without a second copy of the reasoning.
 *
 * P1019 asked for exactly this: "if the pattern is worth sharing, extract it
 * there and reuse it here rather than writing a second copy." Every comment
 * below is P1017's, moved rather than rewritten — the measurements are that
 * fix's, taken against the real Google Calendar embed.
 *
 * Why an overlay and not a swap: the iframe stays mounted underneath, its
 * request already in flight, and nothing reflows when the overlay leaves. The
 * caller owns all sizing; this component adds none, so the page's own height
 * math is untouched.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ClarityLoader } from '@/components/ui/clarity-loader';

// How long to keep covering the embed AFTER its `load` event, while Google's own
// client-side app renders its content.
//
// A fixed constant is the wrong shape here. Any value is calibrated to one
// connection speed: 2200ms covered the measured gap on a fast link, but a slow
// client makes Google's render slower too, and the cover would run out mid-blank
// — exactly the bug this exists to remove.
//
// So derive it from the client's own demonstrated speed. How long the embed
// document itself took to fetch is a direct, already-measured proxy for how slow
// this particular visitor's connection is, and Google's subsequent render scales
// with the same conditions. Measured ratio on a fast cold load: fetch ~5.5s,
// render gap ~1.6s ~= 0.3. The multiplier is set above that with margin.
const FADE_RATIO = 0.45;
const FADE_MIN_MS = 2200; // never shorter than the fast-connection gap measured
const FADE_MAX_MS = 12000; // bounded so a stalled fetch can't pin the overlay up

export function fadeMsFor(fetchDurationMs: number): number {
  return Math.min(FADE_MAX_MS, Math.max(FADE_MIN_MS, Math.round(fetchDurationMs * FADE_RATIO)));
}

interface Options {
  /** `data-testid` on the overlay, so each page's canary can target its own. */
  testId: string;
  /** Announced to assistive tech while the embed loads. */
  label: string;
  /**
   * Changes whenever the caller points the iframe at a NEW url, which starts a
   * fresh navigation and re-opens the blank window this overlay exists to cover.
   *
   * Found by the code review of P1019: `/chiang-mai` swaps WEEK for AGENDA at the
   * 768px breakpoint while the page is open, so crossing that breakpoint — a
   * desktop resize, a phone rotation — reloaded the embed with the overlay
   * already gone, recreating the exact blank interval. Omit it on a page whose
   * src never changes (`/intro`).
   */
  resetKey?: unknown;
}

interface Result {
  /** Spread onto the `<iframe>`. */
  iframeProps: { onLoad: () => void };
  /** Render as the last child of a `relative` wrapper around the iframe. */
  overlay: ReactNode;
}

/**
 * Returns the `onLoad` handler for a cross-origin iframe and the overlay that
 * covers it until its content has plausibly painted.
 */
export function useIframeLoadOverlay({ testId, label, resetKey }: Options): Result {
  // The Suspense fallback in `LazyRoute` is bound to the lazy chunk fetch — it
  // unmounts the moment the chunk resolves, before the iframe's own request has
  // even started. Nobody owned the window in between, so the embed region
  // painted blank.
  const [embedLoaded, setEmbedLoaded] = useState(false);
  // `onLoad` is NOT "the calendar is on screen". Measured against the real embed
  // on a cold load, the iframe's load event fired at ~6.1s but Google's own app
  // did not paint until ~7.8s — so unmounting the overlay at `onLoad` handed the
  // visitor a *second* blank window of ~1.6s. Cross-origin means there is no
  // signal for "Google finished painting", so instead of guessing a moment to
  // disappear, the overlay fades: the embed shows through progressively as it
  // paints, and pointer-events are released immediately so a calendar that IS
  // ready is never held behind a spinner. Worst case is a transparent,
  // non-interactive layer — nothing here can strand the visitor.
  const [overlayGone, setOverlayGone] = useState(false);
  // Set at `onLoad` from how long the embed's own fetch took — see fadeMsFor.
  const [fadeMs, setFadeMs] = useState(FADE_MIN_MS);
  // Wall-clock at which the iframe began loading. A ref, not state: writing it
  // must not re-render, and it is read exactly once.
  const embedStartedAt = useRef<number>(performance.now());

  // A new src means a new load. Reset to the covering state and restart the
  // fetch clock, so the fade is scaled to THIS navigation rather than the first.
  // Skips the initial render: the state above already starts covered, and
  // resetting there would only re-set the same values.
  //
  // `useLayoutEffect`, not `useEffect` — found by codex's review of this fix.
  // The caller (e.g. `/chiang-mai`) computes the new iframe `src` directly from
  // the same state that changes `resetKey`, so both land in the SAME commit:
  // the DOM already shows the new (blank) iframe before this effect has run. A
  // passive effect fires only after the browser has painted that commit, so the
  // reset would arrive one paint too late — exactly the blank frame this whole
  // fix exists to remove. A layout effect's `setState` is flushed synchronously
  // before the browser paints, so the overlay is back up before the blank
  // iframe is ever shown to the visitor.
  const firstRun = useRef(true);
  useLayoutEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    embedStartedAt.current = performance.now();
    setFadeMs(FADE_MIN_MS);
    setEmbedLoaded(false);
    setOverlayGone(false);
  }, [resetKey]);

  useEffect(() => {
    if (!embedLoaded) return;
    // Backstop for `transitionend` never firing (reduced-motion, background tab,
    // interrupted transition). Slightly longer than the fade itself.
    const t = setTimeout(() => setOverlayGone(true), fadeMs + 300);
    return () => clearTimeout(t);
  }, [embedLoaded, fadeMs]);

  const iframeProps = {
    // The embed is cross-origin, so its internal state is unreadable — `onLoad`
    // is the only signal available, and it fires on document load regardless of
    // origin.
    onLoad: () => {
      // Scale the post-load cover to this client's demonstrated speed.
      setFadeMs(fadeMsFor(performance.now() - embedStartedAt.current));
      setEmbedLoaded(true);
    },
  };

  const overlay = overlayGone ? null : (
    <div
      data-testid={testId}
      // The visual loader is the whole point; without a live region a
      // screen-reader user gets the pre-fix experience — no signal that anything
      // is loading, and none that it finished.
      role="status"
      aria-live="polite"
      aria-label={label}
      // Once the fade starts the overlay is decorative cover, not status — and it
      // must stop intercepting clicks on an embed that may already be usable.
      aria-hidden={embedLoaded || undefined}
      // Guarded — found by codex's SECOND-pass review of this fix. `resetKey`
      // re-covers the overlay by flipping `embedLoaded` back to false, which
      // reverses this same `transition-opacity` from 0 back to 100 — and that
      // reverse transition ALSO fires `transitionend`. An unconditional handler
      // treated that as "the fade-out finished" and unmounted the overlay it had
      // just put back up, exposing the new (still-loading) iframe. Only the
      // forward fade-to-transparent (embedLoaded true) means "safe to unmount";
      // `currentTarget` ignores a transition bubbling up from a child.
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (embedLoaded) setOverlayGone(true);
      }}
      style={{ transitionDuration: `${fadeMs}ms` }}
      className={`absolute inset-0 bg-background transition-opacity ease-out ${
        embedLoaded ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Centring inside the overlay would put the spinner at the middle of a box
          up to 1000px tall — on a 320x700 phone that lands within ~110px of the
          bottom edge, and below the fold on anything shorter. It would still
          satisfy `toBeVisible()` while the visitor saw an empty screen, which is
          the exact bug. `sticky` centres it in the *visible* slice of the box
          instead, at every viewport height. */}
      <div className="sticky top-0 flex h-[100dvh] max-h-full items-center justify-center">
        <ClarityLoader size="lg" />
      </div>
    </div>
  );

  return { iframeProps, overlay };
}
