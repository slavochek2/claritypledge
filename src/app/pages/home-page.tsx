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
  const [upcomingPublicEvents, setUpcomingPublicEvents] = useState<EventWithHost[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

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
          upcomingPublicResult,
        ] = await Promise.all([
          eventsService.getUserNextEvent(user.id),
          eventsService.getUserRegisteredEvents(user.id),
          eventsService.getUserHostedEvents(user.id),
          eventsService.getUpcomingPublicEvents(user.id, 3),
        ]);

        setNextEvent(nextEventResult);
        setRegisteredEvents(registeredEventsResult);
        setHostedEvents(hostedEventsResult);
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

  // Merge and dedupe attending + hosting events, split into upcoming vs past
  // Must be before early returns (React hooks rules)
  const { yourUpcomingEvents, yourPastEvents, hostedEventIds } = useMemo(() => {
    const hostedIds = new Set(hostedEvents.map(e => e.id));
    const now = new Date();

    const upcomingHosted = hostedEvents.filter(e => new Date(e.datetime) >= now);
    const pastHosted = hostedEvents.filter(e => new Date(e.datetime) < now);
    const attendingOnly = registeredEvents.filter(e => !hostedIds.has(e.id));
    const upcomingAttending = attendingOnly.filter(e => new Date(e.datetime) >= now);
    const pastAttending = attendingOnly.filter(e => new Date(e.datetime) < now);

    const upcoming = [...upcomingHosted, ...upcomingAttending].sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );
    const past = [...pastHosted, ...pastAttending].sort(
      (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
    );

    return { yourUpcomingEvents: upcoming, yourPastEvents: past, hostedEventIds: hostedIds };
  }, [hostedEvents, registeredEvents]);

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
                    earCount={person.earCount}
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
              {/* Your Upcoming Events */}
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
                <div className="bg-muted/30 rounded-lg p-6 text-center">
                  <p className="text-muted-foreground">No upcoming events yet</p>
                </div>
              )}

              {/* Past Events - Show up to 3 most recent */}
              {yourPastEvents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    PAST EVENTS
                  </h3>
                  <div className="space-y-2">
                    {yourPastEvents.slice(0, 3).map(event => (
                      <EventRowCompact
                        key={event.id}
                        event={event}
                        role={hostedEventIds.has(event.id) ? "hosting" : "attending"}
                      />
                    ))}
                    {yourPastEvents.length > 3 && (
                      <Link
                        to="/events/list"
                        className="block text-center text-sm text-blue-500 hover:text-blue-600 mt-1"
                      >
                        See all past events &rarr;
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Discover Events - Only show when user has upcoming events */}
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
