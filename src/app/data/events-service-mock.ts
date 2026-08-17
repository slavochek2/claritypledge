import type { EventsService, CreateEventInput } from './events-service.interface';
import type { EventWithHost, EventAttendee, EventPracticeRoom } from '@/app/types';
// Mock data archived after P61.1 production backend implementation
import {
  getUpcomingEvents as mockGetUpcoming,
  getPastEvents as mockGetPast,
  getEventBySlug as mockGetBySlug,
  isUserRsvpd as mockIsRsvpd,
  isEventFull as mockIsFull,
  getSpotsRemaining as mockGetSpots,
  cancelEvent as mockCancelEvent,
  cancelRsvp as mockCancelRsvp,
  mockCurrentUser,
  mockEvents,
  type MockEvent,
} from '@/app/prototypes/events/_archive/mock-data';

// Transform MockEvent to EventWithHost (same shape, just type alignment)
function toEventWithHost(mock: MockEvent): EventWithHost {
  return {
    id: mock.id,
    slug: mock.slug,
    title: mock.title,
    description: mock.description,
    datetime: mock.datetime,
    durationMinutes: mock.durationMinutes,
    timezone: mock.timezone,
    location: mock.location,
    hostId: mock.hostId,
    hostName: mock.hostName,
    hostSlug: mock.hostSlug,
    hostRole: mock.hostRole,
    hostAvatarColor: mock.hostAvatarColor,
    hostHasPledged: true, // P118: Mock assumes hosts have pledged
    maxAttendees: mock.maxAttendees,
    createdAt: mock.createdAt,
    status: mock.status,
    // Include attendees for display (mock-specific - real service would fetch separately)
    attendees: mock.attendees.map(a => ({
      profileId: a.id,
      name: a.name,
      slug: a.slug,
      avatarColor: a.avatarColor,
      hasPledged: false, // Mock data doesn't track pledge status
    })),
    attendeeCount: mock.attendees.length,
  };
}

