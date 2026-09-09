import { useEffect } from "react";
import { SEO } from "@/app/components/seo";
import { useIframeLoadOverlay } from "@/components/ui/iframe-load-overlay";
import { analytics } from "@/lib/mixpanel";

const CALENDAR_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1vKcTEq34JPaaW2LGytox5iJL7xpYo32BVkivWxB6lbuoAPEOsmMlYb1z0OTE5rEy4yt1mSeIe?gv=true";

// P1019 extracted the overlay and every measurement behind it into
// components/ui/iframe-load-overlay.tsx, so /intro and /chiang-mai share one
// copy of the reasoning rather than two. Behaviour here is unchanged.

export function IntroPage() {
  const { iframeProps, overlay } = useIframeLoadOverlay({
    testId: "intro-calendar-loading",
    label: "Loading the booking calendar",
  });

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
          {...iframeProps}
        />
        {overlay}
      </div>
    </>
  );
}
