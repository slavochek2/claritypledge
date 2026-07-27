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
  /** Rendered inside another page (e.g. the Clarity Organization Events tab):
   *  drops the page chrome — full-height background, page title, top padding —
   *  so the host page owns the heading and spacing. Behavior is identical. */
  embedded?: boolean;
}

export function EventsList({ embedded = false }: EventsListProps = {}) {
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

  // When series filter is active, force upcoming tab so the filter is applied.
  // Without this, a user switching from /events (past tab) to ?series= would
  // see past events instead of the filtered upcoming sessions.
  useEffect(() => {
    if (isSeriesFiltered) setActiveTab('upcoming');
  }, [isSeriesFiltered]);

  useEffect(() => {
    async function fetchEvents() {
      const [upcoming, past] = await Promise.all([
        eventsService.getUpcomingEvents(),
        eventsService.getPastEvents(),
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
  }, [user]);

  const seriesEvents = filterWebinarSeries(upcomingEvents);
  const filteredUpcoming = isSeriesFiltered
    ? seriesEvents.slice(0, 2)
    : upcomingEvents;
  const events = activeTab === 'upcoming' ? filteredUpcoming : pastEvents;
  const listIsEmpty = !loading && events.length === 0;
  // `&& !loading` is load-bearing for POSITION, not just visibility. The actions live
  // in two places depending on `listIsEmpty`, which is false while loading — so
  // without this they rendered top-right on first paint and then visibly jumped into
  // the centered empty block once the fetch resolved to zero events. Withholding them
  // until the list is known means they render once, already in their final position.
  const showActions = isLoggedIn && !isSeriesFiltered && !loading;

  // Host / Co-create. Two positions, one definition:
  //  - list has events → top row, RIGHT of the filters (filters change what you see,
  //    actions change the data; an action inside the filter group misreads as a filter).
  //  - list is empty → INSIDE the centered empty block. With nothing to filter, a
  //    top-right action reads as page chrome instead of the one thing left to do —
  //    which is the treatment logged-out visitors already get via "Sign Up to Host".
  // Co-create travels with it everywhere, embedded included: co-creating an event
  // IS an org action, and pairing it with Host Event gives the org page both ways
  // in — start one yourself, or start one with someone.
  const actionButtons = (
    <div className="flex gap-2">
      <Link to="/co-create">
        <Button variant="outline" className="gap-2">
          <Users className="w-4 h-4" />
          Co-create
        </Button>
      </Link>
      <Link to="/events/new">
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
      {!isSeriesFiltered && events.length > 0 && activeTab === 'upcoming' && !isLoggedIn && (
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
