import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, CalendarDays, Users } from 'lucide-react';
import { EventCard } from './EventCard';
import { eventsService } from '@/app/data/events-service';
import { useAuth } from '@/auth';
import type { EventWithHost } from '@/app/types';
import { Button } from '@/components/ui/button';
import { WEBINAR_SERIES, filterWebinarSeries } from '@/app/data/webinar-series';

type Tab = 'upcoming' | 'past';

interface EventsListProps {
  /** Rendered inside another page (e.g. the Clarity Group Events tab):
   *  drops the page chrome — full-height background, page title, top padding —
   *  so the host page owns the heading and spacing. Behavior is identical. */
  embedded?: boolean;
  /** P1060: scope the list to one Clarity Group. Omitted → the standalone
   *  /events list, which keeps showing EVERY event, org-scoped or not. That is its
   *  job (spec Non-Goals) and the ALLOWED path gate 7c exists to protect. */
  orgId?: string;
  /** The scoped org's slug — carried onto /events/new so a created event knows its org. */
  orgSlug?: string;
  /** The scoped org's display name, used in the "Previously in …" divider. */
  orgName?: string;
  /** P1060 D4: may the viewer host INTO this org? Organizers of that org only.
   *  Only consulted when orgId is set; the standalone list stays open to any
   *  logged-in user. `membership_insert` lets any authenticated user join a public
   *  org in one click, so "any member" would be close to "anyone" — hence organizer. */
  canHost?: boolean;
}

