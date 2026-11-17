/**
 * P1675: the room-count reader and the hike registration writer. Counts are numbers only; a bad payload or an error is null,
 * never a throw. registerForHike maps the server's word through, treats an unknown word as failed, and mails only a new seat.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), emails: vi.fn(), logErr: vi.fn(), anon: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: (...a: unknown[]) => h.emails(...a) }));
vi.mock('@/lib/session-guard', () => ({
  guardSeatWrite: async () => true,
  isAnonymousRlsDenial: (...a: unknown[]) => h.anon(...a),
  SessionMismatchError: class SessionMismatchError extends Error {},
}));
vi.mock('@/app/data/db-error-logger', () => ({ logDbError: (...a: unknown[]) => h.logErr(...a) }));

import { getEventRoomCounts } from '@/app/data/event-room-counts';
import { registerForHike } from '@/app/data/hike-registration';
import { SessionMismatchError } from '@/lib/session-guard';
import type { HikeAnswers } from '@/app/data/hike-answer-model';

beforeEach(() => {
  h.rpc.mockReset(); h.emails.mockReset(); h.logErr.mockReset(); h.anon.mockReset().mockReturnValue(false);
});

describe('getEventRoomCounts', () => {
  it('an attendee payload has only notHere', async () => {
    h.rpc.mockResolvedValue({ data: { not_here: 3 }, error: null });
    expect(await getEventRoomCounts('e1')).toEqual({ notHere: 3 });
    expect(h.rpc).toHaveBeenCalledWith('get_event_room_counts', { p_event: 'e1' });
  });

  it('a host payload carries in, out and undecided, zero included', async () => {
    h.rpc.mockResolvedValue({ data: { not_here: 1, in: 2, out: 0, undecided: 5 }, error: null });
    expect(await getEventRoomCounts('e1')).toEqual({ notHere: 1, in: 2, out: 0, undecided: 5 });
  });

  it.each([
    ['null', null],
    ['empty object', {}],
    ['string count', { not_here: '3' }],
    ['negative count', { not_here: -1 }],
    ['NaN count', { not_here: Number.NaN }],
  ])('a malformed payload (%s) is null', async (_n, data) => {
    h.rpc.mockResolvedValue({ data, error: null });
    expect(await getEventRoomCounts('e1')).toBeNull();
  });

  it('drops a malformed host field but keeps the valid ones', async () => {
    h.rpc.mockResolvedValue({ data: { not_here: 1, in: 'x', out: 2 }, error: null });
    expect(await getEventRoomCounts('e1')).toEqual({ notHere: 1, out: 2 });
  });

  it('an RPC error is null and is logged', async () => {
    const error = { message: 'boom' };
    h.rpc.mockResolvedValue({ data: null, error });
    expect(await getEventRoomCounts('e1')).toBeNull();
    expect(h.logErr).toHaveBeenCalledWith('getEventRoomCounts', error, { eventId: 'e1' });
  });

  it('a thrown rpc is null', async () => {
    h.rpc.mockRejectedValue(new Error('net'));
    expect(await getEventRoomCounts('e1')).toBeNull();
  });
});

const EVENT = { id: 'e1', slug: 'hike-1' };
const ANSWERS: HikeAnswers = { when: 'later', transport: 'car', freeSeats: 3, help: 'other', helpOther: ' carry water ' };

describe('registerForHike', () => {
  it.each(['ok', 'already', 'full', 'cancelled', 'not_found', 'now_only'])('passes %s through', async (word) => {
    h.rpc.mockResolvedValue({ data: word, error: null, status: 200 });
    expect(await registerForHike(EVENT, 'u1', ANSWERS)).toBe(word);
  });

  it.each([['an unknown word', 'weird'], ['null', null], ['a number', 1]])('%s is failed', async (_n, data) => {
    h.rpc.mockResolvedValue({ data, error: null, status: 200 });
    expect(await registerForHike(EVENT, 'u1', ANSWERS)).toBe('failed');
    expect(h.emails).not.toHaveBeenCalled();
  });

  it('an RPC error is failed and logged', async () => {
    const error = { message: 'x' };
    h.rpc.mockResolvedValue({ data: null, error, status: 500 });
    expect(await registerForHike(EVENT, 'u1', ANSWERS)).toBe('failed');
    expect(h.logErr).toHaveBeenCalledWith('registerForHike', error);
  });

  it('an anonymous RLS denial throws SessionMismatchError', async () => {
    h.anon.mockReturnValue(true);
    h.rpc.mockResolvedValue({ data: null, error: { message: 'rls' }, status: 401 });
    await expect(registerForHike(EVENT, 'u1', ANSWERS)).rejects.toBeInstanceOf(SessionMismatchError);
  });

  it('emails only on ok', async () => {
    for (const data of ['already', 'full', 'cancelled', 'not_found', 'now_only']) {
      h.rpc.mockResolvedValueOnce({ data, error: null, status: 200 });
      await registerForHike(EVENT, 'u1', ANSWERS);
    }
    expect(h.emails).not.toHaveBeenCalled();
    h.rpc.mockResolvedValueOnce({ data: 'ok', error: null, status: 200 });
    await registerForHike(EVENT, 'u1', ANSWERS);
    expect(h.emails).toHaveBeenCalledTimes(1);
    expect(h.emails).toHaveBeenCalledWith('rsvp', 'e1', 'u1');
  });

  it('sends the normalized answers as the rpc parameters', async () => {
    h.rpc.mockResolvedValue({ data: 'ok', error: null, status: 200 });
    await registerForHike(EVENT, 'u1', ANSWERS);
    expect(h.rpc).toHaveBeenCalledWith('register_for_hike', {
      p_slug: 'hike-1', p_when: 'later', p_transport: 'car', p_free_seats: 3, p_help: 'other', p_help_other: 'carry water',
    });
  });

  it('drops seats for a non-driver and the other text for another help', async () => {
    h.rpc.mockResolvedValue({ data: 'ok', error: null, status: 200 });
    await registerForHike(EVENT, 'u1', { when: 'now', transport: 'need_ride', freeSeats: 4, help: 'sweep', helpOther: 'junk' });
    expect(h.rpc).toHaveBeenCalledWith('register_for_hike', {
      p_slug: 'hike-1', p_when: 'now', p_transport: 'need_ride', p_free_seats: null, p_help: 'sweep', p_help_other: null,
    });
  });
});
