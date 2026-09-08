/**
 * @file p897-duplicate-rsvp-no-sentry.test.ts
 * @description Canary tests for P897: rsvpToEvent must NOT report the expected
 * duplicate-RSVP unique violation (23505) to Sentry via logDbError.
 *
 * Bug: the error branch called `logDbError('rsvpToEvent', error)` before (and
 * regardless of) classifying the error, so every duplicate RSVP — a double-click
 * race or a stale-state re-invoke — shipped a Sentry error event for a case the
 * code's own inline comment already called expected.
 *
 * Expected after fix: no logDbError for 23505, logDbError still called for any
 * other insert error, and the boolean return value unchanged in both cases
 * (`false`), which is what events-service-real.test.ts already pins.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventsService } from '@/app/data/events-service.interface';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
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
    auth: { getUser: vi.fn() },
  },
}));

const logDbError = vi.fn();
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: (context: string, error: unknown) => logDbError(context, error),
  throwDbError: vi.fn(),
}));

// invokeEventEmails is fire-and-forget; it must not reach the network in a unit test.
vi.mock('@/lib/event-emails', () => ({
  invokeEventEmails: vi.fn(),
}));

/** Capacity check passes: upcoming event, 5 of 10 seats taken. */
function mockCapacityCheckOk() {
  mockSelect.mockReturnValueOnce({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'evt-1', max_attendees: 10, status: 'upcoming' },
        error: null,
      }),
    }),
  });
  mockSelect.mockReturnValueOnce({
    eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
  });
}

describe('P897: duplicate RSVP is not reported to Sentry', () => {
  let realEventsService: EventsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    logDbError.mockClear();
    const module = await import('@/app/data/events-service-real');
    realEventsService = module.realEventsService;
  });

  it('does not call logDbError for a 23505 unique violation', async () => {
    mockCapacityCheckOk();
    mockInsert.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value' } });

    const success = await realEventsService.rsvpToEvent('evt-1', 'user-1');

    expect(logDbError).not.toHaveBeenCalled();
    // Return semantics unchanged — events-service-real.test.ts pins `false` here.
    expect(success).toBe(false);
  });

  it('still calls logDbError for an unexpected insert error', async () => {
    mockCapacityCheckOk();
    const error = { code: '42501', message: 'permission denied for table event_rsvps' };
    mockInsert.mockResolvedValue({ data: null, error });

    const success = await realEventsService.rsvpToEvent('evt-1', 'user-1');

    expect(logDbError).toHaveBeenCalledTimes(1);
    expect(logDbError).toHaveBeenCalledWith('rsvpToEvent', error);
    expect(success).toBe(false);
  });

  it('still calls logDbError for an insert error carrying no code at all', async () => {
    mockCapacityCheckOk();
    const error = { message: 'network unreachable' };
    mockInsert.mockResolvedValue({ data: null, error });

    await realEventsService.rsvpToEvent('evt-1', 'user-1');

    expect(logDbError).toHaveBeenCalledTimes(1);
    expect(logDbError).toHaveBeenCalledWith('rsvpToEvent', error);
  });
});
