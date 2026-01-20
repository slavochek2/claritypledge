import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useEventsService } from '../index';
import type { EventWithHost } from '@/app/types';
import { EventCard } from '@/app/prototypes/events/components/EventCard';

type Tab = 'upcoming' | 'past';

export function MockEventsList() {
  const eventsService = useEventsService();

  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithHost[]>([]);
  const [pastEvents, setPastEvents] = useState<EventWithHost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      const [upcoming, past] = await Promise.all([
        eventsService.getUpcomingEvents(),
        eventsService.getPastEvents(),
      ]);
      setUpcomingEvents(upcoming);
      setPastEvents(past);
      setLoading(false);
    }
    fetchEvents();
  }, [eventsService]);

  const events = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Events (Mock Data)</h1>
            <p className="text-sm text-muted-foreground">
              This prototype uses hardcoded mock data — safe for testing
            </p>
          </div>
          <Link
            to="/tree"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Tree
          </Link>
        </div>

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
                isLoggedIn={false}
                userId={undefined}
                isUserGoing={false}
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
            <p className="text-muted-foreground">
              {activeTab === 'upcoming'
                ? 'No upcoming mock events configured.'
                : 'No past mock events configured.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
