/**
 * /founder's two event-aware actions, in the fable look (P1674; behaviour from P958, P969, P1392).
 *
 * WebinarCTA: when an upcoming event exists, "Join the next Clarity Experiment" → the registration
 * URL; when none exists, "Book a 15-min discovery call" → /intro (no broken promise of a "next"
 * session that does not exist). Both buttons send `webinar_cta_clicked` with location "hero" (the
 * value the old layout sent, the button size) and `has_event`.
 * WebinarDateLine: the next event's date in the visitor's timezone, only when one exists.
 */
import { ArrowRightIcon, CalendarIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { formatLocalTime } from "@/app/utils/format-time";
import { WEBINAR_CTA_LABEL, WEBINAR_REGISTER_URL } from "@/app/content/webinar";
import type { EventWithHost } from "@/app/types";
import { FableButton } from "@/app/components/landing/fable/fable-parts";

export function WebinarCTA({ hasEvent, tone = "primary" }: { hasEvent: boolean; tone?: "primary" | "inverse" }) {
  const onClick = () => analytics.track("webinar_cta_clicked", { location: "hero", has_event: hasEvent });
  if (!hasEvent) {
    return (
      <FableButton to="/intro" onClick={onClick} tone={tone}>
        <CalendarIcon className="w-5 h-5 shrink-0" />
        Book a 15-min discovery call
      </FableButton>
    );
  }
  return (
    <FableButton to={WEBINAR_REGISTER_URL} onClick={onClick} tone={tone}>
      {WEBINAR_CTA_LABEL}
      <ArrowRightIcon className="w-5 h-5 shrink-0" />
    </FableButton>
  );
}

export function WebinarDateLine({ event, tone = "primary" }: { event: EventWithHost | null; tone?: "primary" | "inverse" }) {
  if (!event) return null;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? "Berlin";
  const weekday = new Date(event.datetime).toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
  const date = new Date(event.datetime).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
  const time = formatLocalTime(event.datetime, { timeZone: tz });
  return (
    <p className={`text-sm ${tone === "inverse" ? "text-blue-100" : "text-foreground/70"}`}>
      Live · {weekday}, {date} · {time} {city} time
    </p>
  );
}
