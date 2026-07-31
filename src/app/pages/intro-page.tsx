import { useEffect, useState } from "react";
import { SEO } from "@/app/components/seo";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { analytics } from "@/lib/mixpanel";

const CALENDAR_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1vKcTEq34JPaaW2LGytox5iJL7xpYo32BVkivWxB6lbuoAPEOsmMlYb1z0OTE5rEy4yt1mSeIe?gv=true";

// Derived from measurement, not taste: the gap between the embed's `load` event
// and Google's picker actually painting was ~1.6s on a cold load over a fast
// connection. The fade spans that gap. Being wrong is cheap in both directions —
// too short only shortens the cover, too long only means a faint overlay over an
// already-visible, already-clickable calendar.
// Measured: 1500ms left a ~200ms blank sliver because the picker painted at
// load+1.7s. 2200ms clears the measured gap with margin.
const OVERLAY_FADE_MS = 2200;

export function IntroPage() {
  // P1017: the embed is this page's only content, and `LazyRoute`'s Suspense
  // fallback is bound to the lazy chunk fetch — it unmounts the moment the chunk
  // resolves, before the iframe's own request has even started. Nobody owned the
  // window in between, so the whole content area painted blank (measured: zero
  // elements with visible text below the logo nav).
  const [embedLoaded, setEmbedLoaded] = useState(false);
  // P1017 (second pass): `onLoad` is NOT "the calendar is on screen". Measured
  // against the real embed on a cold load, the iframe's load event fired at
  // ~6.1s but Google's own app did not paint its picker until ~7.8s — so
  // unmounting the overlay at `onLoad` handed the visitor a *second* blank
  // window of ~1.6s. Cross-origin means there is no signal for "Google finished
  // painting", so instead of guessing a moment to disappear, the overlay fades:
  // the calendar shows through progressively as it paints, and pointer-events
  // are released immediately so a calendar that IS ready is never held behind a
  // spinner. Nothing here can strand the visitor — worst case is a transparent,
  // non-interactive layer.
  const [overlayGone, setOverlayGone] = useState(false);

  useEffect(() => {
    if (!embedLoaded) return;
    // Backstop for `transitionend` never firing (reduced-motion, background tab,
    // interrupted transition). Slightly longer than the fade itself.
    const t = setTimeout(() => setOverlayGone(true), OVERLAY_FADE_MS + 300);
    return () => clearTimeout(t);
  }, [embedLoaded]);

  useEffect(() => {
    analytics.track("intro_page_viewed", {
      referrer: document.referrer || "direct",
    });
  }, []);

  return (
    <>
      <SEO title="Book your free alignment audit" url="/intro" noIndex />
      {/* No custom heading here. P987 added one because the page "used to be a bare
          calendar embed with no copy at all" — but the embed now carries its own title
          ("Start your free alignment audit with a 15-min intro") plus a description, so a
          custom block only duplicates it back-to-back at the highest-intent moment. The
          embed's own copy (set in Google Calendar) names the audit and honours the CTA. */}
      {/* The embed needs MORE height on a phone than on a desktop, which one flat
          minHeight cannot express: Google stacks the picker vertically below ~520px
          (month grid, then day nav, then slots) but lays it out horizontally above.
          A single `minHeight: 580px` floored every phone to 580 — enough for the header
          and exactly one date row, which is the struck-through past week. Measured at
          320x700: the month grid alone needs ~880px, so a visitor arriving from the
          site's primary CTA saw no selectable slot at all and could not book.
          The min-h floor now splits at the same breakpoint the embed does; `height`
          still lets tall desktop viewports drive. */}
      {/* P1017: `relative` only — the wrapper carries no sizing of its own, so the
          height math above stays entirely on the iframe and the overlay can never
          push the embed around. `block` on the iframe drops the inline-replaced
          baseline gap (a few px of slack under the frame); the wrapper tracked the
          iframe's height either way, so this is tidiness, not a load-bearing part
          of the fix. */}
      <div className="relative mt-6">
        <iframe
          src={CALENDAR_URL}
          width="100%"
          className="block min-h-[1000px] sm:min-h-[580px]"
          style={{ border: 0, height: "calc(100dvh - 15rem)" }}
          title="Book your free alignment audit"
          // The embed is cross-origin, so its internal state is unreadable —
          // `onLoad` is the only signal available, and it fires on document load
          // regardless of origin.
          onLoad={() => setEmbedLoaded(true)}
        />
        {!overlayGone && (
          // Overlay, not a swap: the iframe stays mounted underneath (its request
          // is already in flight) and nothing reflows when this leaves.
          // `ClarityLoader`, not `ClarityPageLoader` — the latter is a page-level
          // gate whose `min-h-screen` would drop the spinner below the fold inside
          // an already-rendered layout (decisions.md 2026-04-11 [technical]).
          <div
            data-testid="intro-calendar-loading"
            // The visual loader is the whole point of this fix; without a live
            // region a screen-reader user gets the pre-fix experience — no signal
            // that anything is loading, and none that it finished.
            role="status"
            aria-live="polite"
            aria-label="Loading the booking calendar"
            // Once the fade starts the overlay is decorative cover, not status —
            // and it must stop intercepting clicks on a calendar that may already
            // be usable underneath it.
            aria-hidden={embedLoaded || undefined}
            onTransitionEnd={() => setOverlayGone(true)}
            style={{ transitionDuration: `${OVERLAY_FADE_MS}ms` }}
            className={`absolute inset-0 bg-background transition-opacity ease-out ${
              embedLoaded ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            {/* Centring inside the overlay would put the spinner at the middle of a
                box up to 1000px tall — on a 320x700 phone that lands within ~110px
                of the bottom edge, and below the fold on anything shorter. It would
                still satisfy `toBeVisible()` while the visitor saw an empty screen,
                which is the exact bug. `sticky` centres it in the *visible* slice of
                the box instead, at every viewport height. */}
            <div className="sticky top-0 flex h-[100dvh] max-h-full items-center justify-center">
              <ClarityLoader size="lg" />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
