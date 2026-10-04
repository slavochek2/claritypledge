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
import { EventCard } from "@/app/prototypes/events/components/EventCard";
import { OrgInitials } from "@/app/components/organizations/org-initials";
import { useAuth } from "@/auth";
import { EVENTS_LIST_TO, EVENTS_NAV_TO } from "@/app/components/layout/nav-links";

const MAX_EVENTS = 2;
/** A growing directory must never take over the page; the rest sit behind "All groups". */
const MAX_GROUPS = 2;
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

/** The SAME card the events pages use (banner picture, date, title, host, place, going) —
 *  P1401 design pass: the home page must not invent its own look for an event.
 *  `row` (phones): a sideways row that snaps card by card, the next card peeking so it is
 *  obvious there is more (the myCNX "swipeable rows" pattern; no swiping inside a card). */
function EventsList({ events, row = false }: { events: Loaded<EventWithHost>; row?: boolean }) {
  const { user } = useAuth();
  if (events === null) return <div className="aspect-video w-full rounded-xl bg-muted animate-pulse" />;
  if (events === "error") return <p className="text-sm text-muted-foreground">Couldn't load events.</p>;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events scheduled yet.</p>;
  const cards = events.map((e) => (
    <div key={e.id} className={row && events.length > 1 ? "w-[85%] shrink-0 snap-start" : ""}>
      <EventCard event={e} isLoggedIn={!!user} userId={user?.id} />
    </div>
  ));
  if (row && events.length > 1) {
    return <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">{cards}</div>;
  }
  return <div className="space-y-3">{cards}</div>;
}

/** Each group as a small version of the groups-page card: the same initials tile, name,
 *  border and hover — not a pill style of its own. */
function GroupLinks({ groups }: { groups: Loaded<Organization> }) {
  if (groups === null) return <div className="h-[68px] rounded-lg bg-muted animate-pulse" />;
  if (groups === "error" || groups.length === 0) return null; // "All groups" still shows
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <Link
          key={g.id}
          to={`${EVENTS_NAV_TO}/${g.slug}`}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-all duration-200 hover:border-blue-500/50 hover:shadow-lg"
        >
          <OrgInitials name={g.name} />
          <span className="min-w-0 text-sm font-semibold text-foreground">{g.name}</span>
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
      <section className="space-y-3">
        <SectionTitle icon={LandmarkIcon}>Groups</SectionTitle>
        <GroupLinks groups={groups} />
        <MoreLink to={EVENTS_NAV_TO}>All groups</MoreLink>
      </section>
      <section className="space-y-3">
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
    <section aria-label="Next events and groups" data-testid="home-top-block" className="mb-6 space-y-5">
      {!(Array.isArray(events) && events.length === 0) && events !== "error" && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle icon={CalendarDaysIcon}>Next events</SectionTitle>
          <MoreLink to={EVENTS_LIST_TO}>All events</MoreLink>
        </div>
        {/* Phones: just the next one, so the stories stay close to the top. */}
        <EventsList events={events} row />
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
