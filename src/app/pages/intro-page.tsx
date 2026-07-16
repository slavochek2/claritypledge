import { useEffect } from "react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";

const CALENDAR_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1vKcTEq34JPaaW2LGytox5iJL7xpYo32BVkivWxB6lbuoAPEOsmMlYb1z0OTE5rEy4yt1mSeIe?gv=true";

export function IntroPage() {
  useEffect(() => {
    analytics.track("intro_page_viewed", {
      referrer: document.referrer || "direct",
    });
  }, []);

  return (
    <>
      <SEO title="Book your free alignment audit" url="/intro" noIndex />
      {/* P987: name the audit here. The landing CTA promises "Book your free alignment
          audit"; this page used to be a bare calendar embed with no copy at all, so the
          promise broke at the moment of highest intent. Wording mirrors the landing hero's
          microcopy so the two can't drift. */}
      <div className="mx-auto max-w-xl px-4 pt-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Book your free alignment audit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Starts with a 15-minute call. We find the blind spot in how you get aligned with your team.
        </p>
      </div>
      {/* The embed needs MORE height on a phone than on a desktop, which one flat
          minHeight cannot express: Google stacks the picker vertically below ~520px
          (month grid, then day nav, then slots) but lays it out horizontally above.
          A single `minHeight: 580px` floored every phone to 580 — enough for the header
          and exactly one date row, which is the struck-through past week. Measured at
          320x700: the month grid alone needs ~880px, so a visitor arriving from the
          site's primary CTA saw no selectable slot at all and could not book.
          The min-h floor now splits at the same breakpoint the embed does; `height`
          still lets tall desktop viewports drive. */}
      <iframe
        src={CALENDAR_URL}
        width="100%"
        className="min-h-[1000px] sm:min-h-[580px]"
        style={{ border: 0, height: "calc(100dvh - 15rem)" }}
        title="Book your free alignment audit"
      />
    </>
  );
}
