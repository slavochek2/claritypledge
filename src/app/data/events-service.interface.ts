import type { EventWithHost, EventAttendee, EventPracticeRoom } from '@/app/types';

export interface EventsService {
  // Queries
  /**
   * P1060: `orgId` scopes the list to one Clarity Organization. Omitted (the
   * standalone /events list) the query is unfiltered and keeps showing every
   * event, org-scoped or not — that is its job (spec Non-Goals).
   */
  getUpcomingEvents(orgId?: string): Promise<EventWithHost[]>;
  getPastEvents(orgId?: string): Promise<EventWithHost[]>;
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

/**
 * P1114: Event room presence + CMP opt-in — documentation-only signatures.
 * The actual implementation lives in `./event-room-service.ts` as a standalone module,
 * not as a second `EventsService` implementation — this feature is additive-only with
 * no mock-vs-real fork (every table/RPC is brand new, so there's nothing for a mock to
 * simulate). Kept here so the RPC contract is discoverable next to the rest of the
 * Events surface, per the Architect's Build Sequence step 3.
 */
export type EventRoomServiceContract = {
  joinEventRoom: (eventId: string, displayName: string) => Promise<import('@/app/types').EventRoomSelf>;
  setRoomOptIn: (memberId: string, optedIn: boolean) => Promise<import('@/app/types').EventRoomSelf>;
  setRoomReadiness: (memberId: string, value: number) => Promise<import('@/app/types').EventRoomSelf>;
  getMyRoomStatus: (eventId: string) => Promise<import('@/app/types').EventRoomSelf | null>;
  getRoomRoster: (eventId: string) => Promise<import('@/app/types').EventRoomMember[]>;
  subscribeToRoomRoster: (eventId: string, onUpdate: (roster: import('@/app/types').EventRoomMember[]) => void) => () => void;
};

export interface CreateEventInput {
  title: string;
  description: string;
  datetime: string;
  durationMinutes: number;
  timezone: string;
  location: string;
  maxAttendees?: number;
  /**
   * P1060: the organization this event belongs to, or null/undefined for a
   * standalone event. Setting it requires the host to be an ORGANIZER of that org —
   * enforced in the database by the events_org_requires_organizer trigger, not by
   * the caller. Omitting it is always allowed and is the standalone-hosting funnel.
   */
  orgId?: string | null;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  bannerUrl?: string | null;
}
