import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * P494: Event grace period tests
 *
 * Events should stay in "upcoming" for EVENT_GRACE_HOURS after their start time.
 * This prevents latecomers from losing the event during/after the run.
 */

// Mock Supabase client — capture the datetime cutoff passed to .gte() and .or()
const mockGte = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockIn = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn().mockReturnValue(null),
  fetchUnsplashBanner: vi.fn().mockResolvedValue(null),
  generateAIBanner: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/event-emails', () => ({
  invokeEventEmails: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  },
}));

describe('P494: Event grace period', () => {
  let realEventsService: Awaited<typeof import('@/app/data/events-service-real')>['realEventsService'];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Chain: from().select().gte().in().order() for getUpcomingEvents
    // Chain: from().select().or().order() for getPastEvents
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockIn.mockReturnValue({ order: mockOrder });
    mockGte.mockReturnValue({ in: mockIn });
    mockOr.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ gte: mockGte, or: mockOr });
    mockFrom.mockReturnValue({ select: mockSelect });

    const module = await import('@/app/data/events-service-real');
    realEventsService = module.realEventsService;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getUpcomingEvents — grace period cutoff', () => {
    it('uses a cutoff 5 hours before now (not now itself)', async () => {
      // Set "now" to 2026-03-12T15:00:00Z
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getUpcomingEvents();

      // The .gte('datetime', cutoff) call should use now - 5 hours
      expect(mockGte).toHaveBeenCalledWith(
        'datetime',
        expect.any(String)
      );

      const cutoffArg = mockGte.mock.calls[0][1] as string;
      const cutoffDate = new Date(cutoffArg);
      const expectedCutoff = new Date('2026-03-12T10:00:00.000Z');

      // Cutoff should be ~5 hours before "now"
      const diffMs = Math.abs(cutoffDate.getTime() - expectedCutoff.getTime());
      expect(diffMs).toBeLessThan(1000); // within 1 second tolerance
    });

    it('event started 2 hours ago still appears in upcoming', async () => {
      // "Now" = 15:00, event started at 13:00 → 2h ago, well within 5h grace
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getUpcomingEvents();

      const cutoffArg = mockGte.mock.calls[0][1] as string;
      const cutoffDate = new Date(cutoffArg);
      const eventStart = new Date('2026-03-12T13:00:00Z');

      // Event datetime (13:00) should be >= cutoff (10:00) → included
      expect(eventStart.getTime()).toBeGreaterThanOrEqual(cutoffDate.getTime());
    });

    it('event started 4.5 hours ago still appears in upcoming', async () => {
      // "Now" = 15:00, event at 10:30 → 4.5h ago, still within 5h grace
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getUpcomingEvents();

      const cutoffArg = mockGte.mock.calls[0][1] as string;
      const cutoffDate = new Date(cutoffArg);
      const eventStart = new Date('2026-03-12T10:30:00Z');

      // Event datetime (10:30) >= cutoff (10:00) → included
      expect(eventStart.getTime()).toBeGreaterThanOrEqual(cutoffDate.getTime());
    });

    it('event started 6 hours ago does NOT appear in upcoming', async () => {
      // "Now" = 15:00, event at 09:00 → 6h ago, past the 5h grace
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getUpcomingEvents();

      const cutoffArg = mockGte.mock.calls[0][1] as string;
      const cutoffDate = new Date(cutoffArg);
      const eventStart = new Date('2026-03-12T09:00:00Z');

      // Event datetime (09:00) < cutoff (10:00) → excluded
      expect(eventStart.getTime()).toBeLessThan(cutoffDate.getTime());
    });

    it('event starting in the future still appears (grace does not break future events)', async () => {
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getUpcomingEvents();

      const cutoffArg = mockGte.mock.calls[0][1] as string;
      const cutoffDate = new Date(cutoffArg);
      const futureEvent = new Date('2026-03-15T18:00:00Z');

      // Future event datetime >> cutoff → included
      expect(futureEvent.getTime()).toBeGreaterThan(cutoffDate.getTime());
    });
  });

  describe('getPastEvents — grace period cutoff', () => {
    it('uses a cutoff 5 hours before now in the past filter', async () => {
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getPastEvents();

      // The .or() filter should reference a grace cutoff, not raw `now`
      expect(mockOr).toHaveBeenCalledWith(
        expect.any(String)
      );

      const orFilter = mockOr.mock.calls[0][0] as string;

      // The filter should contain a datetime from ~5 hours ago (10:00), not 15:00
      // Extract ISO datetime: YYYY-MM-DDTHH:MM:SS.mmmZ
      const datetimeMatch = orFilter.match(/datetime\.lt\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
      expect(datetimeMatch).not.toBeNull();

      const filterDate = new Date(datetimeMatch![1]);
      const expectedCutoff = new Date('2026-03-12T10:00:00.000Z');

      const diffMs = Math.abs(filterDate.getTime() - expectedCutoff.getTime());
      expect(diffMs).toBeLessThan(1000);
    });

    it('event started 2 hours ago does NOT appear in past (still in grace)', async () => {
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getPastEvents();

      const orFilter = mockOr.mock.calls[0][0] as string;
      const datetimeMatch = orFilter.match(/datetime\.lt\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
      expect(datetimeMatch).not.toBeNull();

      const cutoffDate = new Date(datetimeMatch![1]);
      const recentEvent = new Date('2026-03-12T13:00:00Z');

      // Event at 13:00 is NOT < cutoff (10:00) → excluded from past
      expect(recentEvent.getTime()).toBeGreaterThanOrEqual(cutoffDate.getTime());
    });

    it('event started 6 hours ago appears in past (grace expired)', async () => {
      const now = new Date('2026-03-12T15:00:00Z');
      vi.setSystemTime(now);

      await realEventsService.getPastEvents();

      const orFilter = mockOr.mock.calls[0][0] as string;
      const datetimeMatch = orFilter.match(/datetime\.lt\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
      expect(datetimeMatch).not.toBeNull();

      const cutoffDate = new Date(datetimeMatch![1]);
      const oldEvent = new Date('2026-03-12T09:00:00Z');

      // Event at 09:00 < cutoff (10:00) → included in past
      expect(oldEvent.getTime()).toBeLessThan(cutoffDate.getTime());
    });
  });

  describe('Grace period constant', () => {
    it('EVENT_GRACE_HOURS should be exported and equal 5', async () => {
      const module = await import('@/app/data/events-service-real');
      // The constant should be exported for other consumers
      expect((module as Record<string, unknown>).EVENT_GRACE_HOURS).toBe(5);
    });
  });
});
