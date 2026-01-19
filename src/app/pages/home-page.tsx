/**
 * @file home-page.tsx
 * @description P62: Logged-in user dashboard - the hub for authenticated users.
 * Shows people from events, upcoming events, and quick actions.
 * Redirects unauthenticated users to landing page.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth";
import { Loader2Icon, TargetIcon, MicIcon, HandshakeIcon, ScrollTextIcon, CalendarIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { eventsService } from "@/app/data/events-service";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
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

  // Mobile collapsible state
  const [attendingExpanded, setAttendingExpanded] = useState(false);
  const [hostingExpanded, setHostingExpanded] = useState(false);

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

  // Helper to format event date
  const formatEventDate = (datetime: string, timezone: string) => {
    const date = new Date(datetime);
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    };
    return date.toLocaleString('en-US', options);
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
      <SEO
        title="Dashboard"
        description="Your personal dashboard on Clarity Pledge. See people from your events, upcoming events, and quick actions."
        url="/home"
      />

      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">
          Welcome back, {firstName}
        </h1>
      </div>

      {/* Main Content Grid - People left, Events right on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* People Section - Primary (left on desktop, top on mobile) */}
        <section>
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">
            People From Your Next Event
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
            // People list
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                {nextEvent.title} — {formatEventDate(nextEvent.datetime, nextEvent.timezone)}
              </p>
              <div className="space-y-3">
                {peopleFromNextEvent.map(person => (
                  <div key={person.profileId} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                    <Link to={`/p/${person.slug}`}>
                      <GravatarAvatar
                        name={person.name}
                        avatarColor={person.avatarColor}
                        photoUrl={person.avatarUrl}
                        size="md"
                      />
                    </Link>
                    <Link to={`/p/${person.slug}`} className="flex-1 font-medium hover:text-blue-500 transition-colors">
                      {person.name}
                    </Link>
                    <Link
                      to="/live"
                      onClick={() => analytics.track('meeting_invite_clicked', { source: 'dashboard' })}
                      className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
                    >
                      Invite to a Clarity Meeting
                    </Link>
                  </div>
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
            // No upcoming events
            <div className="bg-muted/30 rounded-lg p-6 text-center">
              <p className="text-muted-foreground">
                Join events to meet people
              </p>
              <Link
                to="/events"
                className="inline-block mt-3 text-blue-500 hover:text-blue-600 font-medium"
              >
                See events &rarr;
              </Link>
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
            <div className="space-y-4">
              {/* Attending */}
              <div>
                <button
                  onClick={() => setAttendingExpanded(!attendingExpanded)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2 lg:cursor-default"
                >
                  <span className="lg:hidden">{attendingExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}</span>
                  ATTENDING ({registeredEvents.length})
                </button>
                <div className={`lg:block ${attendingExpanded ? 'block' : 'hidden lg:block'}`}>
                  {registeredEvents.length > 0 ? (
                    <div className="space-y-2">
                      {registeredEvents.map(event => (
                        <Link
                          key={event.id}
                          to={`/events/${event.slug}`}
                          className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:border-blue-500 transition-colors"
                        >
                          <CalendarIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{event.title}</div>
                            <div className="text-sm text-muted-foreground">{formatEventDate(event.datetime, event.timezone)}</div>
                          </div>
                          <span className="text-blue-500 text-sm">View</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground">No upcoming events</p>
                      <Link
                        to="/events"
                        className="inline-block mt-2 text-sm text-blue-500 hover:text-blue-600"
                      >
                        See events &rarr;
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Hosting */}
              <div>
                <button
                  onClick={() => setHostingExpanded(!hostingExpanded)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2 lg:cursor-default"
                >
                  <span className="lg:hidden">{hostingExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}</span>
                  HOSTING ({hostedEvents.length})
                </button>
                <div className={`lg:block ${hostingExpanded ? 'block' : 'hidden lg:block'}`}>
                  {hostedEvents.length > 0 ? (
                    <div className="space-y-2">
                      {hostedEvents.map(event => (
                        <Link
                          key={event.id}
                          to={`/events/${event.slug}/edit`}
                          className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:border-blue-500 transition-colors"
                        >
                          <MicIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{event.title}</div>
                            <div className="text-sm text-muted-foreground">{formatEventDate(event.datetime, event.timezone)}</div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded ${event.status === 'upcoming' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                            {event.status === 'upcoming' ? 'Published' : event.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                          </span>
                          <span className="text-blue-500 text-sm">Edit</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground">Not hosting yet</p>
                      <Link
                        to="/events/create"
                        className="inline-block mt-2 text-sm text-blue-500 hover:text-blue-600"
                      >
                        Host an Event &rarr;
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Events (Discovery) */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">UPCOMING EVENTS</h3>
                {upcomingPublicEvents.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingPublicEvents.map(event => (
                      <Link
                        key={event.id}
                        to={`/events/${event.slug}`}
                        className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:border-blue-500 transition-colors"
                      >
                        <CalendarIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{event.title}</div>
                          <div className="text-sm text-muted-foreground">{formatEventDate(event.datetime, event.timezone)}</div>
                        </div>
                        <span className="text-blue-500 text-sm">RSVP</span>
                      </Link>
                    ))}
                    <Link
                      to="/events"
                      className="block text-center text-sm text-blue-500 hover:text-blue-600 mt-2"
                    >
                      See all events &rarr;
                    </Link>
                  </div>
                ) : (
                  <div className="bg-muted/30 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">No upcoming events</p>
                    <Link
                      to="/events"
                      className="inline-block mt-2 text-sm text-blue-500 hover:text-blue-600"
                    >
                      See all events &rarr;
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Quick Actions Section - Bottom */}
      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Start a Clarity Meeting */}
          <Link
            to="/live"
            onClick={() => analytics.track('quick_action_clicked', { action: 'start_meeting' })}
            className="flex flex-col items-center gap-3 p-6 bg-card border border-border rounded-lg hover:border-blue-500 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <TargetIcon className="w-6 h-6 text-blue-500" />
            </div>
            <span className="font-medium text-center">Start a Clarity Meeting</span>
          </Link>

          {/* Host an Event */}
          <Link
            to="/events/create"
            onClick={() => analytics.track('quick_action_clicked', { action: 'host_event' })}
            className="flex flex-col items-center gap-3 p-6 bg-card border border-border rounded-lg hover:border-blue-500 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <MicIcon className="w-6 h-6 text-blue-500" />
            </div>
            <span className="font-medium text-center">Host an Event</span>
          </Link>

          {/* Collaborate With Us */}
          <Link
            to="/collaborate"
            onClick={() => analytics.track('quick_action_clicked', { action: 'collaborate' })}
            className="flex flex-col items-center gap-3 p-6 bg-card border border-border rounded-lg hover:border-blue-500 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <HandshakeIcon className="w-6 h-6 text-blue-500" />
            </div>
            <span className="font-medium text-center">Collaborate With Us</span>
          </Link>
        </div>

        {/* Take the Pledge Banner - Only shown if user hasn't pledged */}
        {!user.hasPledged && (
          <Link
            to="/sign-pledge?prefill=true"
            onClick={() => analytics.track('quick_action_clicked', { action: 'take_pledge' })}
            className="mt-6 flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <ScrollTextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-blue-900 dark:text-blue-100">
                Take the Pledge — Join 200+ committed to clarity
              </span>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-medium group-hover:underline">
              Take Pledge &rarr;
            </span>
          </Link>
        )}
      </section>
    </div>
  );
}
