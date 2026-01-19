import { describe, it, expect } from 'vitest';

// Test mock service directly (not affected by VITE_USE_REAL_EVENTS_API env var)
import { mockEventsService as eventsService } from '@/app/data/events-service-mock';
// Still need mockCurrentUser for host detection tests (mock-specific)
// Archived after P61.1 production backend implementation
import { mockCurrentUser } from '@/app/prototypes/events/_archive/mock-data';

describe('Events Service - Queries', () => {
  describe('getUpcomingEvents', () => {
    it('returns array of events', async () => {
      const events = await eventsService.getUpcomingEvents();
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it('includes upcoming events', async () => {
      const events = await eventsService.getUpcomingEvents();
      const hasUpcoming = events.some(e => e.status === 'upcoming');
      expect(hasUpcoming).toBe(true);
    });

    it('includes future cancelled events', async () => {
      const events = await eventsService.getUpcomingEvents();
      const hasCancelled = events.some(e => e.status === 'cancelled');
      expect(hasCancelled).toBe(true);
    });

    it('does NOT include completed events', async () => {
      const events = await eventsService.getUpcomingEvents();
      const hasCompleted = events.some(e => e.status === 'completed');
      expect(hasCompleted).toBe(false);
    });

    it('sorts by datetime ascending (soonest first)', async () => {
      const events = await eventsService.getUpcomingEvents();
      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].datetime).getTime();
        const curr = new Date(events[i].datetime).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('events have required fields for display', async () => {
      const events = await eventsService.getUpcomingEvents();
      const event = events[0];
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('slug');
      expect(event).toHaveProperty('title');
      expect(event).toHaveProperty('datetime');
      expect(event).toHaveProperty('location');
      expect(event).toHaveProperty('hostId');
      expect(event).toHaveProperty('hostName');
      expect(event).toHaveProperty('hostSlug');
      expect(event).toHaveProperty('status');
    });
  });

  describe('getPastEvents', () => {
    it('returns array of events', async () => {
      const events = await eventsService.getPastEvents();
      expect(Array.isArray(events)).toBe(true);
    });

    it('includes completed events', async () => {
      const events = await eventsService.getPastEvents();
      const hasCompleted = events.some(e => e.status === 'completed');
      expect(hasCompleted).toBe(true);
    });

    it('does NOT include upcoming events', async () => {
      const events = await eventsService.getPastEvents();
      const hasUpcoming = events.some(e => e.status === 'upcoming');
      expect(hasUpcoming).toBe(false);
    });

    it('sorts by datetime descending (most recent first)', async () => {
      const events = await eventsService.getPastEvents();
      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].datetime).getTime();
        const curr = new Date(events[i].datetime).getTime();
        expect(curr).toBeLessThanOrEqual(prev);
      }
    });
  });

  describe('getEventBySlug', () => {
    it('returns event for valid slug', async () => {
      const event = await eventsService.getEventBySlug('clarity-hike-golden-gate-2026-01-20');
      expect(event).not.toBeNull();
      expect(event?.title).toContain('Clarity Hike');
    });

    it('returns null for non-existent slug', async () => {
      const event = await eventsService.getEventBySlug('this-event-does-not-exist');
      expect(event).toBeNull();
    });
  });
});

describe('Events Service - User Relationships', () => {
  describe('isUserRsvpd', () => {
    it("returns true for RSVP'd events", async () => {
      // evt-4 is in mockCurrentUser.rsvpdEventIds
      const isRsvpd = await eventsService.isUserRsvpd('evt-4', mockCurrentUser.id);
      expect(isRsvpd).toBe(true);
    });

    it("returns false for non-RSVP'd events", async () => {
      // evt-9 is NOT in mockCurrentUser.rsvpdEventIds
      const isRsvpd = await eventsService.isUserRsvpd('evt-9', mockCurrentUser.id);
      expect(isRsvpd).toBe(false);
    });

    it('returns true for events user cancelled attendance (if still in list)', async () => {
      // evt-7 (cancelled workshop) - user was RSVP'd
      const isRsvpd = await eventsService.isUserRsvpd('evt-7', mockCurrentUser.id);
      expect(isRsvpd).toBe(true);
    });
  });
});

