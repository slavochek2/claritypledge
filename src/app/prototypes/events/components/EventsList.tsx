import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CalendarDays, Users } from 'lucide-react';
import { EventCard } from './EventCard';
import { eventsService } from '@/app/data/events-service';
import { useAuth } from '@/auth';
import type { EventWithHost } from '@/app/types';
import { Button } from '@/components/ui/button';

type Tab = 'upcoming' | 'past';

export function EventsList() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithHost[]>([]);
  const [pastEvents, setPastEvents] = useState<EventWithHost[]>([]);
  const [userRsvps, setUserRsvps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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

  const events = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold mb-4">Events</h1>

        {/* Tabs and Action Buttons Row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Tabs */}
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

          {/* Action Buttons */}
          {isLoggedIn && (
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
          )}
        </div>
      </div>

      {/* Events Grid */}
      <div className="max-w-5xl mx-auto px-4 pb-6">
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
              No {activeTab} events
            </h3>
            <p className="text-muted-foreground mb-6">
              {activeTab === 'upcoming'
                ? 'Check back later or host your own!'
                : 'Past events will appear here after they conclude.'}
            </p>
            {/* P77: Only show sign up CTA for unauthenticated users.
                Authenticated users see "Host Event" button in header - no duplicate CTA needed */}
            {activeTab === 'upcoming' && !isLoggedIn && (
              <Link to="/signup">
                <Button className="bg-blue-500 hover:bg-blue-600 text-white">
                  Sign Up to Host
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* CTA Section */}
      {events.length > 0 && activeTab === 'upcoming' && !isLoggedIn && (
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
