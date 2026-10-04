/**
 * P1392 → P1401: the home page's two pointers — OUR next events and the groups, by name.
 * One content, two placements (founder, 2026-10-04: "very often I want to go immediately to
 * see events or to show a group"; phones showed neither):
 *   - desktop (lg+): the right column, Groups first, then Next events, level with the first card;
 *   - phones/tablets: a compact block at the top of the page, above search.
 * Exactly one placement is mounted for the current width, so each visit fetches once.
 * Nothing here is a filled button — the page's one primary action stays the header CTA (P955).
 * Any failure degrades to a short line; the feed never waits on, or breaks because of, this.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDaysIcon, LandmarkIcon } from "lucide-react";
import { eventsService } from "@/app/data/events-service";
import { organizationsService } from "@/app/data/organizations-service";
import type { EventWithHost } from "@/app/types";
import type { Organization } from "@/app/data/organizations-service.interface";
import { EventRowCompact } from "@/app/components/shared/EventRowCompact";
import { EVENTS_LIST_TO, EVENTS_NAV_TO } from "@/app/components/layout/nav-links";

const MAX_EVENTS = 2;
/** A growing directory must never take over the page; the rest sit behind "All groups". */
const MAX_GROUPS = 3;
const DESKTOP_QUERY = "(min-width: 1024px)"; // Tailwind lg

function useIsDesktop(): boolean {
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
  return isDesktop;
}

type Loaded<T> = T[] | null | "error"; // null = loading

function useHomeHighlights() {
  const [events, setEvents] = useState<Loaded<EventWithHost>>(null);
  const [groups, setGroups] = useState<Loaded<Organization>>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let orgs: Organization[];
      try {
        orgs = (await organizationsService.listPublicOrganizations()).slice(0, MAX_GROUPS);
      } catch {
        if (!cancelled) {
          setGroups("error");
          setEvents("error");
        }
        return;
      }
      if (cancelled) return;
      setGroups(orgs);
      // "Our next event" = the next event of OUR groups (review, P1401): an unscoped query
      // would let any account's event become the one featured here. Only events that have
      // not started yet — the service's 12-hour grace window would otherwise show last
      // night's Clarity Night as "next" the morning after.
      const perGroup = await Promise.all(orgs.map((o) => eventsService.getUpcomingEvents(o.id).catch(() => [])));
      if (cancelled) return;
      const now = Date.now();
      const seen = new Set<string>();
      const next = perGroup
        .flat()
        .filter((e) => e.status === "upcoming" && new Date(e.datetime).getTime() > now)
        .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
        .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
        .slice(0, MAX_EVENTS);
      setEvents(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { events, groups };
}

function EventsList({ events, max = MAX_EVENTS }: { events: Loaded<EventWithHost>; max?: number }) {
  if (events === null) return <div className="h-[70px] rounded-lg bg-muted animate-pulse" />;
  if (events === "error") return <p className="text-sm text-muted-foreground">Couldn't load events.</p>;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events scheduled yet.</p>;
  return (
    <div className="space-y-2">
      {events.slice(0, max).map((e) => (
        <EventRowCompact key={e.id} event={e} role="none" detailed />
      ))}
    </div>
  );
}

function GroupLinks({ groups }: { groups: Loaded<Organization> }) {
  if (groups === null) return <div className="h-10 rounded-full bg-muted animate-pulse" />;
  if (groups === "error" || groups.length === 0) return null; // "All groups" still shows
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => (
        <Link
          key={g.id}
          to={`${EVENTS_NAV_TO}/${g.slug}`}
          className={`inline-flex min-h-10 items-center rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted max-w-full py-1.5`}
        >
          {g.name}
        </Link>
      ))}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof LandmarkIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
      <Icon className="w-4 h-4" aria-hidden /> {children}
    </h2>
  );
}

function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-block text-sm text-blue-600 hover:underline">
      {children}
    </Link>
  );
}

/** Desktop: the right column beside the feed. */
export function HomeSideRail() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <RailContent /> : null;
}

function RailContent() {
  const { events, groups } = useHomeHighlights();
  return (
    <aside className="w-72 shrink-0 space-y-4 lg:mt-[9.9375rem]" aria-label="Groups and events" data-testid="home-side-rail">
      <section className="rounded-lg border border-border p-4 space-y-3">
        <SectionTitle icon={LandmarkIcon}>Groups</SectionTitle>
        <GroupLinks groups={groups} />
        <MoreLink to={EVENTS_NAV_TO}>All groups</MoreLink>
      </section>
      <section className="rounded-lg border border-border p-4 space-y-3">
        <SectionTitle icon={CalendarDaysIcon}>Next events</SectionTitle>
        <EventsList events={events} />
        <MoreLink to={EVENTS_LIST_TO}>All events</MoreLink>
      </section>
    </aside>
  );
}

/** Phones and tablets: the same two lists, compact, at the top of the page. */
export function HomeTopBlock() {
  const isDesktop = useIsDesktop();
  return isDesktop ? null : <TopContent />;
}

function TopContent() {
  const { events, groups } = useHomeHighlights();
  return (
    <section aria-label="Next events and groups" data-testid="home-top-block" className="mb-4 space-y-3 rounded-lg border border-border p-3">
      {!(Array.isArray(events) && events.length === 0) && events !== "error" && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle icon={CalendarDaysIcon}>Next event</SectionTitle>
          <MoreLink to={EVENTS_LIST_TO}>All events</MoreLink>
        </div>
        {/* Phones: just the next one, so the stories stay close to the top. */}
        <EventsList events={events} max={1} />
      </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle icon={LandmarkIcon}>Groups</SectionTitle>
          <MoreLink to={EVENTS_NAV_TO}>All groups</MoreLink>
        </div>
        <GroupLinks groups={groups} />
      </div>
    </section>
  );
}