export function EventsList({
  embedded = false,
  orgId,
  orgSlug,
  orgName,
  canHost = false,
}: EventsListProps = {}) {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [searchParams] = useSearchParams();
  const seriesParam = searchParams.get('series');
  const isSeriesFiltered = seriesParam === WEBINAR_SERIES.SERIES_PARAM;

  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithHost[]>([]);
  const [pastEvents, setPastEvents] = useState<EventWithHost[]>([]);
  const [userRsvps, setUserRsvps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const isOrgScoped = !!orgId;

  // When series filter is active, force upcoming tab so the filter is applied.
  // Without this, a user switching from /events (past tab) to ?series= would
  // see past events instead of the filtered upcoming sessions.
  useEffect(() => {
    if (isSeriesFiltered) setActiveTab('upcoming');
  }, [isSeriesFiltered]);

  useEffect(() => {
    async function fetchEvents() {
      const [upcoming, past] = await Promise.all([
        eventsService.getUpcomingEvents(orgId),
        eventsService.getPastEvents(orgId),
      ]);
      setUpcomingEvents(upcoming);
      setPastEvents(past);

      if (user) {
        const allEvents = [...upcoming, ...past];
        const rsvpChecks = await Promise.all(
          allEvents.map(event => eventsService.isUserRsvpd(event.id, user.id))
        );
        const rsvpSet = new Set<string>();
        allEvents.forEach((event, i) => {
          if (rsvpChecks[i]) rsvpSet.add(event.id);
        });
        setUserRsvps(rsvpSet);
      }

      setLoading(false);
    }
    fetchEvents();
  }, [user, orgId]);

  const seriesEvents = filterWebinarSeries(upcomingEvents);
  const filteredUpcoming = isSeriesFiltered
    ? seriesEvents.slice(0, 2)
    : upcomingEvents;
  // D6: an org with nothing upcoming but something in the past falls through to its
  // past events, under an explicit label — rather than showing an empty list.
  //
  // The Upcoming pill STAYS SELECTED while this happens. An earlier build switched
  // activeTab to 'past' here, which left the control lying: the pill highlight said
  // Past while the copy above it said "nothing coming up", so the page claimed two
  // different tabs were current at once and the viewer could not explain what they
  // were looking at. Falling through is a display decision about what to show under
  // the empty Upcoming state; it is not the user changing filters, so it must not
  // move the filter. Only in org context — the standalone /events list is unchanged.
  const fellThroughToPast =
    isOrgScoped && !loading && upcomingEvents.length === 0 && pastEvents.length > 0;
  const events =
    activeTab === 'upcoming'
      ? (fellThroughToPast ? pastEvents : filteredUpcoming)
      : pastEvents;
  const listIsEmpty = !loading && events.length === 0;
  // `&& !loading` is load-bearing for POSITION, not just visibility. The actions live
  // in two places depending on `listIsEmpty`, which is false while loading — so
  // without this they rendered top-right on first paint and then visibly jumped into
  // the centered empty block once the fetch resolved to zero events. Withholding them
  // until the list is known means they render once, already in their final position.
  // P1060 D4: in the org-page context the host actions belong to that org's
  // ORGANIZERS. Before this, the org page offered "Host Event" to any logged-in
  // visitor and filed an event that belonged to nothing — inviting a stranger to
  // host into a community they may not be part of. The standalone list is unchanged.
  const showActions = isOrgScoped
    ? canHost && !loading
    : isLoggedIn && !isSeriesFiltered && !loading;

  // Host / Co-create. Two positions, one definition:
  //  - list has events → top row, RIGHT of the filters (filters change what you see,
  //    actions change the data; an action inside the filter group misreads as a filter).
  //  - list is empty → INSIDE the centered empty block. With nothing to filter, a
  //    top-right action reads as page chrome instead of the one thing left to do —
  //    which is the treatment logged-out visitors already get via "Sign Up to Host".
  // P1193 REVERSES the previous rule here. That rule said Co-create accompanied Host
  // Event on every surface, embedded ones included. It no longer does.
  //
  // /co-create is the P62 collaborate page — the way to FIND someone to build an
  // event with. But `showActions` only renders these buttons in group context when
  // `canHost` is true, i.e. to an ORGANIZER of that group, who can already schedule
  // an event into it directly. The button was aimed at exactly the people with no
  // use for it. A group page now shows Host Event alone (founder, 2026-08-31).
  //
  // The STANDALONE list keeps both, unchanged — that is the screen a first-time host
  // who belongs to no group lands on, and Co-create is a real route in for them.
  // Removing it there would break the no-group hosting funnel, which is the most
  // expensive possible outcome of this change. Guarding on `isOrgScoped` here covers
  // all three call sites at once: the top row beside the filters (shared by both
  // lists), the group-scoped empty block, and the standalone empty block.
  //
  // Removed rather than deleted: showing Co-create to plain MEMBERS instead of
  // organizers is a live inversion the founder considered and deferred, not rejected.
  const actionButtons = (
    <div className="flex gap-2">
      {!isOrgScoped && (
      <Link to="/co-create">
        <Button variant="outline" className="gap-2">
          <Users className="w-4 h-4" />
          Co-create
        </Button>
      </Link>
      )}
      {/* Org context carries the org forward so the created event can be assigned
          org_id; the standalone link is untouched. */}
      <Link to={orgSlug ? `/events/new?org=${encodeURIComponent(orgSlug)}` : '/events/new'}>
        <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white">
          <Plus className="w-4 h-4" />
          Host Event
        </Button>
      </Link>
    </div>
  );

  return (
    <div className={embedded ? '' : 'min-h-screen bg-background'}>
      {/* Header */}
      <div className={embedded ? 'max-w-5xl mx-auto pb-4' : 'max-w-5xl mx-auto px-4 pt-6 pb-4'}>
        {!embedded && <h1 className="text-2xl font-bold mb-4">Events</h1>}

        {/* Tabs and Action Buttons Row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Tabs — hidden when series-filtered (only upcoming sessions matter in that context) */}
          {!isSeriesFiltered && (
            <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit" role="tablist" aria-label="Event filters">
              <button
                role="tab"
                aria-selected={activeTab === 'upcoming'}
                onClick={() => setActiveTab('upcoming')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'upcoming'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Upcoming{!loading && ` (${upcomingEvents.length})`}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'past'}
                onClick={() => setActiveTab('past')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'past'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Past{!loading && ` (${pastEvents.length})`}
              </button>
            </div>
          )}

          {/* Actions — hidden when series-filtered (funnel landing context) and when
              the list is empty (they render inside the empty block instead). */}
          {showActions && !listIsEmpty && actionButtons}
        </div>
      </div>

      {/* Events Grid */}
      <div className={embedded ? 'max-w-5xl mx-auto pb-6' : 'max-w-5xl mx-auto px-4 pb-6'}>
        {loading ? (
          <div className="text-center py-16">
            <div className="text-muted-foreground">Loading events...</div>
          </div>
        ) : events.length > 0 ? (
          <>
            {/* D6's explicit label. Deliberately avoids the phrase "No upcoming
                events" — that is the generic empty state this fall-through exists
                to replace, and repeating it here would reintroduce the dead end. */}
            {fellThroughToPast && activeTab === 'upcoming' && (
              <>
                {/* The empty Upcoming state is still SHOWN — it is a real fact about
                    this organization — but it is not a dead end: the past list
                    follows it under its own divider. Dashed border marks it as an
                    absence rather than a card. */}
                <div className="mb-6 rounded-lg border border-dashed border-border px-6 py-8 text-center">
                  <h3 className="text-base font-semibold">Nothing coming up yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nothing is scheduled right now. Here is what this group has hosted.
                  </p>
                </div>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {orgName ? `Previously in ${orgName}` : 'Previously'}
                  </span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
              </>
            )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                isLoggedIn={isLoggedIn}
                userId={user?.id}
                isUserGoing={userRsvps.has(event.id)}
              />
            ))}
          </div>
          </>
        ) : isOrgScoped ? (
          /* D6, second half: when an org has neither upcoming nor past events, ONE
             honest line — not a bare empty list, and not an invitation to host aimed
             at a visitor who may not host (D4). The host actions appear here only
             for an organizer of this org. */
          <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
            {upcomingEvents.length === 0 && pastEvents.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold">The first event is being planned</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  This group hasn&apos;t hosted an event yet. Join to hear when the
                  first one is scheduled.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">
                  {activeTab === 'upcoming' ? 'Nothing coming up yet' : 'Nothing in the past yet'}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {activeTab === 'upcoming'
                    ? 'Nothing is scheduled right now.'
                    : 'Events appear here once they have been held.'}
                </p>
              </>
            )}
            {/* NO Join button here, deliberately. The org header already carries this
                org's Join, on every org page, empty events tab or not — so a second
                control inside this block offers one action through two separate
                buttons in two different styles, and a visitor has to work out that
                they do the same thing. The reassurance line above points at the CTA
                that already exists rather than duplicating it. And never a Host CTA:
                joining is open, hosting is D4-gated to organizers. */}
            {showActions && <div className="mt-6 flex justify-center">{actionButtons}</div>}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <CalendarDays className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {isSeriesFiltered ? 'No upcoming sessions' : `No ${activeTab} events`}
            </h3>
            <p className="text-muted-foreground mb-6">
              {isSeriesFiltered
                ? 'Check back soon — new sessions are added regularly.'
                : activeTab === 'upcoming'
                  ? 'Check back later or host your own!'
                  : 'Past events will appear here after they conclude.'}
            </p>
            {/* P77: unauthenticated visitors get the signup CTA here. Authenticated
                users get the real actions here too — the header row drops them while
                the list is empty, so there is still exactly one action surface. */}
            {showActions ? (
              <div className="flex justify-center">{actionButtons}</div>
            ) : (
              !isSeriesFiltered && activeTab === 'upcoming' && !isLoggedIn && (
                <Link to="/signup">
                  <Button className="bg-blue-500 hover:bg-blue-600 text-white">
                    Sign Up to Host
                  </Button>
                </Link>
              )
            )}
          </div>
        )}
      </div>

      {/* CTA Section — only in unfiltered view */}
      {/* Never in org context: this block invites a signed-out visitor to host,
          which is exactly what D4 removes from the org page. */}
      {!isOrgScoped && !isSeriesFiltered && events.length > 0 && activeTab === 'upcoming' && !isLoggedIn && (
        <div className="max-w-5xl mx-auto px-4 pb-12">
          <div className="bg-blue-50 rounded-xl p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Want to host an event?</h2>
            <p className="text-muted-foreground mb-4">
              Sign up to create and host your own Clarity events.
            </p>
            <Link to="/signup">
              <Button className="bg-blue-500 hover:bg-blue-600 text-white">Sign Up to Host</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
