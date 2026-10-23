/**
 * @file p1545-received-letters-paging.test.ts
 * @description P1545 Codex finding 2: Shared with you must list EVERY letter delivered to the person.
 *   get_inbox_items trims a mixed list to 20 rows, so letters fell off behind sender activity. The service
 *   reads get_received_letters_page, newest first, page by page (keyset), up to a documented bound.
 *   getInboxItems keeps its own behaviour for its other callers (the 20-row cap stays).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() }, rpc: vi.fn() },
}));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
  throwDbError: vi.fn((_c: string, _e: unknown, message: string) => {
    throw new Error(message);
  }),
}));

import { supabase } from '@/lib/supabase';
import {
  getAllReceivedLetters,
  getInboxItems,
  RECEIVED_LETTERS_PAGE_SIZE,
  RECEIVED_LETTERS_MAX_PAGES,
} from '@/app/data/letters-service';

const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn>; auth: { getSession: ReturnType<typeof vi.fn> } }).rpc;
const getSession = (supabase as unknown as { auth: { getSession: ReturnType<typeof vi.fn> } }).auth.getSession;

const row = (n: number) => ({
  type: 'received',
  delivery_id: `d${n}`,
  letter_id: `l${n}`,
  title: `Letter ${n}`,
  actor_name: 'Mara',
  actor_slug: 'mara',
  // newest first: a higher n is older
  timestamp: new Date(Date.UTC(2026, 9, 1) - n * 60_000).toISOString(),
  read_at: null,
  completed_at: null,
});
const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => row(from + i));

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReset();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null });
});

describe('getAllReceivedLetters', () => {
  it('returns more than 20 letters (no silent 20 cap), paging by the last row', async () => {
    const all = rows(0, 250);
    rpc.mockImplementation(async (name: string, args: { p_limit: number; p_before_ts: string | null; p_before_id: string | null }) => {
      expect(name).toBe('get_received_letters_page');
      const start = args.p_before_id ? all.findIndex(r => r.delivery_id === args.p_before_id) + 1 : 0;
      return { data: all.slice(start, start + args.p_limit), error: null };
    });
    const items = await getAllReceivedLetters('me');
    expect(items).toHaveLength(250);
    expect(items.map(i => i.delivery_id)).toEqual(all.map(r => r.delivery_id));
    expect(items[0]).toMatchObject({ type: 'received', title: 'Letter 0', actor_name: 'Mara', actor_slug: 'mara', read_at: null });
    // second call carried the keyset of the last row of the first page
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_before_id: `d${RECEIVED_LETTERS_PAGE_SIZE - 1}`, p_before_ts: all[RECEIVED_LETTERS_PAGE_SIZE - 1]?.timestamp });
    // 250 rows = pages of 100, 100, 50: the short page ends the walk
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it('CONTROL: a person with few letters needs one call', async () => {
    rpc.mockResolvedValue({ data: rows(0, 3), error: null });
    expect(await getAllReceivedLetters('me')).toHaveLength(3);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('an empty inbox is an empty list, one call', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getAllReceivedLetters('me')).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('stops at the documented bound (pages x page size), newest first', async () => {
    rpc.mockImplementation(async (_n: string, args: { p_limit: number }) => ({ data: rows(rpc.mock.calls.length * 1000, args.p_limit), error: null }));
    const items = await getAllReceivedLetters('me');
    expect(rpc).toHaveBeenCalledTimes(RECEIVED_LETTERS_MAX_PAGES);
    expect(items).toHaveLength(RECEIVED_LETTERS_MAX_PAGES * RECEIVED_LETTERS_PAGE_SIZE);
    expect(RECEIVED_LETTERS_MAX_PAGES * RECEIVED_LETTERS_PAGE_SIZE).toBeGreaterThanOrEqual(1000);
  });

  it('a failed page throws (a failed fetch is not an empty inbox)', async () => {
    rpc.mockResolvedValueOnce({ data: rows(0, RECEIVED_LETTERS_PAGE_SIZE), error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: '500' } });
    await expect(getAllReceivedLetters('me')).rejects.toThrow(/boom/);
  });
});

describe('getInboxItems is unchanged for its other callers', () => {
  it('still returns at most 20 rows of the mixed list', async () => {
    rpc.mockResolvedValue({ data: rows(0, 30), error: null });
    const items = await getInboxItems('me');
    expect(items).toHaveLength(20);
    expect(rpc).toHaveBeenCalledWith('get_inbox_items');
  });
});