describe('Events Service - Capacity', () => {
  describe('isEventFull', () => {
    it('returns true when attendees >= maxAttendees', async () => {
      const fullEvent = await eventsService.getEventBySlug('sensemaking-workshop-2026-01-22'); // evt-2: 12/12
      expect(fullEvent).not.toBeNull();
      expect(eventsService.isEventFull(fullEvent!)).toBe(true);
    });

    it('returns false when attendees < maxAttendees', async () => {
      const event = await eventsService.getEventBySlug('clarity-hike-golden-gate-2026-01-20'); // evt-1: 8/12
      expect(event).not.toBeNull();
      expect(eventsService.isEventFull(event!)).toBe(false);
    });

    it('returns false when maxAttendees is undefined (unlimited)', async () => {
      const event = await eventsService.getEventBySlug('clarity-coffee-2026-01-18'); // evt-4: unlimited
      expect(event).not.toBeNull();
      expect(event?.maxAttendees).toBeUndefined();
      expect(eventsService.isEventFull(event!)).toBe(false);
    });
  });

  describe('getSpotsRemaining', () => {
    it('returns number when event has capacity limit', async () => {
      const event = await eventsService.getEventBySlug('clarity-hike-golden-gate-2026-01-20'); // 8/12
      expect(event).not.toBeNull();
      expect(eventsService.getSpotsRemaining(event!)).toBe(4);
    });

    it('returns 0 when event is full', async () => {
      const event = await eventsService.getEventBySlug('sensemaking-workshop-2026-01-22'); // 12/12
      expect(event).not.toBeNull();
      expect(eventsService.getSpotsRemaining(event!)).toBe(0);
    });

    it('returns null when unlimited capacity', async () => {
      const event = await eventsService.getEventBySlug('clarity-coffee-2026-01-18');
      expect(event).not.toBeNull();
      expect(eventsService.getSpotsRemaining(event!)).toBeNull();
    });
  });
});

describe('Events Service - Event Statuses', () => {
  it('cancelled events appear in upcoming if future date', async () => {
    const upcoming = await eventsService.getUpcomingEvents();
    const cancelledFuture = upcoming.find(e => e.id === 'evt-7' || e.id === 'evt-8');
    expect(cancelledFuture).not.toBeUndefined();
    expect(cancelledFuture?.status).toBe('cancelled');
  });

  it('completed events appear in past', async () => {
    const past = await eventsService.getPastEvents();
    const completed = past.find(e => e.status === 'completed');
    expect(completed).not.toBeUndefined();
  });
});

describe('Events Service - Host Detection', () => {
  it('current user is host of their events', async () => {
    const event = await eventsService.getEventBySlug('clarity-hike-golden-gate-2026-01-20'); // host-1
    expect(event?.hostId).toBe(mockCurrentUser.id);
  });

  it("current user is NOT host of other's events", async () => {
    const event = await eventsService.getEventBySlug('clarity-coffee-2026-01-18'); // host-2 (Maya)
    expect(event?.hostId).not.toBe(mockCurrentUser.id);
  });
});

