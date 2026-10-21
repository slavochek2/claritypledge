/**
 * P1515: what a canvas shows follows who is admitted, and admission follows group membership, event registrations and
 * the event's status. A write to any of them must clear the list-return cache (success or failure), or Back serves a
 * canvas read under the old admission. Each writer below is called once with a success answer and once with a failure
 * answer; the cache generation must advance both times. (The drift guard, p1364, asserts the same statically.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listReturnCacheGeneration } from '@/lib/list-return-cache';

const answer = vi.hoisted(() => ({ write: {} as Record<string, unknown> }));
const WRITE_CALLS = new Set(['insert', 'update', 'delete', 'upsert']);
/** A builder chain that records which calls were made. Awaited, a chain holding a write call answers with `answer.write`;
 *  a read answers with what the page would find (an event that exists and is upcoming and owned by u1; nobody registered). */
const chain = (table: string, path: string[] = []): unknown => new Proxy(() => undefined, {
  get: (_t, prop) => {
    if (prop === 'then') {
      return (resolve: (v: unknown) => void) => resolve(
        path.some(p => WRITE_CALLS.has(p))
          ? answer.write
          : { data: table === 'events' ? { id: 'e1', host_id: 'u1', max_attendees: null, status: 'upcoming' } : null, error: null, status: 200, count: 0 },
      );
    }
    return (..._args: unknown[]) => chain(table, [...path, String(prop)]);
  },
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => chain(table),
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    },
  },
}));
vi.mock('@/lib/session-guard', () => ({
  guardSeatWrite: async () => true,
  clientHoldsUser: async () => true,
  isAnonymousRlsDenial: () => false,
  SessionMismatchError: class SessionMismatchError extends Error {},
}));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: vi.fn() }));
vi.mock('@/app/data/db-error-logger', () => ({ logDbError: vi.fn(), throwDbError: vi.fn() }));
vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn().mockReturnValue(null), fetchUnsplashBanner: vi.fn().mockResolvedValue(null), generateAIBanner: vi.fn(),
}));

import { organizationsService } from '@/app/data/organizations-service';
import { realEventsService } from '@/app/data/events-service-real';
import * as api from '@/app/data/api';

const OK = { data: [{ id: 'r1', user_id: 'u1', terms_version: '1' }], error: null, status: 200, count: 0 };
const FAIL = { data: null, error: { code: 'XX000', message: 'boom' }, status: 500, count: 0 };

const writers: Array<[string, () => Promise<unknown>]> = [
  ['organizations: leaveOrganization', () => organizationsService.leaveOrganization('o1')],
  ['organizations: joinOrganization', () => organizationsService.joinOrganization('o1')],
  ['events-service-real: rsvpToEvent', () => realEventsService.rsvpToEvent('e1', 'u1')],
  ['events-service-real: cancelRsvp', () => realEventsService.cancelRsvp('e1', 'u1')],
  ['events-service-real: cancelEvent', () => realEventsService.cancelEvent('e1')],
  ['events-service-real: uncancelEvent', () => realEventsService.uncancelEvent('e1')],
  ['api: rsvpToEvent', () => api.rsvpToEvent('e1', 'u1')],
  ['api: cancelRsvp', () => api.cancelRsvp('e1', 'u1')],
  ['api: cancelEvent', () => api.cancelEvent('e1')],
];

beforeEach(() => { answer.write = OK; });

describe.each([['a success answer', OK], ['a failure answer', FAIL]] as const)('with %s', (_label, result) => {
  it.each(writers)('%s clears the Back cache', async (_name, write) => {
    answer.write = result;
    const before = listReturnCacheGeneration();
    await write().catch(() => undefined); // a failing write may throw or return false: the clear is the point
    expect(listReturnCacheGeneration(), 'the cache generation advanced').toBeGreaterThan(before);
  });
});

describe('CONTROL: a call that writes nothing does not clear', () => {
  it('reading my memberships leaves the generation alone', async () => {
    const before = listReturnCacheGeneration();
    await organizationsService.getMyMembershipOrgIds().catch(() => undefined);
    expect(listReturnCacheGeneration()).toBe(before);
  });
});
