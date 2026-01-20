/**
 * @file home-page.tsx
 * @description P62: Logged-in user dashboard - the hub for authenticated users.
 * Shows people from events, upcoming events, and quick actions.
 * Redirects unauthenticated users to landing page.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth";
import { Loader2Icon, CalendarIcon, PlusIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { eventsService } from "@/app/data/events-service";
import { PersonRow } from "@/app/components/shared/PersonRow";
import { EventRowCompact } from "@/app/components/shared/EventRowCompact";
import type { EventWithHost, EventAttendee } from "@/app/types";

export function HomePage() {
  const navigate = useNavigate();
  const { user, session, isLoading: authLoading } = useAuth();
  const hasTrackedPageView = useRef(false);

  // Dashboard data state
  const [nextEvent, setNextEvent] = useState<EventWithHost | null>(null);
  const [peopleFromNextEvent, setPeopleFromNextEvent] = useState<EventAttendee[]>([]);
  const [registeredEvents, setRegisteredEvents] = useState<EventWithHost[]>([]);
  const [hostedEvents, setHostedEvents] = useState<EventWithHost[]>([]);
  const [pastEvents, setPastEvents] = useState<EventWithHost[]>([]);
  const [upcomingPublicEvents, setUpcomingPublicEvents] = useState<EventWithHost[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // P77: Tab state for Your Events section
  const [eventsTab, setEventsTab] = useState<'upcoming' | 'past'>('upcoming');

  // Track page view (once per mount, after auth loaded)
  useEffect(() => {
    if (!authLoading && session && user && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      analytics.track('dashboard_viewed', {
        profile_slug: user.slug,
        has_pledged: user.hasPledged,
      });
    }
  }, [authLoading, session, user]);

  // Redirect unauthenticated users to landing page
  useEffect(() => {
    if (!authLoading && !session) {
      navigate("/");
    }
  }, [authLoading, session, navigate]);

  // Fetch dashboard data when user is available
  useEffect(() => {
    if (!user?.id) return;

    const fetchDashboardData = async () => {
      setIsLoadingEvents(true);
      setEventsError(null);

      try {
        // Fetch all data in parallel
        const [
          nextEventResult,
          registeredEventsResult,
          hostedEventsResult,
          pastEventsResult,
          upcomingPublicResult,
        ] = await Promise.all([
          eventsService.getUserNextEvent(user.id),
          eventsService.getUserRegisteredEvents(user.id),
          eventsService.getUserHostedEvents(user.id),
          eventsService.getUserPastEvents(user.id),
          eventsService.getUpcomingPublicEvents(user.id, 3),
        ]);

        setNextEvent(nextEventResult);
        setRegisteredEvents(registeredEventsResult);
        setHostedEvents(hostedEventsResult);
        setPastEvents(pastEventsResult);
        setUpcomingPublicEvents(upcomingPublicResult);

        // Fetch people from next event if we have one
        if (nextEventResult) {
          const people = await eventsService.getPeopleFromEvent(nextEventResult.id, user.id);
          setPeopleFromNextEvent(people);
        } else {
          setPeopleFromNextEvent([]);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setEventsError('Couldn\'t load events');
      } finally {
        setIsLoadingEvents(false);
      }
    };

    fetchDashboardData();
  }, [user?.id]);

  // Merge and dedupe attending + hosting events, sorted by date
  // Must be before early returns (React hooks rules)
  const { yourUpcomingEvents, hostedEventIds } = useMemo(() => {
    const hostedIds = new Set(hostedEvents.map(e => e.id));
    // Get only upcoming hosted events (filter by datetime)
    const now = new Date();
    const upcomingHosted = hostedEvents.filter(e => new Date(e.datetime) >= now);
    // Combine: hosted events + attending events (excluding ones user is also hosting)
    const combined = [
      ...upcomingHosted,
      ...registeredEvents.filter(e => !hostedIds.has(e.id)),
    ];
    // Sort by date ascending
    const sorted = combined.sort((a, b) =>
      new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );
    return { yourUpcomingEvents: sorted, hostedEventIds: hostedIds };
  }, [hostedEvents, registeredEvents]);

  // P77: Build past events list with hosting indicator
  const { yourPastEvents, pastHostedEventIds } = useMemo(() => {
    // Past events are already fetched - just need to identify which ones user hosted
    const pastHostedIds = new Set(
      pastEvents.filter(e => e.hostId === user?.id).map(e => e.id)
    );
    // Already sorted by most recent first from the API
    return { yourPastEvents: pastEvents, pastHostedEventIds: pastHostedIds };
  }, [pastEvents, user?.id]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (redirect will happen)
  if (!session || !user) {
    return null;
  }

  // Get first name for welcome message
  const firstName = user.name?.split(' ')[0] || 'there';

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
      <SEO
        title="Dashboard"
        description="Your personal dashboard on Clarity Pledge. See people from your events, upcoming events, and quick actions."
        url="/home"
      />

      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">
          Welcome back, {firstName}
        </h1>

        {/* Quick Actions
            UX: "Browse Events" is primary (blue) because most users want to join events.
            "Host an Event" is secondary because hosting is less common action. */}
        <div className="flex flex-wrap gap-3">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            <CalendarIcon className="w-4 h-4" />
            Browse Events
          </Link>
          <Link
            to="/events/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Host an Event
          </Link>
        </div>
      </div>

      {/* Main Content Grid - People left, Events right on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* People Section - Primary (left on desktop, top on mobile) */}
        <section>
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">
            Participants of Your Next Event
          </h2>

          {isLoadingEvents ? (
            // Skeleton loading state
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-24" />
                  </div>
                  <div className="h-8 bg-muted rounded w-32" />
                </div>
              ))}
            </div>
          ) : eventsError ? (
            // Error state
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
              <p className="text-red-600 dark:text-red-400">{eventsError}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 text-sm text-blue-500 hover:text-blue-600"
              >
                Retry
              </button>
            </div>
          ) : nextEvent && peopleFromNextEvent.length > 0 ? (
            // People list using shared PersonRow component
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                {nextEvent.title} — {new Date(nextEvent.datetime).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: nextEvent.timezone,
                })}
              </p>
              <div className="space-y-2">
                {peopleFromNextEvent.map(person => (
                  <PersonRow
                    key={person.profileId}
                    profileId={person.profileId}
                    slug={person.slug}
                    name={person.name}
                    avatarColor={person.avatarColor}
                    avatarUrl={person.avatarUrl}
                    isPledger={person.hasPledged}
                    action="going"
                  />
                ))}
              </div>
            </div>
          ) : nextEvent && peopleFromNextEvent.length === 0 ? (
            // Event exists but no other attendees yet
            <div className="bg-muted/30 rounded-lg p-6 text-center">
              <p className="text-muted-foreground">
                No one else registered yet for <span className="font-medium">{nextEvent.title}</span>
              </p>
              <Link
                to={`/events/${nextEvent.slug}`}
                className="inline-block mt-3 text-blue-500 hover:text-blue-600 font-medium"
              >
                View event &rarr;
              </Link>
            </div>
          ) : (
            // P77: No upcoming events - simple text, no CTA (buttons at top suffice)
            <div className="bg-muted/30 rounded-lg p-6 text-center">
              <p className="text-muted-foreground">
                Join an event to see participants
              </p>
            </div>
          )}
        </section>

        {/* Events Section - right on desktop */}
        <section>
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">
            Your Events
          </h2>

          {isLoadingEvents ? (
            // Skeleton loading state
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-muted/30 rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-20 mb-2" />
                  <div className="h-6 bg-muted rounded w-48" />
                </div>
              ))}
            </div>
          ) : eventsError ? (
            // Error state
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
              <p className="text-red-600 dark:text-red-400">{eventsError}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 text-sm text-blue-500 hover:text-blue-600"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* P77: Upcoming/Past Tabs */}
              <div
                role="tablist"
                aria-label="Your events"
                className="flex gap-1 mb-4"
                onKeyDown={(e) => {
                  // Keyboard navigation between tabs
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    setEventsTab(eventsTab === 'upcoming' ? 'past' : 'upcoming');
                  }
                }}
              >
                <button
                  role="tab"
                  id="tab-upcoming"
                  aria-selected={eventsTab === 'upcoming'}
                  aria-controls="tabpanel-upcoming"
                  tabIndex={eventsTab === 'upcoming' ? 0 : -1}
                  onClick={() => setEventsTab('upcoming')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    eventsTab === 'upcoming'
                      ? 'bg-blue-500 text-white'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Upcoming ({yourUpcomingEvents.length})
                </button>
                <button
                  role="tab"
                  id="tab-past"
                  aria-selected={eventsTab === 'past'}
                  aria-controls="tabpanel-past"
                  tabIndex={eventsTab === 'past' ? 0 : -1}
                  onClick={() => setEventsTab('past')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    eventsTab === 'past'
                      ? 'bg-blue-500 text-white'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Past ({yourPastEvents.length})
                </button>
              </div>

              {/* Tab Panels */}
              {eventsTab === 'upcoming' ? (
                <div
                  role="tabpanel"
                  id="tabpanel-upcoming"
                  aria-labelledby="tab-upcoming"
                >
                  {yourUpcomingEvents.length > 0 ? (
                    <div className="space-y-2">
                      {yourUpcomingEvents.map(event => (
                        <EventRowCompact
                          key={event.id}
                          event={event}
                          role={hostedEventIds.has(event.id) ? "hosting" : "attending"}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-card border border-border rounded-xl p-6 text-center shadow-sm">
                      <p className="text-muted-foreground">No upcoming events yet</p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  role="tabpanel"
                  id="tabpanel-past"
                  aria-labelledby="tab-past"
                >
                  {yourPastEvents.length > 0 ? (
                    <div className="space-y-2">
                      {yourPastEvents.map(event => (
                        <EventRowCompact
                          key={event.id}
                          event={event}
                          role={pastHostedEventIds.has(event.id) ? "hosting" : "attending"}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-card border border-border rounded-xl p-6 text-center shadow-sm">
                      <p className="text-muted-foreground">No past events yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* Discover Events - P77: Only show when user has upcoming events */}
              {yourUpcomingEvents.length > 0 && upcomingPublicEvents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    DISCOVER EVENTS
                  </h3>
                  <div className="space-y-2">
                    {upcomingPublicEvents.map(event => (
                      <EventRowCompact
                        key={event.id}
                        event={event}
                        role="none"
                      />
                    ))}
                    <Link
                      to="/events"
                      className="block text-center text-sm text-blue-500 hover:text-blue-600 mt-3"
                    >
                      See all events &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
