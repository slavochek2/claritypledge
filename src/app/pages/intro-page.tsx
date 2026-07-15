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
      <SEO title="Book an intro call" url="/intro" noIndex />
      <iframe
        src={CALENDAR_URL}
        width="100%"
        style={{ border: 0, height: "calc(100dvh - 9rem)", minHeight: "580px" }}
        title="Book an intro call"
      />
    </>
  );
}
