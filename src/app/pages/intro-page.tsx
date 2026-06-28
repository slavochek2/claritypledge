import { useEffect } from "react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";

const CALENDAR_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0pH1jWUa8-Z3RDlKG7JdEf2S8ImaEpcFN1FJd362abEJ-7GC19kmOMexlThT4ardMD9NqzB0mm?gv=true";

export function IntroPage() {
  useEffect(() => {
    analytics.track("intro_page_viewed", {
      referrer: document.referrer || "direct",
    });
  }, []);

  return (
    <div className="min-h-screen py-8 px-4">
      <SEO
        title="Book an intro call"
        url="/intro"
        noIndex
      />
      <div className="container mx-auto">
        <iframe
          src={CALENDAR_URL}
          width="100%"
          height="700"
          style={{ border: 0 }}
          title="Book an intro call"
        />
      </div>
    </div>
  );
}
