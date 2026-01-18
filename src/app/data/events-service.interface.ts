// Events Service Interface
// Both mock and real implementations must satisfy this contract

import type { EventWithHost, EventAttendee } from '@/app/types';

/**
 * EventsService defines the contract for events data operations.
 *
 * Key behavioral requirements (derived from mock):
 *
 * 1. Event Statuses:
 *    - 'upcoming': Active future events
 *    - 'completed': Past events
 *    - 'cancelled': Cancelled events (can be future or past)
 *
 * 2. Filtering Logic:
 *    - getUpcomingEvents: (status = 'upcoming' OR 'cancelled') AND datetime > now
 *    - getPastEvents: status = 'completed' OR (status = 'cancelled' AND datetime <= now)
 *
 * 3. User Relationships:
 *    - Host: event.hostId === currentUserId
 *    - RSVP'd: user has RSVP record for this event
 *    - Neither: can RSVP (if not full and not cancelled)
 *
 * 4. Capacity:
 *    - maxAttendees undefined = unlimited
 *    - Full when attendees.length >= maxAttendees
 */
export interface EventsService {
  // ============= QUERIES =============

  /**
   * Get upcoming events (including future cancelled events)
   * Sorted by datetime ascending (soonest first)
   */
  getUpcomingEvents(): Promise<EventWithHost[]>;

  /**
   * Get past events (completed + past cancelled)
   * Sorted by datetime descending (most recent first)
   */
  getPastEvents(): Promise<EventWithHost[]>;

  /**
   * Get single event by slug
   * Returns null if not found
   */
  getEventBySlug(slug: string): Promise<EventWithHost | null>;

  /**
   * Get attendees for an event
   * Returns empty array if event not found or no attendees
   */
  getEventAttendees(eventId: string): Promise<EventAttendee[]>;

  /**
   * Check if a specific user is RSVP'd to an event
   */
  isUserRsvpd(eventId: string, profileId: string): Promise<boolean>;

  /**
   * Check if event is at capacity
   * Returns false if maxAttendees is undefined (unlimited)
   */
  isEventFull(event: EventWithHost): boolean;

  /**
   * Get remaining spots for an event
   * Returns null if unlimited capacity
   */
  getSpotsRemaining(event: EventWithHost): number | null;

  // ============= MUTATIONS =============

  /**
   * Create a new event
   * Requires authenticated user (becomes host)
   * Returns created event or null on failure
   */
  createEvent(data: CreateEventInput): Promise<EventWithHost | null>;

  /**
   * Update an existing event
   * Only host can update
   * Returns true on success
   */
  updateEvent(eventId: string, data: UpdateEventInput): Promise<boolean>;

  /**
   * Cancel an event (set status to 'cancelled')
   * Only host can cancel
   * Returns true on success
   */
  cancelEvent(eventId: string): Promise<boolean>;

  /**
   * RSVP to an event
   * Fails if: event full, event cancelled, already RSVP'd
   * Returns true on success
   */
  rsvpToEvent(eventId: string, profileId: string): Promise<boolean>;

  /**
   * Cancel RSVP for an event
   * Returns true on success (or if wasn't RSVP'd)
   */
  cancelRsvp(eventId: string, profileId: string): Promise<boolean>;
}

export interface CreateEventInput {
  title: string;
  description: string;
  datetime: string; // ISO string
  durationMinutes: number;
  timezone: string; // IANA timezone
  location: string;
  maxAttendees?: number; // undefined = unlimited
}

export interface UpdateEventInput extends Partial<CreateEventInput> {}
