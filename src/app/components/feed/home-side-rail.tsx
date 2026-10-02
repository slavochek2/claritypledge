/**
 * P1392: the desktop-only right column beside the feed on "/" — the next event and a way
 * into groups. Deliberately two cards, not a LinkedIn-style dashboard: phones (most
 * visitors) never render it, and blog / manifesto / use cases already live in the menu.
 * The page's one primary action stays the header CTA (P955), so nothing here is a
 * filled button. It starts level with the first feed card (founder, 2026-10-02), below search, tags and tabs,
 * so the feed reads first.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LandmarkIcon } from "lucide-react";
import { eventsService } from "@/app/data/events-service";
import type { EventWithHost } from "@/app/types";
import { EventRowCompact } from "@/app/components/shared/EventRowCompact";
import { EVENTS_LIST_TO, EVENTS_NAV_TO } from "@/app/components/layout/nav-links";

const MAX_EVENTS = 2;

const DESKTOP_QUERY = "(min-width: 1024px)"; // Tailwind lg

/** Mounted only at lg+, so phones never pay for an events fetch they cannot see. */
export function HomeSideRail() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(DESKTOP_QUERY).matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop ? <HomeSideRailContent /> : null;
}

function HomeSideRailContent() {
  // null = loading, "error" = fetch failed (never shown as an empty calendar)
  const [events, setEvents] = useState<EventWithHost[] | null | "error">(null);

  useEffect(() => {
    let cancelled = false;
    eventsService
      .getUpcomingEvents()
      .then((rows) => {
        if (!cancelled) setEvents(rows.filter((e) => e.status === "upcoming").slice(0, MAX_EVENTS));
      })
      .catch(() => {
        if (!cancelled) setEvents("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="hidden lg:block w-72 shrink-0 space-y-4 lg:mt-[9.9375rem]" aria-label="Events and groups" data-testid="home-side-rail">
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Next events</h2>
        {events === null ? (
          <div className="h-12 rounded bg-muted animate-pulse" />
        ) : events === "error" ? (
          <p className="text-sm text-muted-foreground">Couldn't load events.</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events scheduled yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <EventRowCompact key={e.id} event={e} role="none" />
            ))}
          </div>
        )}
        <Link to={EVENTS_LIST_TO} className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          All events
        </Link>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
          <LandmarkIcon className="w-4 h-4" aria-hidden /> Groups
        </h2>
        <p className="text-sm text-muted-foreground mb-3">Communities that practice clear communication together.</p>
        <Link to={EVENTS_NAV_TO} className="text-sm text-blue-600 hover:underline">
          Explore groups
        </Link>
      </section>
    </aside>
  );
}
