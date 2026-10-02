/**
 * P1392: the desktop-only right column beside the feed on "/" — the next event and a way
 * into groups. Deliberately two cards, not a LinkedIn-style dashboard: phones (most
 * visitors) never render it, and blog / manifesto / use cases already live in the menu.
 * The page's one primary action stays the header CTA (P955), so nothing here is a
 * filled button. It starts level with the tab bar (founder, 2026-10-02), below search + tags,
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

export function HomeSideRail() {
  const [events, setEvents] = useState<EventWithHost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    eventsService
      .getUpcomingEvents()
      .then((rows) => {
        if (!cancelled) setEvents(rows.filter((e) => e.status === "upcoming").slice(0, MAX_EVENTS));
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="hidden lg:block w-72 shrink-0 space-y-4 lg:mt-[5.875rem]" aria-label="Events and groups" data-testid="home-side-rail">
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Next events</h2>
        {events === null ? (
          <div className="h-12 rounded bg-muted animate-pulse" />
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
