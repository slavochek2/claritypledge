import type { EventWithHost, EventAttendee, EventSubRoomWithProfiles } from '@/app/types';

export interface EventsService {
  // Queries
  getUpcomingEvents(): Promise<EventWithHost[]>;
  getPastEvents(): Promise<EventWithHost[]>;
  getEventBySlug(slug: string): Promise<EventWithHost | null>;
  getEventAttendees(eventId: string): Promise<EventAttendee[]>;
  isUserRsvpd(eventId: string, profileId: string): Promise<boolean>;
  isEventFull(event: EventWithHost): boolean;
  getSpotsRemaining(event: EventWithHost): number | null;

  // P62: Dashboard queries
  getUserNextEvent(profileId: string): Promise<EventWithHost | null>;
  getPeopleFromEvent(eventId: string, excludeProfileId: string): Promise<EventAttendee[]>;
  getUserRegisteredEvents(profileId: string): Promise<EventWithHost[]>;
  getUserHostedEvents(profileId: string): Promise<EventWithHost[]>;
  getUpcomingPublicEvents(excludeProfileId: string, limit: number): Promise<EventWithHost[]>;

  // Mutations
  createEvent(data: CreateEventInput): Promise<EventWithHost | null>;
  updateEvent(eventId: string, data: UpdateEventInput): Promise<boolean>;
  cancelEvent(eventId: string): Promise<boolean>;
  rsvpToEvent(eventId: string, profileId: string): Promise<boolean>;
  cancelRsvp(eventId: string, profileId: string): Promise<boolean>;

  // P124: Event Sub-Rooms
  getEventSubRooms(eventId: string): Promise<EventSubRoomWithProfiles[]>;
  createSubRoom(eventId: string, targetId: string): Promise<EventSubRoomWithProfiles | null>;
  joinSubRoom(subRoomId: string): Promise<{ sessionCode: string } | null>;
  cancelSubRoom(subRoomId: string): Promise<boolean>;
  completeSubRoom(subRoomId: string): Promise<boolean>;
}

export interface CreateEventInput {
  title: string;
  description: string;
  datetime: string;
  durationMinutes: number;
  timezone: string;
  location: string;
  maxAttendees?: number;
}

export type UpdateEventInput = Partial<CreateEventInput>;
