import type { EventWithHost, EventAttendee, EventPracticeRoom } from '@/app/types';

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
  uncancelEvent(eventId: string): Promise<boolean>;
  rsvpToEvent(eventId: string, profileId: string): Promise<boolean>;
  cancelRsvp(eventId: string, profileId: string): Promise<boolean>;

  // P406: Practice Rooms
  getPracticeRooms(eventId: string): Promise<EventPracticeRoom[]>;
  /** P1057: sessionCode is passed in — the room code is no longer readable back from the embed. */
  openPracticeRoom(eventId: string, creatorId: string, sessionId: string, sessionCode: string): Promise<EventPracticeRoom>;
  closePracticeRoom(roomId: string): Promise<void>;
  closePracticeRoomBySessionId(sessionId: string): Promise<void>;

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

export interface UpdateEventInput extends Partial<CreateEventInput> {
  bannerUrl?: string | null;
}
