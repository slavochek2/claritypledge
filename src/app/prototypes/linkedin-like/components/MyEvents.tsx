/**
 * MyEvents - Events list for LinkedIn-like prototype
 * Mirrors production /events/list but uses mock data
 * Assumes user is always "logged in" in this prototype
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CalendarDays, Users } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { EventCard } from '@/app/prototypes/events/components/EventCard';
import { mockEventsService } from '@/app/data/events-service-mock';
import { mockCurrentUser } from '@/app/prototypes/events/_archive/mock-data';
import type { EventWithHost } from '@/app/types';
import { Button } from '@/components/ui/button';

type Tab = 'upcoming' | 'past';

export function MyEvents() {
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithHost[]>([]);
  const [pastEvents, setPastEvents] = useState<EventWithHost[]>([]);
  const [userRsvps, setUserRsvps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      const [upcoming, past] = await Promise.all([
        mockEventsService.getUpcomingEvents(),
        mockEventsService.getPastEvents(),
      ]);
      setUpcomingEvents(upcoming);
      setPastEvents(past);

      // Check RSVP status for mock user
      const allEvents = [...upcoming, ...past];
      const rsvpChecks = await Promise.all(
        allEvents.map(event => mockEventsService.isUserRsvpd(event.id, mockCurrentUser.id))
      );
      const rsvpSet = new Set<string>();
      allEvents.forEach((event, i) => {
        if (rsvpChecks[i]) rsvpSet.add(event.id);
      });
      setUserRsvps(rsvpSet);

      setLoading(false);
    }
    fetchEvents();
  }, []);

  const events = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

  return (
    <PrototypeLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-2xl font-bold mb-4">Events</h1>

          {/* Tabs + Actions - stacked on mobile, inline on desktop */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                Upcoming ({upcomingEvents.length})
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
                Past ({pastEvents.length})
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Link to="/co-create">
                <Button variant="outline" className="gap-2">
                  <Users className="w-4 h-4" />
                  Co-create
                </Button>
              </Link>
              <Link to="/prototype/events-mock/new">
                <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white">
                  <Plus className="w-4 h-4" />
                  Host Event
                </Button>
              </Link>
            </div>
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
                  isLoggedIn={true}
                  userId={mockCurrentUser.id}
                  isUserGoing={userRsvps.has(event.id)}
                  linkPrefix="/prototype/events-mock"
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
            </div>
          )}
        </div>
      </div>
    </PrototypeLayout>
  );
}
