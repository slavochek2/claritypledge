/**
 * MyEvents - Dashboard for logged-in user
 * Shows: my upcoming sessions, my events, browse events CTA, co-create CTA
 * Based on prod home-page.tsx but with mock data for prototype
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarIcon, PlusIcon, CheckCircle2, Users } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { routes } from '../config';
import { currentUser } from '../data/mock-data';

// Mock events data for prototype
const mockUpcomingEvents = [
  {
    id: '1',
    title: 'Tech Ethics Discussion',
    datetime: '2025-01-25T18:00:00Z',
    timezone: 'America/New_York',
    isHosting: false,
    attendeeCount: 12,
  },
  {
    id: '2',
    title: 'Remote Work Roundtable',
    datetime: '2025-01-28T14:00:00Z',
    timezone: 'America/New_York',
    isHosting: true,
    attendeeCount: 8,
  },
];

const mockPastEvents = [
  {
    id: '3',
    title: 'AI in Healthcare Panel',
    datetime: '2025-01-10T16:00:00Z',
    timezone: 'America/New_York',
    isHosting: false,
    attendeeCount: 24,
  },
];

const mockParticipants = [
  { id: '1', name: 'Alice Chen', avatarColor: '#4F46E5', hasPledged: true },
  { id: '2', name: 'Bob Smith', avatarColor: '#059669', hasPledged: false },
  { id: '3', name: 'Carol Davis', avatarColor: '#DC2626', hasPledged: true },
  { id: '4', name: 'David Park', avatarColor: '#7C3AED', hasPledged: false },
];

const mockDiscoverEvents = [
  {
    id: '4',
    title: 'Design Systems Workshop',
    datetime: '2025-02-01T15:00:00Z',
    timezone: 'America/New_York',
    attendeeCount: 15,
  },
  {
    id: '5',
    title: 'Startup Founders Meetup',
    datetime: '2025-02-05T17:00:00Z',
    timezone: 'America/New_York',
    attendeeCount: 32,
  },
];

type EventsTab = 'upcoming' | 'past';

export function MyEvents() {
  const [eventsTab, setEventsTab] = useState<EventsTab>('upcoming');
  const firstName = currentUser.name.split(' ')[0];

  return (
    <PrototypeLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Welcome Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome back, {firstName}
          </h1>

          {/* Quick Actions */}
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Host an Event
            </Link>
            <Link
              to="/co-create"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
            >
              <Users className="w-4 h-4" />
              Co-create
            </Link>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Participants Section */}
          <section className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-semibold mb-3 pb-2 border-b">
              Participants of Your Next Event
            </h2>

            {mockUpcomingEvents.length > 0 ? (
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  {mockUpcomingEvents[0].title} — {formatEventDate(mockUpcomingEvents[0].datetime)}
                </p>
                <div className="space-y-2">
                  {mockParticipants.map(person => (
                    <PersonRow key={person.id} person={person} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-gray-500">
                  Join an event to see participants
                </p>
              </div>
            )}
          </section>

          {/* Events Section */}
          <section className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-semibold mb-3 pb-2 border-b">
              Your Events
            </h2>

            {/* Tabs */}
            <div className="flex gap-1 mb-4">
              <TabButton
                label={`Upcoming (${mockUpcomingEvents.length})`}
                active={eventsTab === 'upcoming'}
                onClick={() => setEventsTab('upcoming')}
              />
              <TabButton
                label={`Past (${mockPastEvents.length})`}
                active={eventsTab === 'past'}
                onClick={() => setEventsTab('past')}
              />
            </div>

            {/* Tab Content */}
            {eventsTab === 'upcoming' ? (
              <div className="space-y-2">
                {mockUpcomingEvents.length > 0 ? (
                  mockUpcomingEvents.map(event => (
                    <EventRow key={event.id} event={event} />
                  ))
                ) : (
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <p className="text-gray-500">No upcoming events yet</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {mockPastEvents.length > 0 ? (
                  mockPastEvents.map(event => (
                    <EventRow key={event.id} event={event} />
                  ))
                ) : (
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <p className="text-gray-500">No past events yet</p>
                  </div>
                )}
              </div>
            )}

            {/* Discover Events */}
            {mockUpcomingEvents.length > 0 && mockDiscoverEvents.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Discover Events
                </h3>
                <div className="space-y-2">
                  {mockDiscoverEvents.map(event => (
                    <EventRow key={event.id} event={event} isDiscover />
                  ))}
                </div>
                <Link
                  to="/events"
                  className="block text-center text-sm text-blue-500 hover:text-blue-600 mt-3"
                >
                  See all events &rarr;
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </PrototypeLayout>
  );
}

// Helper components

function PersonRow({ person }: { person: { id: string; name: string; avatarColor: string; hasPledged: boolean } }) {
  const initials = person.name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
        style={{ backgroundColor: person.avatarColor }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{person.name}</p>
      </div>
      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 border border-green-200">
        <CheckCircle2 className="w-3 h-3" />
        Going
      </span>
    </div>
  );
}

function EventRow({ event, isDiscover = false }: {
  event: {
    id: string;
    title: string;
    datetime: string;
    isHosting?: boolean;
    attendeeCount: number;
  };
  isDiscover?: boolean;
}) {
  return (
    <Link
      to={`/events/${event.id}`}
      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
        <CalendarIcon className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{event.title}</p>
        <p className="text-sm text-gray-500">{formatEventDate(event.datetime)}</p>
      </div>
      {!isDiscover && (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
          event.isHosting
            ? 'bg-blue-100 text-blue-700 border border-blue-200'
            : 'bg-green-100 text-green-700 border border-green-200'
        }`}>
          <CheckCircle2 className="w-3 h-3" />
          {event.isHosting ? 'Hosting' : 'Going'}
        </span>
      )}
    </Link>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function formatEventDate(datetime: string): string {
  return new Date(datetime).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
