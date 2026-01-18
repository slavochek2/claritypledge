import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CalendarDays, Loader2 } from 'lucide-react';
import { EventCard } from './EventCard';
import { getUpcomingEvents, getPastEvents } from '@/app/data/api';
import type { EventWithHost } from '@/app/types';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';

type Tab = 'upcoming' | 'past';

export function EventsList() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithHost[]>([]);
  const [pastEvents, setPastEvents] = useState<EventWithHost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      const [upcoming, past] = await Promise.all([
        getUpcomingEvents(),
        getPastEvents(),
      ]);
      setUpcomingEvents(upcoming);
      setPastEvents(past);
      setLoading(false);
    }
    loadEvents();
  }, []);

  const events = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Events</h1>
          {isLoggedIn && (
            <Link to="/events/new">
              <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white">
                <Plus className="w-4 h-4" />
                Create Event
              </Button>
            </Link>
          )}
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
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(event => (
              <EventCard key={event.id} event={event} currentUserId={user?.id} />
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
                ? 'Check back later for new events or create your own!'
                : 'Past events will appear here after they conclude.'}
            </p>
            {activeTab === 'upcoming' && isLoggedIn && (
              <Link to="/events/new">
                <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white">
                  <Plus className="w-4 h-4" />
                  Create Event
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* CTA Section */}
      {events.length > 0 && activeTab === 'upcoming' && !isLoggedIn && (
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-12">
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