export const mockEventsService: EventsService = {
  // Wrap sync as async to match interface
  async getUpcomingEvents(): Promise<EventWithHost[]> {
    return mockGetUpcoming().map(toEventWithHost);
  },

  async getPastEvents(): Promise<EventWithHost[]> {
    return mockGetPast().map(toEventWithHost);
  },

  async getEventBySlug(slug: string): Promise<EventWithHost | null> {
    const event = mockGetBySlug(slug);
    return event ? toEventWithHost(event) : null;
  },

  async getEventAttendees(eventId: string): Promise<EventAttendee[]> {
    const event = mockEvents.find(e => e.id === eventId);
    if (!event) return [];
    return event.attendees.map(a => ({
      profileId: a.id,
      name: a.name,
      slug: a.slug,
      avatarColor: a.avatarColor,
      hasPledged: false, // Mock data doesn't track pledge status
    }));
  },

  async isUserRsvpd(eventId: string, _profileId: string): Promise<boolean> {
    // Mock ignores profileId, uses mockCurrentUser
    return mockIsRsvpd(eventId);
  },

  isEventFull(event: EventWithHost): boolean {
    // Need to get the mock event to check attendees
    const mockEvent = mockEvents.find(e => e.id === event.id);
    if (!mockEvent) return false;
    return mockIsFull(mockEvent);
  },

  getSpotsRemaining(event: EventWithHost): number | null {
    const mockEvent = mockEvents.find(e => e.id === event.id);
    if (!mockEvent) return null;
    return mockGetSpots(mockEvent);
  },

  async createEvent(data: CreateEventInput): Promise<EventWithHost | null> {
    // Mock implementation - create temporary event
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Use timestamp + random suffix for unique IDs (avoids collisions in parallel tests)
    const uniqueId = `evt-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newEvent: MockEvent = {
      id: uniqueId,
      slug: `${slug}-${new Date().toISOString().split('T')[0]}-${Math.random().toString(36).slice(2, 6)}`,
      title: data.title,
      description: data.description,
      datetime: data.datetime,
      durationMinutes: data.durationMinutes,
      timezone: data.timezone,
      location: data.location,
      hostId: mockCurrentUser.id,
      hostName: mockCurrentUser.name,
      hostSlug: mockCurrentUser.slug,
      hostRole: 'Clarity Pledge Founder',
      hostAvatarColor: mockCurrentUser.avatarColor,
      maxAttendees: data.maxAttendees,
      attendees: [],
      status: 'upcoming',
      createdAt: new Date().toISOString(),
    };

    mockEvents.push(newEvent);
    return toEventWithHost(newEvent);
  },

  async updateEvent(eventId: string, data: Partial<CreateEventInput>): Promise<boolean> {
    const event = mockEvents.find(e => e.id === eventId);
    if (!event || event.hostId !== mockCurrentUser.id) return false;

    if (data.title) event.title = data.title;
    if (data.description) event.description = data.description;
    if (data.datetime) event.datetime = data.datetime;
    if (data.durationMinutes) event.durationMinutes = data.durationMinutes;
    if (data.timezone) event.timezone = data.timezone;
    if (data.location) event.location = data.location;
    if (data.maxAttendees !== undefined) event.maxAttendees = data.maxAttendees;

    return true;
  },

  async cancelEvent(eventId: string): Promise<boolean> {
    return mockCancelEvent(eventId);
  },

  async uncancelEvent(eventId: string): Promise<boolean> {
    const event = mockEvents.find(e => e.id === eventId);
    if (!event || event.hostId !== mockCurrentUser.id) return false;
    event.status = 'upcoming';
    return true;
  },

  async rsvpToEvent(eventId: string, _profileId: string): Promise<boolean> {
    const event = mockEvents.find(e => e.id === eventId);
    if (!event) return false;
    if (event.status === 'cancelled') return false;
    if (mockIsFull(event)) return false;
    if (mockIsRsvpd(eventId)) return false;

    mockCurrentUser.rsvpdEventIds.push(eventId);
    // Also add to attendees list
    event.attendees.push({
      id: mockCurrentUser.id,
      name: mockCurrentUser.name,
      slug: mockCurrentUser.slug,
      avatarColor: mockCurrentUser.avatarColor,
    });
    return true;
  },

  async cancelRsvp(eventId: string, _profileId: string): Promise<boolean> {
    const success = mockCancelRsvp(eventId);
    if (success) {
      // Also remove from event's attendees list
      const event = mockEvents.find(e => e.id === eventId);
      if (event) {
        const attendeeIndex = event.attendees.findIndex(a => a.id === mockCurrentUser.id);
        if (attendeeIndex > -1) {
          event.attendees.splice(attendeeIndex, 1);
        }
      }
    }
    return success;
  },

  // P62: Dashboard queries

  async getUserNextEvent(profileId: string): Promise<EventWithHost | null> {
    const now = new Date();
    // Find upcoming events where user is RSVP'd or is host
    const upcomingEvents = mockEvents
      .filter(e => {
        if (e.status !== 'upcoming') return false;
        if (new Date(e.datetime) <= now) return false;
        // User is attending or hosting
        const isAttending = e.attendees.some(a => a.id === profileId) || mockCurrentUser.rsvpdEventIds.includes(e.id);
        const isHosting = e.hostId === profileId;
        return isAttending || isHosting;
      })
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    return upcomingEvents.length > 0 ? toEventWithHost(upcomingEvents[0]) : null;
  },

  async getPeopleFromEvent(eventId: string, excludeProfileId: string): Promise<EventAttendee[]> {
    const event = mockEvents.find(e => e.id === eventId);
    if (!event) return [];

    // Get attendees excluding the current user
    const attendees = event.attendees
      .filter(a => a.id !== excludeProfileId)
      .map(a => ({
        profileId: a.id,
        name: a.name,
        slug: a.slug,
        avatarColor: a.avatarColor,
        hasPledged: false, // Mock data doesn't track pledge status
      }));

    // Also include host if they're not the excluded user
    if (event.hostId !== excludeProfileId) {
      attendees.unshift({
        profileId: event.hostId,
        name: event.hostName,
        slug: event.hostSlug,
        avatarColor: event.hostAvatarColor,
        hasPledged: false, // Mock data doesn't track pledge status
      });
    }

    return attendees;
  },

  async getUserRegisteredEvents(profileId: string): Promise<EventWithHost[]> {
    const now = new Date();
    // Events user is attending (not hosting) - upcoming only
    return mockEvents
      .filter(e => {
        if (e.status !== 'upcoming') return false;
        if (new Date(e.datetime) <= now) return false;
        if (e.hostId === profileId) return false; // Exclude hosted events
        return e.attendees.some(a => a.id === profileId) || mockCurrentUser.rsvpdEventIds.includes(e.id);
      })
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
      .map(toEventWithHost);
  },

  async getUserHostedEvents(profileId: string): Promise<EventWithHost[]> {
    // Events user is hosting (all statuses)
    return mockEvents
      .filter(e => e.hostId === profileId)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
      .map(toEventWithHost);
  },

  // P406: Practice Rooms (mock — returns empty, mutations are no-ops)

  async getPracticeRooms(_eventId: string): Promise<EventPracticeRoom[]> {
    return [];
  },

  async openPracticeRoom(eventId: string, creatorId: string, sessionId: string, sessionCode: string): Promise<EventPracticeRoom> {
    const now = new Date().toISOString();
    return {
      id: `mock-room-${Date.now()}`,
      eventId,
      creatorId,
      sessionId,
      sessionCode: sessionCode ?? null,
      status: 'waiting',
      createdAt: now,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      creatorName: 'Mock User',
      creatorSlug: '',
      creatorAvatarColor: '#3B82F6',
      creatorAvatarUrl: null,
    };
  },

  async closePracticeRoom(_roomId: string): Promise<void> {
    // no-op in mock
  },

  async closePracticeRoomBySessionId(_sessionId: string): Promise<void> {
    // no-op in mock
  },

  async getUpcomingPublicEvents(excludeProfileId: string, limit: number): Promise<EventWithHost[]> {
    const now = new Date();
    // Upcoming events user is NOT already registered for
    return mockEvents
      .filter(e => {
        if (e.status !== 'upcoming') return false;
        if (new Date(e.datetime) <= now) return false;
        // Exclude if user is already attending or hosting
        const isAttending = e.attendees.some(a => a.id === excludeProfileId) || mockCurrentUser.rsvpdEventIds.includes(e.id);
        const isHosting = e.hostId === excludeProfileId;
        return !isAttending && !isHosting;
      })
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
      .slice(0, limit)
      .map(toEventWithHost);
  },

};
