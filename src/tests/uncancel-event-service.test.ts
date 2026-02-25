/**
 * @file uncancel-event-service.test.ts
 * Unit tests for P437: uncancelEvent service method.
 *
 * Mirrors the cancelEvent test structure exactly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventsService } from '@/app/data/events-service.interface';

// Mock Supabase client (shared setup mirrors events-service-real.test.ts)
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: mockUpdate,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      getUser: () => mockGetUser(),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

describe('realEventsService.uncancelEvent', () => {
  let realEventsService: EventsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/events-service-real');
    realEventsService = module.realEventsService;
  });

  it('returns true when event uncancelled by host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'evt-1' }], error: null }),
        }),
      }),
    });

    const success = await realEventsService.uncancelEvent('evt-1');

    expect(success).toBe(true);
  });

  it('returns false when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const success = await realEventsService.uncancelEvent('evt-1');

    expect(success).toBe(false);
  });

  it('returns false when user is not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });

    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const success = await realEventsService.uncancelEvent('evt-1');

    expect(success).toBe(false);
  });

  it('returns false on DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    });

    const success = await realEventsService.uncancelEvent('evt-1');

    expect(success).toBe(false);
  });

  it('sets status to upcoming (not any other status)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    let capturedUpdate: Record<string, unknown> | null = null;
    mockUpdate.mockImplementation((data: Record<string, unknown>) => {
      capturedUpdate = data;
      return {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'evt-1' }], error: null }),
          }),
        }),
      };
    });

    await realEventsService.uncancelEvent('evt-1');

    expect(capturedUpdate).toMatchObject({ status: 'upcoming' });
  });
});