describe('Events Service - Mutations', () => {
  describe('createEvent', () => {
    it('creates a new event with correct fields', async () => {
      const input = {
        title: 'Test Event',
        description: 'A test event description',
        datetime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
        durationMinutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Test Location, SF',
        maxAttendees: 10,
      };

      const event = await eventsService.createEvent(input);
      expect(event).not.toBeNull();
      expect(event?.title).toBe(input.title);
      expect(event?.description).toBe(input.description);
      expect(event?.durationMinutes).toBe(input.durationMinutes);
      expect(event?.timezone).toBe(input.timezone);
      expect(event?.location).toBe(input.location);
      expect(event?.maxAttendees).toBe(input.maxAttendees);
      expect(event?.status).toBe('upcoming');
      expect(event?.hostId).toBe(mockCurrentUser.id);
    });

    it('generates a slug from title', async () => {
      const input = {
        title: 'My Awesome Event!',
        description: 'Description',
        datetime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        timezone: 'UTC',
        location: 'Somewhere',
      };

      const event = await eventsService.createEvent(input);
      expect(event?.slug).toContain('my-awesome-event');
    });
  });

  describe('updateEvent', () => {
    it('updates event title for host-owned event', async () => {
      // Get a host-owned event
      const events = await eventsService.getUpcomingEvents();
      const hostEvent = events.find(e => e.hostId === mockCurrentUser.id);
      expect(hostEvent).not.toBeUndefined();

      const originalTitle = hostEvent!.title;
      const result = await eventsService.updateEvent(hostEvent!.id, { title: 'Updated Title' });
      expect(result).toBe(true);

      // Verify update
      const updated = await eventsService.getEventBySlug(hostEvent!.slug);
      expect(updated?.title).toBe('Updated Title');

      // Restore original title
      await eventsService.updateEvent(hostEvent!.id, { title: originalTitle });
    });

    it('returns false for non-host event', async () => {
      // evt-4 is hosted by Maya (host-2), not current user
      const result = await eventsService.updateEvent('evt-4', { title: 'Hacked Title' });
      expect(result).toBe(false);
    });
  });

  describe('cancelEvent', () => {
    it('cancels host-owned event', async () => {
      // Create a new event to cancel (don't mess with existing test data)
      const newEvent = await eventsService.createEvent({
        title: 'Event to Cancel',
        description: 'Will be cancelled',
        datetime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        timezone: 'UTC',
        location: 'Nowhere',
      });
      expect(newEvent).not.toBeNull();

      const result = await eventsService.cancelEvent(newEvent!.id);
      expect(result).toBe(true);

      // Verify status changed
      const cancelled = await eventsService.getEventBySlug(newEvent!.slug);
      expect(cancelled?.status).toBe('cancelled');
    });
  });

  describe('rsvpToEvent', () => {
    it('adds RSVP for valid event', async () => {
      // evt-9 is an event user hasn't RSVP'd to
      const wasRsvpd = await eventsService.isUserRsvpd('evt-9', mockCurrentUser.id);
      expect(wasRsvpd).toBe(false);

      const result = await eventsService.rsvpToEvent('evt-9', mockCurrentUser.id);
      expect(result).toBe(true);

      const isNowRsvpd = await eventsService.isUserRsvpd('evt-9', mockCurrentUser.id);
      expect(isNowRsvpd).toBe(true);

      // Cleanup - cancel the RSVP
      await eventsService.cancelRsvp('evt-9', mockCurrentUser.id);
    });

    it('returns false for cancelled event', async () => {
      // evt-8 is a cancelled event
      const result = await eventsService.rsvpToEvent('evt-8', mockCurrentUser.id);
      expect(result).toBe(false);
    });

    it('returns false if already RSVP\'d', async () => {
      // evt-4 is already in rsvpdEventIds
      const result = await eventsService.rsvpToEvent('evt-4', mockCurrentUser.id);
      expect(result).toBe(false);
    });
  });

  describe('cancelRsvp', () => {
    it('removes RSVP for RSVP\'d event', async () => {
      // First RSVP to an event
      await eventsService.rsvpToEvent('evt-9', mockCurrentUser.id);
      const wasRsvpd = await eventsService.isUserRsvpd('evt-9', mockCurrentUser.id);
      expect(wasRsvpd).toBe(true);

      // Cancel RSVP
      const result = await eventsService.cancelRsvp('evt-9', mockCurrentUser.id);
      expect(result).toBe(true);

      const isNowRsvpd = await eventsService.isUserRsvpd('evt-9', mockCurrentUser.id);
      expect(isNowRsvpd).toBe(false);
    });

    it('returns false for non-RSVP\'d event', async () => {
      // evt-10 is not in rsvpdEventIds
      const result = await eventsService.cancelRsvp('evt-10', mockCurrentUser.id);
      expect(result).toBe(false);
    });
  });
});
