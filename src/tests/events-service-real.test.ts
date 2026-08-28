import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventsService } from '@/app/data/events-service.interface';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn().mockReturnValue(null),
  fetchUnsplashBanner: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

describe('realEventsService', () => {
  let realEventsService: EventsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to get fresh module with mocks
    const module = await import('@/app/data/events-service-real');
    realEventsService = module.realEventsService;
  });

  describe('getUpcomingEvents', () => {
    it('returns array of events with host info', async () => {
      const mockDbEvents = [
        {
          id: 'evt-1',
          slug: 'test-event',
          title: 'Test Event',
          description: 'A test event',
          datetime: '2026-02-01T18:00:00Z',
          duration_minutes: 120,
          timezone: 'America/Los_Angeles',
          location: 'Test Location',
          host_id: 'user-1',
          max_attendees: 10,
          created_at: '2026-01-01T00:00:00Z',
          status: 'upcoming',
          host: {
            id: 'user-1',
            full_name: 'Test Host',
            slug: 'test-host',
            headline: 'Event Organizer',
            avatar_color: '#3B82F6',
            avatar_url: null,
          },
        },
      ];

      // First call: select events
      // Second call: select RSVP counts
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Events query - now uses .in() for status filter
          return {
            gte: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockDbEvents, error: null }),
              }),
            }),
          };
        } else {
          // RSVP counts query
          return {
            in: vi.fn().mockResolvedValue({ data: [{ event_id: 'evt-1' }], error: null }),
          };
        }
      });

      const events = await realEventsService.getUpcomingEvents();

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(1);
      expect(events[0]).toMatchObject({
        id: 'evt-1',
        slug: 'test-event',
        title: 'Test Event',
        hostId: 'user-1',
        hostName: 'Test Host',
        hostSlug: 'test-host',
        durationMinutes: 120,
      });
    });

    it('returns empty array on error', async () => {
      mockSelect.mockReturnValue({
        gte: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      });

      const events = await realEventsService.getUpcomingEvents();

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(0);
    });
  });

  // P1060: org-scoped queries. getUpcomingEvents/getPastEvents gain an optional
  // org filter (Solution item 4) — the standalone /events call site passes none.
  //
  // TIGHTENED BY /dev (the pin recorded this row as "weak red"): the original
  // fixture nested hand-built objects in a fixed method order, so it failed with
  // `Cannot read properties of undefined (reading 'map')` — the mock's chain never
  // resolving — rather than because an assertion about org filtering fired. That
  // is a test failing for the wrong reason, which proves nothing when it later
  // passes. Replaced with a CHAINABLE recording builder: every PostgREST filter
  // returns the same object, the object is awaitable, and each call is logged. The
  // assertion that had to survive is unchanged and is now the only thing that can
  // fail — exactly one .eq('org_id', <value>) when an org id is passed, and none
  // at all when it is omitted.
  function makeQueryRecorder(rows: unknown[] = []) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'gte', 'lte', 'in', 'or', 'order', 'eq', 'limit']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    }
    // Awaitable: PostgREST builders are thenables, and the service awaits the chain
    // rather than calling a terminal method.
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return { builder, calls };
  }

  describe('getUpcomingEvents with org filter (P1060)', () => {
    it('applies exactly one .eq("org_id", <id>) when an org id is passed', async () => {
      const { builder, calls } = makeQueryRecorder([]);
      mockSelect.mockReturnValue(builder);

      await realEventsService.getUpcomingEvents('org-uuid-cm');

      const orgEqCalls = calls.filter((c) => c.method === 'eq' && c.args[0] === 'org_id');
      expect(orgEqCalls, 'exactly one org_id filter must be applied').toHaveLength(1);
      expect(orgEqCalls[0].args[1]).toBe('org-uuid-cm');
    });

    it('omitting the org id applies NO org filter (standalone /events unaffected)', async () => {
      const { builder, calls } = makeQueryRecorder([]);
      mockSelect.mockReturnValue(builder);

      const events = await realEventsService.getUpcomingEvents();

      expect(Array.isArray(events)).toBe(true);
      expect(
        calls.filter((c) => c.method === 'eq' && c.args[0] === 'org_id'),
        'no org filter must be applied when orgId is omitted — this is the ALLOWED path gate 7c protects',
      ).toHaveLength(0);
    });
  });

  describe('getPastEvents with org filter (P1060)', () => {
    it('applies exactly one .eq("org_id", <id>) when an org id is passed', async () => {
      const { builder, calls } = makeQueryRecorder([]);
      mockSelect.mockReturnValue(builder);

      await realEventsService.getPastEvents('org-uuid-online');

      const orgEqCalls = calls.filter((c) => c.method === 'eq' && c.args[0] === 'org_id');
      expect(orgEqCalls).toHaveLength(1);
      expect(orgEqCalls[0].args[1]).toBe('org-uuid-online');
    });

    it('omitting the org id applies NO org filter', async () => {
      const { builder, calls } = makeQueryRecorder([]);
      mockSelect.mockReturnValue(builder);

      await realEventsService.getPastEvents();

      expect(calls.filter((c) => c.method === 'eq' && c.args[0] === 'org_id')).toHaveLength(0);
    });
  });

  describe('getEventBySlug', () => {
    it('returns null for non-existent event', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      });

      const event = await realEventsService.getEventBySlug('non-existent-slug');

      expect(event).toBeNull();
    });

    it('returns event with host info for valid slug', async () => {
      const mockDbEvent = {
        id: 'evt-1',
        slug: 'test-event',
        title: 'Test Event',
        description: 'A test event',
        datetime: '2026-02-01T18:00:00Z',
        duration_minutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Test Location',
        host_id: 'user-1',
        max_attendees: 10,
        created_at: '2026-01-01T00:00:00Z',
        status: 'upcoming',
        host: {
          id: 'user-1',
          full_name: 'Test Host',
          slug: 'test-host',
          headline: 'Organizer',
          avatar_color: '#3B82F6',
          avatar_url: null,
        },
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockDbEvent, error: null }),
        }),
      });

      const event = await realEventsService.getEventBySlug('test-event');

      expect(event).not.toBeNull();
      expect(event?.slug).toBe('test-event');
      expect(event?.hostName).toBe('Test Host');
    });
  });

  describe('getEventAttendees', () => {
    it('returns array of attendees', async () => {
      const mockRsvps = [
        {
          profile_id: 'user-2',
          profile: {
            id: 'user-2',
            full_name: 'Attendee One',
            slug: 'attendee-one',
            avatar_color: '#10B981',
            avatar_url: null,
          },
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: mockRsvps, error: null }),
      });

      const attendees = await realEventsService.getEventAttendees('evt-1');

      expect(Array.isArray(attendees)).toBe(true);
      expect(attendees.length).toBe(1);
      expect(attendees[0]).toMatchObject({
        profileId: 'user-2',
        name: 'Attendee One',
        slug: 'attendee-one',
      });
    });
  });

  describe('isUserRsvpd', () => {
    it('returns true when user has RSVP', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'rsvp-1' }, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'rsvp-1' }, error: null }),
          }),
        }),
      });

      const isRsvpd = await realEventsService.isUserRsvpd('evt-1', 'user-1');

      expect(isRsvpd).toBe(true);
    });

    it('returns false when user has no RSVP', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      const isRsvpd = await realEventsService.isUserRsvpd('evt-1', 'user-1');

      expect(isRsvpd).toBe(false);
    });
  });

  describe('isEventFull', () => {
    it('returns false when no max attendees set', () => {
      const event = {
        id: 'evt-1',
        slug: 'test',
        title: 'Test',
        description: 'Desc',
        datetime: '2026-02-01T18:00:00Z',
        durationMinutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Loc',
        hostId: 'user-1',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'upcoming' as const,
        hostName: 'Host',
        hostSlug: 'host',
        attendeeCount: 5,
      };

      expect(realEventsService.isEventFull(event)).toBe(false);
    });

    it('returns true when attendee count equals max', () => {
      const event = {
        id: 'evt-1',
        slug: 'test',
        title: 'Test',
        description: 'Desc',
        datetime: '2026-02-01T18:00:00Z',
        durationMinutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Loc',
        hostId: 'user-1',
        maxAttendees: 5,
        createdAt: '2026-01-01T00:00:00Z',
        status: 'upcoming' as const,
        hostName: 'Host',
        hostSlug: 'host',
        attendeeCount: 5,
      };

      expect(realEventsService.isEventFull(event)).toBe(true);
    });
  });

  describe('getSpotsRemaining', () => {
    it('returns null when no max attendees', () => {
      const event = {
        id: 'evt-1',
        slug: 'test',
        title: 'Test',
        description: 'Desc',
        datetime: '2026-02-01T18:00:00Z',
        durationMinutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Loc',
        hostId: 'user-1',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'upcoming' as const,
        hostName: 'Host',
        hostSlug: 'host',
      };

      expect(realEventsService.getSpotsRemaining(event)).toBeNull();
    });

    it('returns correct spots when max set', () => {
      const event = {
        id: 'evt-1',
        slug: 'test',
        title: 'Test',
        description: 'Desc',
        datetime: '2026-02-01T18:00:00Z',
        durationMinutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Loc',
        hostId: 'user-1',
        maxAttendees: 10,
        createdAt: '2026-01-01T00:00:00Z',
        status: 'upcoming' as const,
        hostName: 'Host',
        hostSlug: 'host',
        attendeeCount: 3,
      };

      expect(realEventsService.getSpotsRemaining(event)).toBe(7);
    });
  });

  describe('createEvent', () => {
    it('creates event and returns it', async () => {
      const mockCreatedEvent = {
        id: 'evt-new',
        slug: 'new-event-2026-01-19',
        title: 'New Event',
        description: 'Description',
        datetime: '2026-02-15T18:00:00Z',
        duration_minutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Location',
        host_id: 'user-1',
        max_attendees: null,
        created_at: '2026-01-19T00:00:00Z',
        status: 'upcoming',
        host: {
          id: 'user-1',
          full_name: 'Test Host',
          slug: 'test-host',
          headline: null,
          avatar_color: '#3B82F6',
          avatar_url: null,
        },
      };

      // Mock authenticated user
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCreatedEvent, error: null }),
        }),
      });

      const result = await realEventsService.createEvent({
        title: 'New Event',
        description: 'Description',
        datetime: '2026-02-15T18:00:00Z',
        durationMinutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Location',
      });

      expect(result).not.toBeNull();
      expect(result?.title).toBe('New Event');
      expect(result?.slug).toBe('new-event-2026-01-19');
    });

    it('returns null when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await realEventsService.createEvent({
        title: 'New Event',
        description: 'Description',
        datetime: '2026-02-15T18:00:00Z',
        durationMinutes: 120,
        timezone: 'America/Los_Angeles',
        location: 'Location',
      });

      expect(result).toBeNull();
    });
  });

  describe('rsvpToEvent', () => {
    it('returns true on successful RSVP', async () => {
      // Mock the event lookup (capacity check)
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'evt-1', max_attendees: 10, status: 'upcoming' },
            error: null,
          }),
        }),
      });
      // Mock the attendee count check
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
      });
      // Mock the RSVP insert
      mockInsert.mockResolvedValue({ data: { id: 'rsvp-1' }, error: null });

      const success = await realEventsService.rsvpToEvent('evt-1', 'user-1');

      expect(success).toBe(true);
    });

    it('returns false on duplicate RSVP', async () => {
      // Mock the event lookup (capacity check)
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'evt-1', max_attendees: 10, status: 'upcoming' },
            error: null,
          }),
        }),
      });
      // Mock the attendee count check
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
      });
      // Mock duplicate RSVP error
      mockInsert.mockResolvedValue({ data: null, error: { code: '23505' } });

      const success = await realEventsService.rsvpToEvent('evt-1', 'user-1');

      expect(success).toBe(false);
    });

    it('returns false when event is full', async () => {
      // Mock the event lookup (capacity check)
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'evt-1', max_attendees: 10, status: 'upcoming' },
            error: null,
          }),
        }),
      });
      // Mock the attendee count at capacity
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ count: 10, error: null }),
      });

      const success = await realEventsService.rsvpToEvent('evt-1', 'user-1');

      expect(success).toBe(false);
    });

    it('returns false for cancelled event', async () => {
      // Mock cancelled event lookup
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'evt-1', max_attendees: 10, status: 'cancelled' },
            error: null,
          }),
        }),
      });

      const success = await realEventsService.rsvpToEvent('evt-1', 'user-1');

      expect(success).toBe(false);
    });
  });

  describe('cancelRsvp', () => {
    it('returns true on successful cancel', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const success = await realEventsService.cancelRsvp('evt-1', 'user-1');

      expect(success).toBe(true);
    });
  });

  describe('cancelEvent', () => {
    it('returns true when event cancelled by host', async () => {
      // Mock authenticated user (the host)
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      // Mock update with host_id check returning the updated row
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'evt-1' }], error: null }),
          }),
        }),
      });

      const success = await realEventsService.cancelEvent('evt-1');

      expect(success).toBe(true);
    });

    it('returns false when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const success = await realEventsService.cancelEvent('evt-1');

      expect(success).toBe(false);
    });

    it('returns false when user is not the host', async () => {
      // Mock authenticated user (not the host)
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });

      // Mock update with host_id check returning no rows (user not the host)
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const success = await realEventsService.cancelEvent('evt-1');

      expect(success).toBe(false);
    });
  });

  describe('updateEvent', () => {
    it('returns true when event updated by host', async () => {
      // Mock authenticated user (the host)
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      // Mock update with host_id check returning the updated row
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'evt-1' }], error: null }),
          }),
        }),
      });

      const success = await realEventsService.updateEvent('evt-1', { title: 'Updated Title' });

      expect(success).toBe(true);
    });

    it('returns false when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const success = await realEventsService.updateEvent('evt-1', { title: 'Updated Title' });

      expect(success).toBe(false);
    });

    it('returns false when user is not the host', async () => {
      // Mock authenticated user (not the host)
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });

      // Mock update with host_id check returning no rows (user not the host)
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const success = await realEventsService.updateEvent('evt-1', { title: 'Updated Title' });

      expect(success).toBe(false);
    });
  });
});
